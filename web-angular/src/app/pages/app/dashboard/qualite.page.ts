import { UiEmptyStateComponent } from "@shared/ui/empty-state.component";
import { Component, computed, effect, inject, signal, untracked } from "@angular/core";
import { Router, RouterLink } from "@angular/router";

import { isApiMode } from "@/lib/api/config";
import { listCoopRequests, type CoopRequestDto } from "@/lib/api/coop-requests";
import { fetchAllPages } from "@/lib/api/pagination";
import {
  dataSourceOf,
  describeSource,
  SOURCE_FILTER_IDS,
  sourceOfCoopRequest,
  sourceOfGroup,
  sourceOfProducer,
  type DataSource,
  type DataSourceId,
  type DataSourceSummary,
} from "@/lib/data-source";
import { fmtDate, nf } from "@/lib/format";
import type { MessageKey } from "@/lib/i18n";
import type { Permission } from "@/lib/permissions";
import { pendingCorrections, qualityCounts, QUALITY_SECTIONS, sectionPerms } from "@/lib/quality-nav";
import { collectQualityPoints, duplicateGroups, explainAlert } from "@/lib/quality-real";
import { inScope } from "@/lib/scope";
import { AppShellComponent } from "@shared/app-shell.component";
import { CniAlertsService } from "@shared/cni-alerts.service";
import { CoopRequestsService } from "@shared/coop-requests.service";
import { LocaleService } from "@shared/locale.service";
import { createPager } from "@shared/pager";
import { StoreService } from "@shared/store.service";
import {
  IconComponent,
  PaginationComponent,
  SelectComponent,
  StatCardsComponent,
  TONE,
  V2_PAGE_STYLES,
  type IconName,
  type SelectOption,
  type StatCard,
} from "@shared/ui";

type QueueType = "doublons" | "alertes" | "corrections" | "demandes";

const norm = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Nombre maximal de fiches ouvertes d'un coup dans la comparaison. */
const MAX_COMPARED = 4;
/** Codes cités dans l'élément d'un groupe de doublons avant « … ». */
const MAX_CODES_SHOWN = 4;

/** Les files de travail de la qualité, dans l'ordre du menu. */
const SECTION: Record<
  string,
  { type: QueueType; label: MessageKey; desc: MessageKey; icon: IconName; bg: string; fg: string }
> = {
  "/dashboard/qualite/doublons": {
    type: "doublons",
    label: "qualite.nav.doublons",
    desc: "qualite.v2.hub.doublons",
    icon: "group",
    ...TONE.info,
  },
  "/dashboard/qualite/alertes": {
    type: "alertes",
    label: "qualite.nav.alertes",
    desc: "qualite.v2.hub.alertes",
    icon: "warning",
    ...TONE.attente,
  },
  "/dashboard/qualite/corrections": {
    type: "corrections",
    label: "qualite.nav.corrections",
    desc: "qualite.v2.hub.corrections",
    icon: "edit",
    ...TONE.culture,
  },
  "/dashboard/qualite/demandes": {
    type: "demandes",
    label: "qualite.nav.demandes",
    desc: "qualite.v2.hub.demandes",
    icon: "mail",
    ...TONE.erreur,
  },
};

const SOURCE_LABEL: Record<DataSourceId, MessageKey> = {
  kobo: "qualite.source.kobo",
  application: "qualite.source.application",
  consolidee: "qualite.source.consolidee",
  cradesc: "qualite.source.cradesc",
};

const KIND_LABEL: Record<"fiche" | "parcelle" | "culture", MessageKey> = {
  fiche: "qualite.real.kind.fiche",
  parcelle: "qualite.real.kind.parcelle",
  culture: "qualite.real.kind.culture",
};

/** Une ligne du tableau unifié « À traiter ». */
interface QueueRow {
  id: string;
  type: QueueType;
  title: string;
  /** Code du producteur (vide pour un groupe ou une demande). */
  subtitle: string;
  scoopIds: string[];
  scoopLabel: string;
  source: DataSource | DataSourceSummary;
  sourceIds: string[];
  problem: string;
  explanationKey: MessageKey | null;
  place: string;
  dateIso: string | null;
  link: string[];
  queryParams: Record<string, string> | null;
}

