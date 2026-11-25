import { Component, computed, inject, signal } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute } from "@angular/router";
import { map } from "rxjs";

import { isApiMode } from "@/lib/api/config";
import { organisationDraft } from "@/lib/coop-request-templates";
import { describeSourceFact, SOURCE_FILTER_IDS, sourceOfRecord, type DataSourceId } from "@/lib/data-source";
import { listOrganisations, orgFromApi } from "@/lib/api/organisations";
import { fetchAllPages } from "@/lib/api/pagination";
import { inScope } from "@/lib/scope";
import { nf } from "@/lib/format";
import type { MessageKey } from "@/lib/i18n";
import type { Org } from "@/lib/mock/data";
import { AppShellComponent } from "@shared/app-shell.component";
import { ContactScoopModalComponent, type CoopRequestTarget } from "@shared/contact-scoop-modal.component";
import { LocaleService } from "@shared/locale.service";
import { PlacementBadgeComponent } from "@shared/placement-badge.component";
import { SourceBadgeComponent } from "@shared/source-badge.component";
import { TransferScoopModalComponent, type TransferRequest } from "@shared/transfer-scoop-modal.component";
import { StoreService } from "@shared/store.service";
import { createPager } from "@shared/pager";
import {
  detailFact,
  detailKpi,
  DetailModalComponent,
  IconComponent,
  initialsOf,
  PaginationComponent,
  SelectComponent,
  StatCardsComponent,
  TONE,
  V2_PAGE_STYLES,
  type DetailView,
  type SelectOption,
  type StatCard,
} from "@shared/ui";
import { GlobalFiltersComponent } from "@shared/global-filters.component";
import { OrganisationDialogComponent } from "@shared/organisation-dialog.component";

const UNQUALIFIED = "__aucun";
const ALL = "__tous";
/** Filtre « Source » : toutes les bases. */
const ALL_SOURCES = "";
const SOURCE_LABEL: Record<DataSourceId, MessageKey> = {
  kobo: "qualite.source.kobo",
  consolidee: "qualite.source.consolidee",
  application: "qualite.source.application",
  cradesc: "qualite.source.cradesc",
};
const norm = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** GIE en bleu (le cas le plus fréquent), les autres types en violet, « à qualifier » en ambre. */
const typeTone = (type: string | null) =>
  !type ? TONE.attente : type === "GIE" ? TONE.info : TONE.culture;

/**
 * Organisations (charte V2) : statistiques, recherche + filtre par type à compteurs, tableau paginé
 * (producteurs, parcelles, fiches à vérifier), détail en modale avec lien vers la fiche.
 * Le filtre SCOOP de l'en-tête (`?scoop=`) s'applique.
 */
