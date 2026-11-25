import { Component, computed, inject, signal } from "@angular/core";

import { isApiMode } from "@/lib/api/config";
import { actions, can, getState } from "@/lib/store";
import { downloadCsv, nf } from "@/lib/format";
import { ENTITY_ORDER, SCHEMA, type EntityKey } from "@/lib/io/schema";
import { downloadWorkbook, exchangeRows, type Cell, type SheetOut } from "@/lib/io/workbook";
import { AppShellComponent } from "@shared/app-shell.component";
import { LocaleService } from "@shared/locale.service";
import { StoreService } from "@shared/store.service";
import {
  IconComponent,
  SnackbarService,
  StatCardsComponent,
  TONE,
  V2_PAGE_STYLES,
  type StatCard,
} from "@shared/ui";

type ExtraKey = "alertes" | "doublons" | "corrections" | "journal";

const ENTITY_ORDER_ARR = [...ENTITY_ORDER];

/**
 * Export des données (charte V2) : volumes, export Excel complet ou CSV par entité (tracés).
 * Pas de sauvegarde ni de restauration dans l'application (décision Q-15).
 */
@Component({
  selector: "app-donnees-page",
  imports: [AppShellComponent, IconComponent, StatCardsComponent],
  styles: [
    V2_PAGE_STYLES,
    `
      .grid-main {
        display: grid;
        gap: 16px;
      }
      @media (min-width: 1100px) {
        .grid-main {
          grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
          align-items: start;
        }
      }
      .ent {
        display: flex;
        align-items: center;
        gap: 12px;
        border-top: 1px solid var(--v2-separateur);
        padding: 10px 20px;
      }
    `,
  ],
  template: `
    <app-shell perm="data.backup" [area]="t()('donnees.area')">
      <header class="rise">
        <p class="mono" style="color: var(--v2-gris-texte)">{{ t()("donnees.eyebrow") }}</p>
        <h1
          class="mt-2 text-[30px] font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-[38px]"
        >
          {{ t()("donnees.title") }}
        </h1>
        <p class="mt-2 max-w-2xl text-[16px] font-medium" style="color: var(--v2-gris-texte)">
          {{ t()("donnees.description") }}
        </p>
      </header>

      @if (!nominatif()) {
        <p class="notice mt-4" style="background: var(--v2-info-bg); color: var(--v2-info-fg)">
          <ui-icon name="info" [size]="18" />{{ t()("donnees.notice.noNominatif") }}
        </p>
      }
      @if (nominatif() && !cni()) {
        <p class="notice mt-4" style="background: var(--v2-info-bg); color: var(--v2-info-fg)">
          <ui-icon name="info" [size]="18" />{{ t()("donnees.notice.noCni") }}
        </p>
      }

      <ui-stat-cards class="rise mt-8" [stats]="stats()" />

      <div class="grid-main mt-6">
        <!-- Exporter -->
        <section class="sec-card">
          <div class="sec-head">
            <h2>
              <span class="sec-ico"><ui-icon name="table_view" [size]="18" /></span
              >{{ t()("donnees.export.title") }}
            </h2>
            <button type="button" class="btn btn-primary" (click)="exportAll()">
              {{ t()("donnees.export.all")
              }}<span class="btn-chip"><ui-icon name="download" [size]="18" /></span>
            </button>
          </div>
          <p class="sub border-t px-5 py-3" style="border-color: var(--v2-separateur)">
            {{ t()("donnees.export.description") }}
          </p>
          <p class="lbl px-5 pb-2 pt-3">{{ t()("donnees.export.single") }}</p>
          <ul>
            @for (row of exportRows(); track row.key) {
              <li class="ent">
                <span class="sec-ico"><ui-icon name="description" [size]="18" /></span>
                <span class="min-w-0 flex-1 font-bold">{{ row.label }}</span>
                <span class="sub tabular-nums">{{ nf.format(row.n) }}</span>
                <button
                  type="button"
                  class="btn btn-ghost"
                  style="height: 38px; padding: 0 12px"
                  (click)="exportCsv(row.key)"
                >
                  <ui-icon name="download" [size]="16" />{{ t()("donnees.export.csvButton") }}
                </button>
              </li>
            }
          </ul>
        </section>

      </div>
    </app-shell>
  `,
})
export default class DonneesPage {
  protected readonly store = inject(StoreService);
  protected readonly locale = inject(LocaleService);
  protected readonly t = this.locale.t;
  protected readonly nf = nf;
  private readonly snackbar = inject(SnackbarService);
  protected readonly stats = computed<StatCard[]>(() => {
    const t = this.t();
    const c = this.currentCounts();
    return [
      {
        label: t("donnees.volume.producteurs"),
        value: nf.format(c.producers),
        sub: `${nf.format(c.orgs)} ${t("donnees.volume.organisations").toLowerCase()}`,
        icon: "agriculture",
        bg: "",
        fg: "",
      },
      {
        label: t("donnees.volume.parcelles"),
        value: nf.format(c.plots),
        sub: t("donnees.export.single"),
        icon: "landscape",
        ...TONE.succes,
      },
      {
        label: t("donnees.volume.alertes"),
        value: nf.format(c.alerts),
        sub: `${nf.format(c.cases)} ${t("donnees.volume.doublons").toLowerCase()}`,
        icon: "warning",
        ...TONE.attente,
      },
      {
        label: t("donnees.volume.journal"),
        // Mode API : le journal est lu sur le serveur (page Journal d'audit), pas dans le navigateur.
        value: isApiMode() ? "—" : nf.format(c.audit),
        sub: t("donnees.extra.journal"),
        icon: "receipt_long",
        ...TONE.info,
      },
    ];
  });