/**
 * Accueil « Qualité des données » (charte V2) : état des fiches du périmètre, les files de travail (doublons,
 * alertes, corrections, demandes du CRADESC) en une seule ligne de cartes, et en mode API un tableau unifié
 * « À traiter » filtrable par type, coopérative et source. Les chiffres des cartes et les lignes du tableau
 * viennent des mêmes fonctions (`quality-nav.ts`, `quality-real.ts`), donc toujours cohérents.
 */
@Component({
  selector: "app-qualite-page",
  imports: [
    UiEmptyStateComponent,
    AppShellComponent,
    IconComponent,
    PaginationComponent,
    RouterLink,
    SelectComponent,
    StatCardsComponent,
  ],
  styles: [
    V2_PAGE_STYLES,
    `
      .queues {
        display: grid;
        grid-template-columns: 1fr;
        gap: 16px;
      }
      @media (min-width: 640px) {
        .queues {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
      @media (min-width: 1200px) {
        .queues {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }
      }
      .queue {
        display: flex;
        flex-direction: column;
        border-radius: 24px;
        border: 1px solid var(--v2-bord-carte);
        background: var(--v2-blanc);
        transition:
          transform 0.2s ease,
          box-shadow 0.2s ease,
          border-color 0.2s ease;
      }
      .queue:hover {
        transform: translateY(-2px);
        border-color: var(--v2-gris-trait);
        box-shadow: var(--v2-ombre-flottant);
      }
      .queue.on {
        border-color: var(--v2-foret);
        box-shadow: inset 0 0 0 2px var(--v2-foret);
      }
      .q-body {
        display: flex;
        flex: 1;
        flex-direction: column;
        gap: 14px;
        padding: 22px 22px 8px;
        border-radius: 24px 24px 0 0;
        text-align: left;
        cursor: pointer;
        background: transparent;
        color: inherit;
      }
      .q-body:focus-visible,
      .q-go:focus-visible {
        outline: 2px solid var(--v2-foret);
        outline-offset: 3px;
      }
      .q-ico {
        display: grid;
        height: 48px;
        width: 48px;
        flex-shrink: 0;
        place-items: center;
        border-radius: 14px;
      }
      .q-count {
        font-size: 40px;
        font-weight: 800;
        line-height: 1;
        letter-spacing: -0.03em;
        font-variant-numeric: tabular-nums;
      }
      .q-go {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 10px 22px 20px;
        font-size: 14px;
        font-weight: 800;
        color: var(--v2-foret);
      }
      .q-go:hover {
        gap: 10px;
      }
      .toolbar-hub {
        align-items: flex-end;
      }
      .toolbar-hub .search {
        align-self: flex-end;
      }
      .problem {
        max-width: 420px;
      }
    `,
  ],
  template: `
    <app-shell [perm]="hubPerm()" [area]="t()('qualite.header.title')">
      <header class="rise">
        <p class="mono" style="color: var(--v2-gris-texte)">{{ t()("qualite.header.eyebrow") }}</p>
        <h1
          class="mt-2 text-[30px] font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-[38px]"
        >
          {{ t()("qualite.header.title") }}
        </h1>
        <p class="mt-2 max-w-2xl text-[16px] font-medium" style="color: var(--v2-gris-texte)">
          {{ t()("qualite.hub.intro") }}
        </p>
      </header>

      <h2 class="mono mt-8" style="color: var(--v2-gris-texte)">
        {{ t()("qualite.v2.hub.sharesTitle") }}
      </h2>
      <ui-stat-cards class="rise mt-3" [stats]="stats()" />

      <div class="queues mt-8">
        @for (section of sections(); track section.to) {
          <div class="queue" [class.on]="apiMode && typeFilter() === section.type">
            <button
              type="button"
              class="q-body"
              [attr.aria-pressed]="apiMode ? typeFilter() === section.type : null"
              [attr.aria-label]="t()('qualite.hub.filterCard', { label: t()(section.label) })"
              (click)="onCard(section)"
            >
              <span class="flex items-start justify-between gap-3">
                <span class="q-ico" [style.background]="section.bg" [style.color]="section.fg"
                  ><ui-icon [name]="section.icon" [size]="24"
                /></span>
                <span class="text-right">
                  <span class="q-count block" [class.zero]="!section.count">{{
                    nf.format(section.count)
                  }}</span>
                  <span class="sub">{{ t()("qualite.v2.hub.toTreat") }}</span>
                </span>
              </span>
              <span class="block">
                <span class="block text-[19px] font-extrabold tracking-[-0.01em]">{{
                  t()(section.label)
                }}</span>
                <span class="sub mt-1 block text-[14px]">{{ t()(section.desc) }}</span>
              </span>
            </button>
            <a class="q-go" [routerLink]="section.to"
              >{{ t()("qualite.v2.hub.open") }}<ui-icon name="arrow_forward" [size]="18"
            /></a>
          </div>
        }
      </div>

      @if (apiMode && sections().length) {
        <h2 class="mt-10 text-[22px] font-extrabold tracking-[-0.01em]">
          {{ t()("qualite.hub.table.title") }}
        </h2>
        <p class="sub mt-1">{{ t()("qualite.hub.table.intro") }}</p>

        <div class="toolbar toolbar-hub card mt-4">
          <label class="search">
            <ui-icon name="search" [size]="20" />
            <input
              type="search"
              [placeholder]="t()('qualite.hub.search')"
              [attr.aria-label]="t()('qualite.hub.search')"
              [value]="query()"
              (input)="query.set($any($event.target).value)"
            />
          </label>
          <div>
            <p class="lbl mb-1">{{ t()("qualite.hub.filter.scoop") }}</p>
            <ui-select
              class="min-w-[210px]"
              variant="compact"
              leadingIcon="apartment"
              [label]="t()('qualite.hub.filter.scoop')"
              [options]="scoopOptions()"
              [value]="scoopFilter()"
              (valueChange)="scoopFilter.set($event)"
            />
          </div>
          @if (store.canSeeSource()) {
            <div>
              <p class="lbl mb-1">{{ t()("qualite.source.filter.label") }}</p>
              <ui-select
                class="min-w-[210px]"
                variant="compact"
                leadingIcon="database"
                [label]="t()('qualite.source.filter.label')"
                [options]="sourceOptions()"
                [value]="sourceFilter()"
                (valueChange)="sourceFilter.set($event)"
              />
            </div>
          }
          <div>
            <p class="lbl mb-1">{{ t()("qualite.hub.filter.type") }}</p>
            <div class="seg" role="radiogroup" [attr.aria-label]="t()('qualite.hub.filter.typeAria')">
              @for (button of typeButtons(); track button.id) {
                <button
                  type="button"
                  role="radio"
                  [class.on]="typeFilter() === button.id"
                  [attr.aria-checked]="typeFilter() === button.id"
                  (click)="typeFilter.set(button.id)"
                >
                  {{ button.label
                  }}<span class="n" [class.zero]="!button.count">{{ nf.format(button.count) }}</span>
                </button>
              }
            </div>
          </div>
        </div>

        @if (demandesFailed()) {
          <p class="sub mt-3" role="status">{{ t()("qualite.hub.demandesFailed") }}</p>
        }
        <p class="sub mt-4" aria-live="polite">
          {{ t()("qualite.hub.count", { count: nf.format(filteredRows().length) }) }}
        </p>

        <section class="card mt-3 overflow-hidden">
          @if (filteredRows().length) {
            <div class="overflow-x-auto">
              <table class="tbl min-w-[1100px]">
                <thead>
                  <tr>
                    <th>{{ t()("qualite.hub.col.type") }}</th>
                    <th>{{ t()("qualite.hub.col.item") }}</th>
                    <th>{{ t()("qualite.hub.col.scoop") }}</th>
                    @if (store.canSeeSource()) {
                      <th>{{ t()("qualite.source.col") }}</th>
                    }
                    <th>{{ t()("qualite.hub.col.problem") }}</th>
                    <th>{{ t()("qualite.hub.col.date") }}</th>
                    <th class="text-right">{{ t()("qualite.hub.col.action") }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of pager.items(); track row.id) {
                    <tr>
                      <td>
                        <span
                          class="badge"
                          [style.background]="typeTone(row.type).bg"
                          [style.color]="typeTone(row.type).fg"
                          ><ui-icon [name]="typeTone(row.type).icon" [size]="14" />{{
                            t()(typeTone(row.type).label)
                          }}</span
                        >
                      </td>
                      <td>
                        <span class="block max-w-[260px] truncate font-bold" [title]="row.title">{{
                          row.title
                        }}</span>
                        @if (row.subtitle) {
                          <span class="sub block">{{ row.subtitle }}</span>
                        }
                      </td>
                      <td class="font-medium">{{ row.scoopLabel }}</td>
                      @if (store.canSeeSource()) {
                        <td>
                          <span
                            class="badge"
                            [style.background]="row.source.bg"
                            [style.color]="row.source.fg"
                            [title]="sourceDetail(row.source)"
                            ><ui-icon [name]="row.source.icon" [size]="14" />{{
                              t()(row.source.labelKey)
                            }}</span
                          >
                        </td>
                      }
                      <td>
                        <span class="problem block font-bold">{{ row.problem }}</span>
                        @if (row.place) {
                          <span class="sub block">{{ row.place }}</span>
                        }
                        @if (row.explanationKey; as why) {
                          <span class="sub problem block">{{ t()(why) }}</span>
                        }
                      </td>
                      <td class="sub whitespace-nowrap">
                        {{ row.dateIso ? date(row.dateIso) : "—" }}
                      </td>
                      <td>
                        <span class="flex justify-end">
                          <a
                            class="btn btn-ghost"
                            [routerLink]="row.link"
                            [queryParams]="row.queryParams"
                            [attr.aria-label]="t()('qualite.hub.openAria', { item: row.title })"
                            >{{ t()("qualite.hub.open")
                            }}<ui-icon name="arrow_forward" [size]="18"
                          /></a>
                        </span>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <ui-pagination class="px-5 pb-5" [pager]="pager" />
          } @else {
            <ui-empty-state icon="task_alt" [title]="t()(allRows().length ? 'qualite.hub.emptyFilter' : 'qualite.hub.empty')" />
          }
        </section>
      }
    </app-shell>
  `,
})
export default class QualitePage {
  protected readonly store = inject(StoreService);
  private readonly coopRequests = inject(CoopRequestsService);
  private readonly cniAlerts = inject(CniAlertsService);
  private readonly router = inject(Router);
  protected readonly locale = inject(LocaleService);
  protected readonly t = this.locale.t;
  protected readonly nf = nf;
  protected readonly apiMode = isApiMode();