@Component({
  selector: "app-organisations-page",
  imports: [
    GlobalFiltersComponent,
    AppShellComponent,
    ContactScoopModalComponent,
    IconComponent,
    DetailModalComponent,
    PaginationComponent,
    StatCardsComponent,
    OrganisationDialogComponent,
    PlacementBadgeComponent,
    SelectComponent,
    SourceBadgeComponent,
    TransferScoopModalComponent,
  ],
  styles: [
    V2_PAGE_STYLES,
    `
      .bulk {
        position: sticky;
        bottom: 16px;
        z-index: 20;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        border-radius: 20px;
        background: var(--v2-foret);
        padding: 10px 10px 10px 18px;
        color: var(--v2-blanc);
        box-shadow: var(--v2-ombre-flottant);
      }
      .bulk .b {
        display: inline-flex;
        height: 40px;
        align-items: center;
        gap: 6px;
        border-radius: 12px;
        padding: 0 14px;
        font-size: 14px;
        font-weight: 800;
        cursor: pointer;
      }
      .tbl input[type="checkbox"] {
        height: 18px;
        width: 18px;
        accent-color: var(--v2-foret);
        cursor: pointer;
      }
    `,
  ],
  template: `
    <app-shell perm="org.read" [area]="t()('organisations.area')">
      <!-- ───── En-tête ───── -->
      <header class="rise flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div class="min-w-0">
          <p class="mono" style="color: var(--v2-gris-texte)">{{ t()("organisations.eyebrow") }}</p>
          <h1 class="mt-2 text-[30px] font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-[38px]">
            {{ t()("organisations.title") }}
          </h1>
          <p class="mt-2 max-w-2xl text-[16px] font-medium" style="color: var(--v2-gris-texte)">
            {{ t()("organisations.lead") }}
          </p>
        </div>
        @if (store.can("org.manage")) {
          <button type="button" class="btn btn-primary ml-auto" (click)="newOpen.set(true)">
            {{ t()("cooperatives.fiche.org.add") }}<span class="btn-chip"><ui-icon name="add" [size]="20" /></span>
          </button>
        }
      </header>

      <!-- ───── Statistiques ───── -->
      <ui-stat-cards class="rise mt-8" [stats]="stats()" />

      <!-- ───── Recherche · type ───── -->
      <div class="toolbar card mt-6">
        <label class="search">
          <ui-icon name="search" [size]="20" />
          <input
            type="search"
            [placeholder]="t()('organisations.search')"
            [attr.aria-label]="t()('organisations.search')"
            [value]="q()"
            (input)="q.set($any($event.target).value)"
          />
        </label>
        <div class="seg" role="radiogroup" [attr.aria-label]="t()('organisations.col.type')">
          @for (typeButton of typeButtons(); track typeButton.id) {
            <button
              type="button"
              role="radio"
              [class.on]="type() === typeButton.id"
              [attr.aria-checked]="type() === typeButton.id"
              (click)="type.set(typeButton.id)"
            >
              {{ typeButton.label
              }}<span class="n" [class.zero]="!typeButton.count">{{
                nf.format(typeButton.count)
              }}</span>
            </button>
          }
        </div>
        <ui-select
          class="min-w-[200px]"
          variant="compact"
          leadingIcon="database"
          [label]="t()('qualite.source.filter.label')"
          [options]="sourceOptions()"
          [value]="source()"
          (valueChange)="source.set($event)"
        />
        <app-global-filters />
      </div>

      <p class="sub mt-4" aria-live="polite">
        {{
          t()(shown().length > 1 ? "organisations.count.autre" : "organisations.count.un", {
            count: nf.format(shown().length),
          })
        }}
      </p>

      <!-- ───── Liste ───── -->
      <section class="card mt-3 overflow-hidden">
        @if (shown().length) {
          <div class="overflow-x-auto">
            <table class="tbl min-w-[980px]">
              <thead>
                <tr>
                  @if (canTransfer()) {
                    <th class="w-10">
                      <input
                        type="checkbox"
                        [checked]="allPageSelected()"
                        [attr.aria-label]="t()('transfert.selectPage')"
                        (change)="togglePage($any($event.target).checked)"
                      />
                    </th>
                  }
                  <th>{{ t()("organisations.col.org") }}</th>
                  <th>{{ t()("organisations.col.type") }}</th>
                  <th>{{ t()("organisations.col.scoop") }}</th>
                  <th>{{ t()("qualite.source.col") }}</th>
                  <th class="text-right">{{ t()("organisations.col.producers") }}</th>
                  <th class="text-right">{{ t()("organisations.col.plots") }}</th>
                  <th class="text-right">{{ t()("producteurs.quality.à vérifier") }}</th>
                  <th class="text-right">{{ t()("organisations.col.actions") }}</th>
                </tr>
              </thead>
              <tbody>
                @for (org of pager.items(); track org.id) {
                  <tr class="row-link" (click)="detailId.set(org.id)">
                    @if (canTransfer()) {
                      <td (click)="$event.stopPropagation()">
                        <input
                          type="checkbox"
                          [checked]="selected().includes(org.id)"
                          [attr.aria-label]="t()('transfert.selectOne', { name: org.name })"
                          (change)="toggle(org.id)"
                        />
                      </td>
                    }
                    <td class="max-w-[280px]">
                      <span class="flex items-center gap-3">
                        <span
                          class="grid size-9 shrink-0 place-items-center rounded-[10px]"
                          [style.background]="org.tone.bg"
                          [style.color]="org.tone.fg"
                          ><ui-icon name="hub" [size]="18"
                        /></span>
                        <span class="min-w-0">
                          <span class="block truncate font-bold">{{ org.name }}</span>
                          <span class="sub block truncate" [class.zero]="!org.village">{{
                            org.village || "—"
                          }}</span>
                          <app-placement-badge [record]="org.record" />
                        </span>
                      </span>
                    </td>
                    <td>
                      <span
                        class="badge"
                        [style.background]="org.tone.bg"
                        [style.color]="org.tone.fg"
                        >{{ org.type ?? t()("organisations.filter.toQualify") }}</span
                      >
                    </td>
                    <td class="max-w-44 truncate font-medium" [title]="org.scoop">
                      {{ org.scoop }}
                    </td>
                    <td><app-source-badge [record]="org.record" [showPlace]="true" /></td>
                    <td
                      class="text-right font-extrabold tabular-nums"
                      [class.zero]="!org.producers"
                    >
                      {{ nf.format(org.producers) }}
                    </td>
                    <td class="text-right font-semibold tabular-nums" [class.zero]="!org.plots">
                      {{ nf.format(org.plots) }}
                    </td>
                    <td class="text-right">
                      @if (org.toVerify) {
                        <span
                          class="badge tabular-nums"
                          style="background: var(--v2-attente-bg); color: var(--v2-attente-fg)"
                          >{{ nf.format(org.toVerify) }}</span
                        >
                      } @else {
                        <span class="zero font-semibold tabular-nums">0</span>
                      }
                    </td>
                    <td>
                      <span class="flex justify-end">
                        <button
                          type="button"
                          class="act"
                          [title]="t()('common.view')"
                          [attr.aria-label]="t()('organisations.view.aria', { name: org.name })"
                          (click)="$event.stopPropagation(); detailId.set(org.id)"
                        >
                          <ui-icon name="visibility" [size]="18" />
                        </button>
                      </span>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <ui-pagination class="px-5 pb-5" [pager]="pager" />
        } @else {
          <div class="flex flex-col items-center gap-3 p-10 text-center">
            <span
              class="grid size-14 place-items-center rounded-[16px]"
              style="background: var(--v2-sauge); color: var(--v2-foret)"
              ><ui-icon name="search" [size]="26"
            /></span>
            <p class="text-[16px] font-extrabold">{{ t()("organisations.empty.none") }}</p>
            <p class="sub">{{ t()("organisations.empty.noneHint") }}</p>
          </div>
        }
      </section>

      <ui-detail-modal [view]="detail()" (closed)="detailId.set(null)">
        @if (canTransfer() && detailId(); as openedId) {
          <button detail-actions type="button" class="btn btn-ghost" (click)="detailId.set(null); openTransfer([openedId])">
            <ui-icon name="apartment" [size]="18" />{{ t()("transfert.single") }}
          </button>
        }
        @if (contactOrg(); as org) {
          <button detail-actions type="button" class="btn btn-ghost" (click)="openContact(org)">
            <ui-icon name="mail" [size]="18" />{{ t()("demandes.action") }}
          </button>
        }
      </ui-detail-modal>
      <ui-contact-scoop-modal
        [open]="contactTargets().length > 0"
        kind="organisation"
        [targets]="contactTargets()"
        [link]="contactLink()"
        (closed)="contactTargets.set([])"
      />
      <app-organisation-dialog [(open)]="newOpen" [scoopId]="scoopFilter() || null" />

      <!-- Actions groupées : transfert vers une coopérative -->
      @if (canTransfer() && selected().length) {
        <div class="bulk mt-4" role="region" [attr.aria-label]="t()('transfert.bar.selected', { count: selected().length })">
          <span class="flex-1 text-[14px] font-extrabold">{{ t()("transfert.bar.selected", { count: selected().length }) }}</span>
          @if (selected().length < shown().length) {
            <button type="button" class="b" style="color: var(--v2-blanc)" (click)="selectAllShown()">
              {{ t()("transfert.bar.selectAll", { count: shown().length }) }}
            </button>
          }
          <button type="button" class="b" style="color: var(--v2-blanc)" (click)="selected.set([])">
            {{ t()("transfert.bar.clear") }}
          </button>
          <button type="button" class="b" style="background: var(--v2-citron); color: var(--v2-foret)" (click)="openTransfer(selected())">
            <ui-icon name="apartment" [size]="16" />{{ t()("transfert.bar.action") }}
          </button>
        </div>
      }
      <app-transfer-scoop-modal
        [request]="transferRequest()"
        (closed)="transferRequest.set(null)"
        (done)="selected.set([])"
      />
    </app-shell>
  `,
})
export default class OrganisationsPage {
  protected readonly store = inject(StoreService);
  protected readonly locale = inject(LocaleService);
  private readonly route = inject(ActivatedRoute);
  protected readonly t = this.locale.t;
  protected readonly nf = nf;
  protected readonly q = signal("");
  protected readonly type = signal<string>(ALL);
  protected readonly detailId = signal<string | null>(null);
  protected readonly newOpen = signal(false);