  private readonly EXTRA: { key: ExtraKey; labelKey: `donnees.extra.${ExtraKey}` }[] = [
    { key: "alertes", labelKey: "donnees.extra.alertes" },
    { key: "doublons", labelKey: "donnees.extra.doublons" },
    { key: "corrections", labelKey: "donnees.extra.corrections" },
    { key: "journal", labelKey: "donnees.extra.journal" },
  ];

  protected readonly nominatif = computed(() =>
    can(this.store.state().session, "producer.export_nominatif"),
  );
  protected readonly cni = computed(() => can(this.store.state().session, "identity.read_full"));

  protected readonly exportRows = computed(() => {
    const s = this.store.state();
    const counts = {
      orgs: s.orgs.length,
      producers: s.producers.filter((p) => !p.mergedInto).length,
      plots: s.plots.length,
      alertes: s.alerts.length,
      doublons: s.cases.length,
      corrections: s.corrections.length,
      journal: s.audit.length,
    };
    const entityCount: Record<EntityKey, number> = {
      organisations: counts.orgs,
      producteurs: counts.producers,
      parcelles: counts.plots,
    };
    const rows: { key: EntityKey | ExtraKey; label: string; n: number }[] = [];
    for (const e of ENTITY_ORDER_ARR) {
      rows.push({ key: e, label: SCHEMA[e].label, n: entityCount[e] });
    }
    for (const x of this.EXTRA) {
      rows.push({ key: x.key, label: this.t()(x.labelKey), n: counts[x.key] });
    }
    return rows;
  });

  private extraRows(k: ExtraKey): Cell[][] {
    const s = getState();
    const code = new Map(s.producers.map((p) => [p.id, p.code]));
    const plotCode = new Map(s.plots.map((p) => [p.id, p.code]));
    if (k === "alertes")
      return [
        ["Type", "Sévérité", "Concerne", "Code", "Statut", "Enquêteur", "Détail", "Commentaire"],
        ...s.alerts.map((a) => [
          a.type,
          a.severity,
          a.entity,
          (a.entity === "parcelle" ? plotCode.get(a.entityId) : code.get(a.entityId)) ?? "",
          a.status,
          a.enumerator,
          a.detail,
          a.comment ?? "",
        ]),
      ];
    if (k === "doublons")
      return [
        ["Cas", "Fiche A", "Fiche B", "Score", "Statut", "Signaux", "Commentaire"],
        ...s.cases.map((c) => [
          c.id.toUpperCase(),
          code.get(c.aId) ?? "",
          code.get(c.bId) ?? "",
          c.score,
          c.status,
          c.signals.map((x) => x.label).join(" | "),
          c.comment ?? "",
        ]),
      ];
    if (k === "corrections")
      return [
        ["Producteur", "Demandeur", "Date", "Champs", "Motif", "Statut", "Décision"],
        ...s.corrections.map((c) => [
          code.get(c.producerId) ?? "",
          c.requester,
          c.requestedAt,
          c.changes.map((x) => x.field).join(", "),
          c.motif,
          c.status,
          c.decisionComment ?? "",
        ]),
      ];
    return [
      ["Date", "Utilisateur", "Action", "Entité", "Détail"],
      ...s.audit.map((a) => [a.at, a.user, a.action, a.entity, a.detail]),
    ];
  }

  async exportAll(): Promise<void> {
    const s = getState();
    const opt = { nominatif: this.nominatif(), cni: this.cni() };
    const sheets: SheetOut[] = [
      ...ENTITY_ORDER_ARR.map((e) => ({ name: SCHEMA[e].sheet, rows: exchangeRows(e, s, opt) })),
      ...this.EXTRA.map((x) => ({ name: this.frExtraLabel(x.key), rows: this.extraRows(x.key) })),
    ];
    const stamp = () => new Date().toISOString().slice(0, 10);
    try {
      await downloadWorkbook(`mbay_diaay_export_${stamp()}.xlsx`, sheets);
    } catch {
      this.snackbar.error(this.t()("common.exportError"));
      return;
    }
    actions.audit(
      opt.nominatif ? "Export nominatif" : "Export anonymisé",
      "Toutes les données",
      "Classeur Excel complet",
    );
    this.snackbar.success(
      `${this.t()("donnees.exportAll.done")} · ${this.t()("donnees.exportAll.doneHint")}`,
    );
  }

  private frExtraLabel(k: ExtraKey): string {
    const map: Record<ExtraKey, string> = {
      alertes: "Alertes",
      doublons: "Doublons",
      corrections: "Demandes de correction",
      journal: "Journal d'audit",
    };
    return map[k];
  }

  exportCsv(e: EntityKey | ExtraKey): void {
    const s = getState();
    const opt = { nominatif: this.nominatif(), cni: this.cni() };
    const stamp = () => new Date().toISOString().slice(0, 10);
    const isEntity = (ENTITY_ORDER_ARR as string[]).includes(e);
    downloadCsv(
      `${e}_${stamp()}.csv`,
      isEntity ? exchangeRows(e as EntityKey, s, opt) : this.extraRows(e as ExtraKey),
    );
    actions.audit(
      isEntity && opt.nominatif ? "Export nominatif" : "Export",
      isEntity ? SCHEMA[e as EntityKey].label : this.frExtraLabel(e as ExtraKey),
      "CSV",
    );
  }

  private currentCounts() {
    const s = this.store.state();
    return {
      orgs: s.orgs.length,
      producers: s.producers.filter((p) => !p.mergedInto).length,
      plots: s.plots.length,
      alerts: s.alerts.length,
      cases: s.cases.length,
      audit: s.audit.length,
    };
  }
}