  /** Demandes du CRADESC encore ouvertes (mode API), lues sur le serveur. */
  private readonly openRequests = signal<CoopRequestDto[]>([]);
  protected readonly demandesFailed = signal(false);

  protected readonly query = signal("");
  protected readonly typeFilter = signal<QueueType | "">("");
  protected readonly scoopFilter = signal("");
  protected readonly sourceFilter = signal("");

  constructor() {
    effect(() => {
      if (this.cniAlerts.canView()) untracked(() => void this.cniAlerts.refresh());
    });
    // Mode API : les demandes du CRADESC encore ouvertes viennent du serveur.
    effect(() => {
      if (this.store.can("coop_request.read")) untracked(() => void this.loadRequests());
    });
  }

  private async loadRequests(): Promise<void> {
    if (!this.apiMode) return;
    try {
      const open = await fetchAllPages((page) => listCoopRequests({ ...page, status: "ouverte" }));
      this.openRequests.set(open);
      this.demandesFailed.set(false);
      this.coopRequests.setOpenCount(open.length);
    } catch {
      // Jamais de chiffre inventé : liste vide et avertissement.
      this.demandesFailed.set(true);
    }
  }

  /** Au moins un des droits « qualité » suffit pour afficher l'accueil. */
  protected readonly hubPerm = computed((): readonly Permission[] => [
    ...new Set(QUALITY_SECTIONS.flatMap((section) => sectionPerms(section))),
  ]);