  constructor() {
    if (isApiMode()) void this.loadFromApi();
  }

  /** Mode API : la liste vient du serveur, pour qu'elle survive au rechargement. */
  private async loadFromApi(): Promise<void> {
    try {
      this.store.actions.replaceOrgsFromApi((await fetchAllPages(listOrganisations)).map(orgFromApi));
    } catch {
      // Serveur injoignable : on garde ce qui est déjà affiché.
    }
  }

  /** Filtre SCOOP de l'en-tête (`?scoop=`). */
  private readonly scoopFilter = toSignal(
    this.route.queryParamMap.pipe(map((m) => m.get("scoop") ?? "")),
    { initialValue: "" },
  );

  /** Organisations du périmètre (et de la SCOOP choisie en en-tête), avec leurs compteurs. */
  private readonly all = computed(() => {
    const s = this.store.state();
    const scoop = this.scoopFilter();
    const producers = new Map<string, number>();
    const toVerify = new Map<string, number>();
    const ownerOrg = new Map<string, string>();
    for (const p of s.producers) {
      if (p.mergedInto) continue;
      producers.set(p.orgId, (producers.get(p.orgId) ?? 0) + 1);
      if (p.quality === "à vérifier") toVerify.set(p.orgId, (toVerify.get(p.orgId) ?? 0) + 1);
      ownerOrg.set(p.id, p.orgId);
    }
    const plots = new Map<string, number>();
    for (const pl of s.plots) {
      const org = ownerOrg.get(pl.producerId);
      if (org) plots.set(org, (plots.get(org) ?? 0) + 1);
    }
    const scoopName = new Map([...s.scoops, ...s.technicalScoops].map((c) => [c.id, c.name]));
    return inScope(s.orgs, s.session)
      .filter((o: Org) => !scoop || o.scoopId === scoop)
      .map((o) => ({
        record: o,
        scoopId: o.scoopId,
        id: o.id,
        name: o.name,
        type: o.type,
        village: o.village,
        scoop: scoopName.get(o.scoopId) ?? o.scoopId,
        tone: typeTone(o.type),
        producers: producers.get(o.id) ?? 0,
        plots: plots.get(o.id) ?? 0,
        toVerify: toVerify.get(o.id) ?? 0,
      }))
      .sort((a, b) => b.producers - a.producers);
  });