  /** Files visibles avec la session, avec leur volume à traiter (mêmes fonctions que le tableau). */
  protected readonly sections = computed(() => {
    const perms = this.store.state().session?.permissions ?? [];
    const counts = qualityCounts(this.store.state(), this.cniAlerts.canView() ? this.cniAlerts.openCount() : 0);
    const count: Record<string, number> = {
      "/dashboard/qualite/doublons": counts.doublons,
      "/dashboard/qualite/alertes": counts.alertes,
      "/dashboard/qualite/corrections": counts.corrections,
      "/dashboard/qualite/demandes": this.openRequests().length,
    };
    return QUALITY_SECTIONS.filter(
      (section) =>
        sectionPerms(section).some((perm) => perms.includes(perm)) &&
        (section.to !== "/dashboard/qualite/demandes" || this.apiMode),
    ).map((section) => ({
      to: section.to,
      count: count[section.to] ?? 0,
      ...SECTION[section.to]!,
    }));
  });

  /** Mode API : un clic sur le corps de la carte filtre le tableau (second clic : tout afficher). Hors API : ouvre la page. */
  protected onCard(section: { to: string; type: QueueType }): void {
    if (!this.apiMode) {
      void this.router.navigateByUrl(section.to);
      return;
    }
    this.typeFilter.set(this.typeFilter() === section.type ? "" : section.type);
  }

  protected typeTone(type: QueueType) {
    const entry = Object.values(SECTION).find((section) => section.type === type)!;
    return { bg: entry.bg, fg: entry.fg, label: entry.label, icon: entry.icon };
  }

  protected date(iso: string): string {
    return fmtDate(iso);
  }

  protected sourceDetail(source: DataSource | DataSourceSummary): string {
    return describeSource(source, this.t());
  }

  private scoopName(id: string): string {
    return this.store.state().scoops.find((scoop) => scoop.id === id)?.name ?? "—";
  }

  // ------------------------------------------------------- Tableau unifié « À traiter » (mode API)

  /** Toutes les lignes à traiter des files visibles, avant filtres. */
  protected readonly allRows = computed<QueueRow[]>(() => {
    if (!this.apiMode) return [];
    const state = this.store.state();
    const t = this.t();
    const visible = new Set(this.sections().map((section) => section.type));
    const scoops = new Map(state.scoops.map((scoop) => [scoop.id, scoop.name]));
    const producers = new Map(state.producers.map((producer) => [producer.id, producer]));
    const rows: QueueRow[] = [];

    if (visible.has("doublons")) {
      for (const group of duplicateGroups(state)) {
        const codes = group.members.map((member) => member.code);
        const shown = codes.slice(0, MAX_CODES_SHOWN).join(", ") + (codes.length > MAX_CODES_SHOWN ? " …" : "");
        const scoopIds = [...new Set(group.members.map((member) => member.scoopId))];
        const source = sourceOfGroup(group.members);
        rows.push({
          id: `doublons-${group.id}`,
          type: "doublons",
          title: t("qualite.hub.item.group", { n: group.members.length, codes: shown }),
          subtitle: "",
          scoopIds,
          scoopLabel: scoopIds.map((id) => scoops.get(id) ?? "—").join(", "),
          source,
          sourceIds: source.parts.map((part) => part.id),
          problem: t("qualite.real.dbl.reason.phone"),
          explanationKey: null,
          place: "",
          dateIso: null,
          link: ["/dashboard/qualite/doublons/comparer"],
          queryParams: { fiches: codes.slice(0, MAX_COMPARED).join(",") },
        });
      }
    }

    if (visible.has("alertes")) {
      for (const point of collectQualityPoints(state)) {
        const producer = producers.get(point.producerId);
        const source = producer ? sourceOfProducer(producer) : dataSourceOf(point.sourceId);
        rows.push({
          id: `alertes-${point.id}`,
          type: "alertes",
          title: point.producerName,
          subtitle: point.producerCode,
          scoopIds: [point.scoopId],
          scoopLabel: scoops.get(point.scoopId) ?? "—",
          source,
          sourceIds: [source.id],
          problem: point.text || t("qualite.real.noReason"),
          explanationKey: explainAlert(point.text),
          place: point.place ? `${t(KIND_LABEL[point.kind])} · ${point.place}` : t(KIND_LABEL[point.kind]),
          dateIso: null,
          link: ["/dashboard/producteurs", point.producerId],
          queryParams: null,
        });
      }
    }

    if (visible.has("corrections")) {
      for (const correction of pendingCorrections(state)) {
        const producer = producers.get(correction.producerId);
        const source = producer ? sourceOfProducer(producer) : dataSourceOf("application");
        rows.push({
          id: `corrections-${correction.id}`,
          type: "corrections",
          title: producer ? `${producer.firstName} ${producer.lastName}`.trim() : "—",
          subtitle: producer?.code ?? "",
          scoopIds: producer ? [producer.scoopId] : [],
          scoopLabel: producer ? (scoops.get(producer.scoopId) ?? "—") : "—",
          source,
          sourceIds: [source.id],
          problem: correction.motif || correction.changes.map((change) => change.field).join(", ") || "—",
          explanationKey: null,
          place: correction.changes.map((change) => change.field).join(", "),
          dateIso: correction.requestedAt,
          link: ["/dashboard/qualite/corrections"],
          queryParams: null,
        });
      }
    }

    if (visible.has("demandes")) {
      const source = sourceOfCoopRequest();
      for (const request of this.openRequests()) {
        rows.push({
          id: `demandes-${request.id}`,
          type: "demandes",
          title: request.subject,
          subtitle: request.items.length ? t("qualite.hub.item.requestItems", { n: request.items.length }) : "",
          scoopIds: [request.scoopId],
          scoopLabel: request.scoopName,
          source,
          sourceIds: [source.id],
          problem: request.message,
          explanationKey: null,
          place: request.items.map((item) => item.label).join(", "),
          dateIso: request.createdAt,
          link: ["/dashboard/qualite/demandes"],
          queryParams: null,
        });
      }
    }
    return rows;
  });