  protected readonly typeButtons = computed(() => {
    const t = this.t();
    const all = this.all();
    const counts = new Map<string, number>();
    let unqualified = 0;
    for (const o of all) {
      if (o.type) counts.set(o.type, (counts.get(o.type) ?? 0) + 1);
      else unqualified++;
    }
    return [
      { id: ALL, label: t("producteurs.index.qualityAll"), count: all.length },
      ...[...counts].sort((a, b) => b[1] - a[1]).map(([id, count]) => ({ id, label: id, count })),
      ...(unqualified
        ? [{ id: UNQUALIFIED, label: t("organisations.filter.toQualify"), count: unqualified }]
        : []),
    ];
  });

  /** Filtre « Source » : la base d'origine enregistrée par le serveur (Kobo, consolidée, saisie). */
  protected readonly source = signal<string>(ALL_SOURCES);
  protected readonly sourceOptions = computed<SelectOption[]>(() => [
    { value: ALL_SOURCES, label: this.t()("qualite.source.filter.all") },
    ...SOURCE_FILTER_IDS.map((id) => ({ value: id as string, label: this.t()(SOURCE_LABEL[id]) })),
  ]);

  protected readonly shown = computed(() => {
    const needle = norm(this.q().trim());
    const type = this.type();
    const source = this.source();
    return this.all().filter(
      (o) =>
        (type === ALL || (type === UNQUALIFIED ? !o.type : o.type === type)) &&
        (!source || sourceOfRecord(o.record).id === source) &&
        (!needle || norm(`${o.name} ${o.village} ${o.type ?? ""}`).includes(needle)),
    );
  });