  /** Lignes après recherche, coopérative et source (le type s'applique à part : ses effectifs ignorent le type). */
  private readonly rowsBeforeType = computed(() => {
    const needle = norm(this.query().trim());
    const scoop = this.scoopFilter();
    const source = this.sourceFilter();
    return this.allRows().filter(
      (row) =>
        (!scoop || row.scoopIds.includes(scoop)) &&
        (!source || row.sourceIds.includes(source)) &&
        (!needle || norm(`${row.title} ${row.subtitle} ${row.problem} ${row.place} ${row.scoopLabel}`).includes(needle)),
    );
  });

  protected readonly filteredRows = computed(() => {
    const type = this.typeFilter();
    const rows = this.rowsBeforeType();
    return type ? rows.filter((row) => row.type === type) : rows;
  });

  protected readonly pager = createPager(() => this.filteredRows(), 10);

  protected readonly typeButtons = computed(() => {
    const t = this.t();
    const rows = this.rowsBeforeType();
    return [
      { id: "" as QueueType | "", label: t("qualite.hub.filter.all"), count: rows.length },
      ...this.sections().map((section) => ({
        id: section.type as QueueType | "",
        label: t(section.label),
        count: rows.filter((row) => row.type === section.type).length,
      })),
    ];
  });

  protected readonly scoopOptions = computed<SelectOption[]>(() => {
    const names = new Map<string, string>();
    for (const row of this.allRows()) {
      row.scoopIds.forEach((id) => names.set(id, this.scoopName(id)));
    }
    return [
      { value: "", label: this.t()("qualite.hub.filter.scoopAll") },
      ...[...names.entries()]
        .sort((first, second) => first[1].localeCompare(second[1], "fr"))
        .map(([value, label]) => ({ value, label })),
    ];
  });

  protected readonly sourceOptions = computed<SelectOption[]>(() => [
    { value: "", label: this.t()("qualite.source.filter.all") },
    ...SOURCE_FILTER_IDS.map((id) => ({ value: id as string, label: this.t()(SOURCE_LABEL[id]) })),
  ]);

  /** Répartition des fiches producteurs du périmètre par qualité. */
  protected readonly stats = computed<StatCard[]>(() => {
    const t = this.t();
    const state = this.store.state();
    const scoped = inScope(
      state.producers.filter((producer) => !producer.mergedInto),
      state.session,
    );
    const total = scoped.length || 1;
    const countOf = (quality: string) => scoped.filter((producer) => producer.quality === quality).length;
    const percent = (value: number) => `${Math.round((value / total) * 100)} %`;
    const sub = t("qualite.v2.hub.sharesSub", { count: nf.format(scoped.length) });
    return [
      {
        label: t("dashboard.quality.validated"),
        value: percent(countOf("validé")),
        sub: `${nf.format(countOf("validé"))} · ${sub}`,
        icon: "task_alt",
        bg: "",
        fg: "",
      },
      {
        label: t("dashboard.quality.toVerify"),
        value: nf.format(countOf("à vérifier")),
        sub: percent(countOf("à vérifier")),
        icon: "warning",
        ...TONE.attente,
      },
      {
        label: t("dashboard.quality.duplicate"),
        value: nf.format(countOf("doublon")),
        sub: percent(countOf("doublon")),
        icon: "group",
        ...TONE.info,
      },
      {
        label: t("dashboard.quality.invalid"),
        value: nf.format(countOf("invalide")),
        sub: percent(countOf("invalide")),
        icon: "close",
        ...TONE.erreur,
      },
    ];
  });
}