  // ── Transfert vers une coopérative (mode API, droit `scoop.transfer`) ──
  protected readonly canTransfer = computed(() => isApiMode() && this.store.can("scoop.transfer"));
  protected readonly selected = signal<string[]>([]);
  protected readonly transferRequest = signal<TransferRequest | null>(null);

  protected readonly allPageSelected = computed(() => {
    const ids = this.pager.items().map((org) => org.id);
    return ids.length > 0 && ids.every((id) => this.selected().includes(id));
  });

  protected toggle(id: string): void {
    this.selected.update((list) => (list.includes(id) ? list.filter((item) => item !== id) : [...list, id]));
  }

  protected togglePage(on: boolean): void {
    const ids = this.pager.items().map((org) => org.id);
    this.selected.update((list) => (on ? [...new Set([...list, ...ids])] : list.filter((id) => !ids.includes(id))));
  }

  protected selectAllShown(): void {
    this.selected.set(this.shown().map((org) => org.id));
  }

  protected openTransfer(ids: string[]): void {
    const rows = this.all().filter((org) => ids.includes(org.id));
    if (!rows.length) return;
    this.transferRequest.set({
      kind: "organisations",
      ids: rows.map((org) => org.id),
      labels: rows.map((org) => org.name),
      fromScoopIds: [...new Set(rows.map((org) => org.scoopId))],
    });
  }

  /** Pagination : mêmes règles que l'API (`GET /v1/organisations?page=&limit=`). */
  protected readonly pager = createPager(() => this.shown());

  protected readonly stats = computed<StatCard[]>(() => {
    const t = this.t();
    const all = this.all();
    const producers = all.reduce((n, o) => n + o.producers, 0);
    const plots = all.reduce((n, o) => n + o.plots, 0);
    const toVerify = all.reduce((n, o) => n + o.toVerify, 0);
    const types = new Set(all.map((o) => o.type).filter(Boolean)).size;
    const unqualified = all.filter((o) => !o.type).length;
    return [
      {
        label: t("organisations.stat.total"),
        value: nf.format(all.length),
        sub: t("organisations.stat.totalSub", { count: types }),
        icon: "hub",
        bg: "",
        fg: "",
      },
      {
        label: t("organisations.stat.producers"),
        value: nf.format(producers),
        sub: t("organisations.stat.producersSub", {
          avg: nf.format(Math.round(producers / (all.length || 1))),
        }),
        icon: "agriculture",
        ...TONE.succes,
      },
      {
        label: t("organisations.stat.plots"),
        value: nf.format(plots),
        sub: t("organisations.stat.plotsSub", { count: nf.format(toVerify) }),
        icon: "landscape",
        ...TONE.info,
      },
      {
        label: t("organisations.stat.toQualify"),
        value: nf.format(unqualified),
        sub: t("organisations.stat.toQualifySub"),
        icon: "warning",
        ...TONE.attente,
      },
    ];
  });

  /** Mode API, administrateur CRADESC : l'organisation ouverte est « à qualifier » (type inconnu) → bouton de contact. */
  protected readonly contactOrg = computed<Org | null>(() => {
    const id = this.detailId();
    const org = id ? this.store.state().orgs.find((candidate) => candidate.id === id) : null;
    return org && !org.type && isApiMode() && this.store.can("coop_request.send") ? org : null;
  });
  protected readonly contactTargets = signal<CoopRequestTarget[]>([]);
  protected readonly contactLink = signal("");

  /** Ferme la fiche puis ouvre la demande à la coopérative de l'organisation (une seule fenêtre à la fois). */
  protected openContact(org: Org): void {
    this.detailId.set(null);
    this.contactLink.set(`/dashboard/organisations/${org.id}`);
    this.contactTargets.set([
      {
        scoopId: org.scoopId,
        items: [{ type: "organisation", id: org.id, label: org.name }],
        ...organisationDraft({ name: org.name }),
      },
    ]);
  }

  protected readonly detail = computed<DetailView | null>(() => {
    const id = this.detailId();
    const o = id ? this.all().find((x) => x.id === id) : null;
    if (!o) return null;
    const t = this.t();
    const s = this.store.state();
    const people = s.members
      .filter((m) => m.orgId === o.id)
      .sort((a, b) => `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`));
    const memberTone = (st: string) =>
      st === "membre"
        ? TONE.succes
        : st === "candidat"
          ? TONE.info
          : st === "suspendu"
            ? TONE.attente
            : TONE.neutre;
    // Ce qui pose problème : type inconnu, puis producteurs « à vérifier » avec leur première alerte.
    const toCheck = s.producers.filter((p) => p.orgId === o.id && p.quality === "à vérifier");
    const typeIssue = !o.type
      ? (o.name ?? "").trim() === "" || /^(non pr[ée]cis[ée]e?|n\/?a|inconnu|\?+)$/i.test((o.name ?? "").trim())
        ? t("cooperatives.fiche.gie.issue.noName")
        : t("cooperatives.fiche.gie.issue.unknownType", { name: o.name })
      : null;
    const lines = toCheck.slice(0, 6).map((p) => ({
      label: p.code,
      text: p.survey?.alerts?.[0] ?? t("organisations.detail.toCheckNoAlert"),
    }));
    if (toCheck.length > 6)
      lines.push({ label: "…", text: t("organisations.detail.toCheckMore", { count: toCheck.length - 6 }) });
    const alerts = [
      ...(typeIssue ? [{ title: t("cooperatives.fiche.detail.issue"), text: typeIssue }] : []),
      ...(toCheck.length
        ? [
            {
              title: t("organisations.detail.toCheckTitle"),
              text: t("organisations.detail.toCheckIntro", { count: toCheck.length }),
              lines,
            },
          ]
        : []),
    ];
    return {
      title: o.name,
      subtitle: [o.village, o.scoop].filter(Boolean).join(" · "),
      alerts,
      icon: "hub",
      badges: [{ label: o.type ?? t("organisations.filter.toQualify"), ...o.tone }],
      kpis: [
        detailKpi(t("organisations.col.producers"), o.producers, "agriculture", TONE.succes),
        detailKpi(t("organisations.col.plots"), o.plots, "landscape", TONE.info),
        detailKpi(t("organisations.col.toVerify"), o.toVerify, "warning", TONE.attente),
      ],
      facts: [
        detailFact(
          t("organisations.col.type"),
          o.type ?? t("organisations.filter.toQualify"),
          "hub",
          { tone: o.type ? undefined : TONE.attente },
        ),
        detailFact(t("producteurs.col.village"), o.village, "location_on"),
        detailFact(t("organisations.col.scoop"), o.scoop, "apartment", { wide: true }),
        detailFact(t("qualite.source.col"), describeSourceFact(o.record, t), "database", { wide: true }),
        ...(o.record.placementAConfirmer
          ? [
              detailFact(
                t("placement.fact"),
                `${t("placement.badge")} · ${o.record.placementNote || t("placement.noteDefault")}`,
                "help",
                { wide: true, tone: TONE.attente },
              ),
            ]
          : []),
      ],
      sections: [
        {
          title: t("cooperatives.fiche.detail.orgMembers"),
          icon: "group",
          count: people.length,
          empty: t("cooperatives.fiche.detail.orgMembersEmpty"),
          items: people.slice(0, 8).map((m) => ({
            label: `${m.firstName} ${m.lastName}`,
            sub: m.village,
            initials: initialsOf(`${m.firstName} ${m.lastName}`),
            badge: {
              label: t(`cooperatives.fiche.status.${m.status}` as Parameters<typeof t>[0]),
              ...memberTone(m.status),
            },
          })),
          more: Math.max(0, people.length - 8),
        },
      ],
      link: ["/dashboard/organisations", o.id],
    };
  });
}
