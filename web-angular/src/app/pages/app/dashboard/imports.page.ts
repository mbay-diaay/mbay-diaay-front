import { CommonModule, isPlatformBrowser } from "@angular/common";
import {
  Component,
  ElementRef,
  HostListener,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { map } from "rxjs";

import { ApiError } from "@/lib/api/client";
import { isApiMode } from "@/lib/api/config";
import { fetchKoboReport, type ApiKoboReport } from "@/lib/api/plots";
import { downloadCsv, fmtDateTime, nf } from "@/lib/format";
import type { MessageKey } from "@/lib/i18n";
import { readFile, sha } from "@/lib/io/parse";
import { autoMap, detectEntity, ENTITY_ORDER, SCHEMA, type EntityKey } from "@/lib/io/schema";
import {
  buildPlan,
  planCounts,
  type ImportPlan,
  type Issue,
  type MappedSheet,
  type RawSheet,
} from "@/lib/io/validate";
import { downloadWorkbook, headers, templateSheets } from "@/lib/io/workbook";
import { can, getState, type ImportBatch } from "@/lib/store";
import { AppShellComponent } from "@shared/app-shell.component";
import { ConsolideReportComponent } from "../../../features/imports/consolide-report.component";
import { LocaleService } from "@shared/locale.service";
import { createPager } from "@shared/pager";
import { StoreService } from "@shared/store.service";
import {
  IconComponent,
  PaginationComponent,
  SnackbarService,
  StatCardsComponent,
  TONE,
  V2_PAGE_STYLES,
  type StatCard,
} from "@shared/ui";

const SCRIPT = "import-web-1.0";
const IGNORE = "__ignore";
const NONE = "__none";
const ENTITY_ORDER_ARR = [...ENTITY_ORDER];
/** Nombre d'éléments montrés d'emblée dans chaque liste d'orphelins du rapport Kobo. */
const ORPHAN_PREVIEW = 60;
/** Libellés connus des compteurs du lot Kobo ; une clé inconnue s'affiche telle quelle. */
const KOBO_COUNT_KEYS: Record<string, MessageKey> = {
  scoops: "imports.kobo.count.scoops",
  organisations: "imports.kobo.count.organisations",
  producers: "imports.kobo.count.producers",
  plots: "imports.kobo.count.plots",
  plotCrops: "imports.kobo.count.plotCrops",
  photos: "imports.kobo.count.photos",
  rows: "imports.kobo.count.rows",
  geojson: "imports.kobo.count.geojson",
  alerts: "imports.kobo.count.alerts",
};
type OrphanList = "geojson" | "photoFolders" | "plotsWithoutCrop" | "producersWithoutPhoto";
const STEPS = ["depot", "colonnes", "rapport", "termine"] as const;
type Step = (typeof STEPS)[number];

type SheetState = MappedSheet & { entityChoice: EntityKey | typeof IGNORE };

interface Loaded {
  file: string;
  hash: string;
  sheets: SheetState[];
}

/** Import (charte V2) : rapport Kobo (API), dépôt → colonnes → rapport à blanc → écriture, et historique des lots. */
/** Sections de la page : une seule à l'écran, choisie dans l'adresse (?vue=…). */
type ImportView = "kobo" | "consolide" | "import" | "historique";

/** Sections du rapport Kobo. */
type KoboSection = "volumes" | "geojson" | "photos" | "sansCulture" | "sansPhoto" | "partages";

@Component({
  selector: "app-imports-page",
  imports: [
    AppShellComponent,
    CommonModule,
    ConsolideReportComponent,
    FormsModule,
    IconComponent,
    PaginationComponent,
    RouterLink,
    StatCardsComponent,
  ],
  styles: [
    V2_PAGE_STYLES,
    `
      /* Onglets : bande blanche bordée sur le fond crème, onglet actif plein forêt avec texte citron. */
      .tabs {
        display: flex;
        gap: 6px;
        overflow-x: auto;
        scrollbar-width: none;
        border-radius: 18px;
        background: var(--v2-blanc);
        border: 1.5px solid var(--v2-gris-trait);
        box-shadow: 0 2px 10px color-mix(in oklab, var(--v2-foret) 8%, transparent);
        padding: 6px;
      }
      .tabs::-webkit-scrollbar {
        display: none;
      }
      .tab {
        display: inline-flex;
        flex: 1 0 auto;
        justify-content: center;
        align-items: center;
        gap: 8px;
        white-space: nowrap;
        border: none;
        border-radius: 13px;
        background: transparent;
        padding: 12px 18px;
        font-size: 14px;
        font-weight: 700;
        color: var(--v2-ardoise);
        cursor: pointer;
        transition: background-color 0.15s ease, color 0.15s ease;
      }
      .tab:hover {
        background: var(--v2-sauge);
        color: var(--v2-foret);
      }
      .tab.on {
        background: var(--v2-foret);
        color: var(--v2-citron);
      }
      .tab .n {
        border-radius: 999px;
        padding: 1px 8px;
        font-size: 11.5px;
        font-weight: 800;
        font-variant-numeric: tabular-nums;
        background: var(--v2-sauge);
        color: var(--v2-foret);
      }
      .tab.on .n {
        background: var(--v2-citron);
        color: var(--v2-foret);
      }
      .tab:focus-visible {
        outline: 2px solid var(--v2-foret);
        outline-offset: 2px;
      }
      .kind-ico {
        display: grid;
        height: 40px;
        width: 40px;
        flex-shrink: 0;
        place-items: center;
        border-radius: 12px;
      }
      .banner {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        border-radius: 16px;
        padding: 12px 16px;
        font-size: 14px;
        font-weight: 600;
      }
      .stepper {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px;
        border-radius: 20px;
        border: 1px solid var(--v2-bord-carte);
        background: var(--v2-blanc);
        padding: 14px 18px;
      }
      .step-num {
        display: grid;
        height: 28px;
        width: 28px;
        place-items: center;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 800;
        background: var(--v2-creme);
        color: var(--v2-gris-texte);
      }
      .step-num.done {
        background: var(--v2-foret);
        color: var(--v2-blanc);
      }
      .step-num.active {
        background: var(--v2-citron);
        color: var(--v2-foret);
        box-shadow: 0 0 0 2px var(--v2-foret);
      }
      .dropzone {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        border-radius: 24px;
        border: 2px dashed var(--v2-gris-trait);
        background: var(--v2-blanc);
        padding: 44px 24px;
        text-align: center;
        cursor: pointer;
        transition:
          border-color 0.15s ease,
          background-color 0.15s ease;
      }
      .dropzone:hover,
      .dropzone.drag {
        border-color: var(--v2-foret);
        background: color-mix(in oklab, var(--v2-citron) 14%, var(--v2-blanc));
      }
      .v2-select {
        height: 40px;
        min-width: 210px;
        border-radius: 12px;
        border: 1px solid var(--v2-gris-trait);
        background: var(--v2-blanc);
        padding: 0 12px;
        font-size: 14px;
        font-weight: 600;
        color: var(--v2-encre);
      }
      .v2-select:focus-visible {
        outline: 2px solid var(--v2-foret);
        outline-offset: 1px;
      }
      .v2-select.err {
        border-color: var(--v2-erreur-fg);
      }
      .csv-pop {
        position: absolute;
        right: 0;
        z-index: 20;
        margin-top: 6px;
        min-width: 240px;
        border-radius: 16px;
        border: 1px solid var(--v2-bord-carte);
        background: var(--v2-blanc);
        padding: 8px;
        box-shadow: 0 14px 30px -10px color-mix(in oklab, var(--v2-encre) 18%, transparent);
      }
      .csv-item {
        display: flex;
        width: 100%;
        align-items: center;
        gap: 8px;
        border-radius: 10px;
        padding: 8px 10px;
        font-size: 13px;
        font-weight: 600;
        text-align: left;
        color: var(--v2-encre);
        cursor: pointer;
      }
      .csv-item:hover {
        background: var(--v2-creme);
      }
      .code-pill {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        border: 1px solid var(--v2-bord-carte);
        background: var(--v2-creme);
        padding: 4px 10px;
        font-family: var(--v2-font-mono);
        font-size: 12px;
        font-weight: 700;
        color: var(--v2-encre);
        text-decoration: none;
      }
      .code-pill:hover {
        border-color: var(--v2-foret);
      }
      .orphan-tile {
        border-radius: 18px;
        border: 1px solid var(--v2-bord-carte);
        background: var(--v2-blanc);
        padding: 14px 16px;
      }
    `,
  ],
  template: `
    <app-shell perm="import.manage" [area]="t()('imports.area')">
      <!-- ───── En-tête ───── -->
      <header class="rise flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div class="min-w-0">
          <p class="mono" style="color: var(--v2-gris-texte)">{{ t()("imports.eyebrow") }}</p>
          <h1
            class="mt-2 text-[30px] font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-[38px]"
          >
            {{ t()("imports.title") }}
          </h1>
          <p class="mt-2 max-w-2xl text-[16px] font-medium" style="color: var(--v2-gris-texte)">
            {{ t()("imports.description") }}
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <div class="relative inline-block" data-csv-menu>
            <button
              type="button"
              class="btn btn-ghost"
              [attr.aria-expanded]="csvOpen()"
              [attr.aria-label]="t()('imports.template.csvTitle')"
              (click)="toggleCsvMenu($event)"
            >
              <ui-icon name="download" [size]="18" />
              {{ t()("imports.template.csv") }}
            </button>
            @if (csvOpen()) {
              <div class="csv-pop" data-csv-menu>
                @for (entity of entityOrder; track entity) {
                  <button
                    type="button"
                    class="csv-item"
                    (click)="downloadEntityCsv(entity); csvOpen.set(false)"
                  >
                    <ui-icon name="download" [size]="16" />
                    {{ t()("imports.template.entity", { label: entityLabel(entity) }) }}
                  </button>
                }
              </div>
            }
          </div>
          <button type="button" class="btn btn-primary" (click)="downloadExcelTemplate()">
            {{ t()("imports.template.excel") }}
            <span class="btn-chip"><ui-icon name="description" [size]="20" /></span>
          </button>
        </div>
      </header>

      <nav class="tabs mt-6" role="tablist" [attr.aria-label]="t()('imports.tab.label')">
        @for (item of views(); track item.id) {
          <button
            type="button"
            role="tab"
            class="tab"
            [class.on]="view() === item.id"
            [attr.aria-selected]="view() === item.id"
            (click)="setView(item.id)"
          >
            <ui-icon [name]="item.icon" [size]="16" />{{ t()(item.label) }}
          </button>
        }
      </nav>

      @if (flash()) {
        <div
          class="banner mt-5"
          [style.background]="TONE.info.bg"
          [style.color]="TONE.info.fg"
        >
          <ui-icon name="info" [size]="18" />
          <span>{{ flash() }}</span>
        </div>
      }

      <!-- ───── Rapport Kobo (mode API) ───── -->
      @if (koboMode && view() === "kobo") {
        <section class="rise mt-7 space-y-5" aria-labelledby="kobo-report-title">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <span class="kind-ico" [style.background]="TONE.info.bg" [style.color]="TONE.info.fg">
                <ui-icon name="description" [size]="20" />
              </span>
              <div>
                <h2 id="kobo-report-title" class="text-[18px] font-extrabold tracking-[-0.01em]">
                  {{ t()("imports.kobo.title") }}
                </h2>
                <p class="sub">{{ t()("imports.kobo.intro") }}</p>
              </div>
            </div>
            @if (koboReport(); as report) {
              <span class="badge" [style.background]="TONE.neutre.bg" [style.color]="TONE.neutre.fg">
                {{
                  t()("imports.kobo.batch", {
                    id: report.batch.id,
                    date: fmtDateTime(report.batch.importedAt),
                  })
                }}
              </span>
            }
          </div>

          @if (koboState() === "loading") {
            <div class="card flex items-center gap-3 p-5 text-sm font-semibold">
              <ui-icon name="refresh" [size]="18" />
              <span>{{ t()("imports.kobo.loading") }}</span>
            </div>
          } @else if (koboState() === "error") {
            <div
              class="banner justify-between"
              [style.background]="TONE.erreur.bg"
              [style.color]="TONE.erreur.fg"
            >
              <div class="flex items-center gap-2">
                <ui-icon name="warning" [size]="18" />
                <span>{{ t()("imports.kobo.error") }}</span>
              </div>
              <button
                type="button"
                class="btn btn-ghost"
                style="height: 36px; padding: 0 12px; font-size: 13px"
                (click)="loadKoboReport()"
              >
                <ui-icon name="refresh" [size]="16" />
                {{ t()("imports.kobo.retry") }}
              </button>
            </div>
          } @else if (koboState() === "empty") {
            <div class="card p-6 text-center sub">{{ t()("imports.kobo.empty") }}</div>
          }

          @if (koboReport(); as report) {
            <ui-stat-cards [stats]="koboStatCards()" />

            <nav class="tabs" role="tablist" [attr.aria-label]="t()('imports.kobo.tab.label')">
              @for (item of koboSections(report); track item.id) {
                <button
                  type="button"
                  role="tab"
                  class="tab"
                  [class.on]="koboSection() === item.id"
                  [attr.aria-selected]="koboSection() === item.id"
                  (click)="koboSection.set(item.id)"
                >
                  {{ t()(item.label) }}
                  @if (item.count !== null) {
                    <span class="n">{{ nf.format(item.count) }}</span>
                  }
                </button>
              }
            </nav>

            @if (koboSection() === "volumes") {
            <div class="grid gap-4 lg:grid-cols-2">
              <div class="card overflow-x-auto">
                <table class="tbl">
                  <thead>
                    <tr>
                      <th>{{ t()("imports.kobo.sheet") }}</th>
                      <th class="text-right">{{ t()("imports.kobo.rows") }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (sheet of report.sheets; track sheet.sheet) {
                      <tr>
                        <td class="font-bold">{{ sheet.sheet }}</td>
                        <td class="text-right font-semibold tabular-nums">
                          {{ nf.format(sheet.rows) }}
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>

              <div class="grid grid-cols-2 content-start gap-3">
                <div class="orphan-tile">
                  <p class="mono" style="color: var(--v2-gris-texte)">
                    {{ t()("imports.kobo.orphans.geojson") }}
                  </p>
                  <p
                    class="mt-1 text-[24px] font-extrabold tabular-nums"
                    [style.color]="
                      report.orphans.geojsonPoints.length ? TONE.attente.fg : 'var(--v2-encre)'
                    "
                  >
                    {{ nf.format(report.orphans.geojsonPoints.length) }}
                  </p>
                </div>
                <div class="orphan-tile">
                  <p class="mono" style="color: var(--v2-gris-texte)">
                    {{ t()("imports.kobo.orphans.photoFolders") }}
                  </p>
                  <p
                    class="mt-1 text-[24px] font-extrabold tabular-nums"
                    [style.color]="
                      report.orphans.photoFolders.length ? TONE.attente.fg : 'var(--v2-encre)'
                    "
                  >
                    {{ nf.format(report.orphans.photoFolders.length) }}
                  </p>
                </div>
                <div class="orphan-tile">
                  <p class="mono" style="color: var(--v2-gris-texte)">
                    {{ t()("imports.kobo.orphans.unidentified") }}
                  </p>
                  <p
                    class="mt-1 text-[24px] font-extrabold tabular-nums"
                    [style.color]="
                      report.orphans.unidentifiedPhotos ? TONE.attente.fg : 'var(--v2-encre)'
                    "
                  >
                    {{ nf.format(report.orphans.unidentifiedPhotos) }}
                  </p>
                  <p class="sub text-xs">{{ t()("imports.kobo.orphans.unidentifiedSub") }}</p>
                </div>
                <div class="orphan-tile">
                  <p class="mono" style="color: var(--v2-gris-texte)">
                    {{ t()("imports.kobo.orphans.plotsWithoutCrop") }}
                  </p>
                  <p
                    class="mt-1 text-[24px] font-extrabold tabular-nums"
                    [style.color]="
                      report.orphans.plotsWithoutCrop.length ? TONE.attente.fg : 'var(--v2-encre)'
                    "
                  >
                    {{ nf.format(report.orphans.plotsWithoutCrop.length) }}
                  </p>
                </div>
                <div class="orphan-tile">
                  <p class="mono" style="color: var(--v2-gris-texte)">
                    {{ t()("imports.kobo.orphans.producersWithoutPhoto") }}
                  </p>
                  <p
                    class="mt-1 text-[24px] font-extrabold tabular-nums"
                    [style.color]="
                      report.orphans.producersWithoutPhoto.length
                        ? TONE.attente.fg
                        : 'var(--v2-encre)'
                    "
                  >
                    {{ nf.format(report.orphans.producersWithoutPhoto.length) }}
                  </p>
                </div>
                <div class="orphan-tile">
                  <p class="mono" style="color: var(--v2-gris-texte)">
                    {{ t()("imports.kobo.orphans.sharedCni") }}
                  </p>
                  <p
                    class="mt-1 text-[24px] font-extrabold tabular-nums"
                    [style.color]="
                      report.orphans.sharedCni.length ? TONE.erreur.fg : 'var(--v2-encre)'
                    "
                  >
                    {{ nf.format(report.orphans.sharedCni.length) }}
                  </p>
                  <p class="sub text-xs">{{ t()("imports.kobo.orphans.groupsSub") }}</p>
                </div>
                <div class="orphan-tile col-span-2">
                  <p class="mono" style="color: var(--v2-gris-texte)">
                    {{ t()("imports.kobo.orphans.sharedPhone") }}
                  </p>
                  <p
                    class="mt-1 text-[24px] font-extrabold tabular-nums"
                    [style.color]="
                      report.orphans.sharedPhone.length ? TONE.erreur.fg : 'var(--v2-encre)'
                    "
                  >
                    {{ nf.format(report.orphans.sharedPhone.length) }}
                  </p>
                  <p class="sub text-xs">{{ t()("imports.kobo.orphans.groupsSub") }}</p>
                </div>
              </div>
            </div>
            } @else {
              <h3 class="pt-1 text-[16px] font-extrabold">{{ t()("imports.kobo.orphans") }}</h3>
            }

            <!-- Points GeoJSON sans producteur -->
            @if (koboSection() === "geojson") {
            <details class="card p-5" [open]="report.orphans.geojsonPoints.length > 0">
              <summary class="cursor-pointer font-bold">
                {{ t()("imports.kobo.orphans.geojson") }} ({{
                  nf.format(report.orphans.geojsonPoints.length)
                }})
              </summary>
              @if (report.orphans.geojsonPoints.length) {
                <div class="mt-3 max-h-96 overflow-auto">
                  <table class="tbl">
                    <thead>
                      <tr>
                        <th>{{ t()("imports.kobo.orphans.geojsonRef") }}</th>
                        <th>{{ t()("imports.kobo.orphans.geojsonData") }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (point of visibleOrphans("geojson", report.orphans.geojsonPoints); track $index) {
                        <tr>
                          <td class="font-mono text-xs font-semibold">{{ point.ref || "—" }}</td>
                          <td class="max-w-[40rem] truncate font-mono text-xs sub">
                            {{ summarize(point.data) }}
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
                @if (hiddenCount("geojson", report.orphans.geojsonPoints.length); as hidden) {
                  <button
                    type="button"
                    class="btn btn-ghost mt-3"
                    style="height: 36px; padding: 0 14px; font-size: 13px"
                    (click)="showAll('geojson')"
                  >
                    {{ t()("imports.kobo.orphans.more", { count: nf.format(hidden) }) }}
                  </button>
                }
              } @else {
                <p class="sub mt-2">{{ t()("imports.kobo.orphans.none") }}</p>
              }
            </details>
            }

            <!-- Dossiers photo sans producteur -->
            @if (koboSection() === "photos") {
            <details class="card p-5" [open]="report.orphans.photoFolders.length > 0">
              <summary class="cursor-pointer font-bold">
                {{ t()("imports.kobo.orphans.photoFolders") }} ({{
                  nf.format(report.orphans.photoFolders.length)
                }})
              </summary>
              @if (report.orphans.photoFolders.length) {
                <div class="mt-3 max-h-96 overflow-auto">
                  <table class="tbl">
                    <thead>
                      <tr>
                        <th>{{ t()("imports.kobo.orphans.folder") }}</th>
                        <th class="text-right">{{ t()("imports.kobo.orphans.files") }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (folder of visibleOrphans("photoFolders", report.orphans.photoFolders); track folder.folder) {
                        <tr>
                          <td class="font-mono text-xs font-semibold">{{ folder.folder }}</td>
                          <td class="text-right font-semibold tabular-nums">
                            {{ nf.format(folder.files) }}
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
                @if (hiddenCount("photoFolders", report.orphans.photoFolders.length); as hidden) {
                  <button
                    type="button"
                    class="btn btn-ghost mt-3"
                    style="height: 36px; padding: 0 14px; font-size: 13px"
                    (click)="showAll('photoFolders')"
                  >
                    {{ t()("imports.kobo.orphans.more", { count: nf.format(hidden) }) }}
                  </button>
                }
              } @else {
                <p class="sub mt-2">{{ t()("imports.kobo.orphans.none") }}</p>
              }
            </details>
            }

            <!-- Parcelles sans culture -->
            @if (koboSection() === "sansCulture") {
            <details class="card p-5" [open]="report.orphans.plotsWithoutCrop.length > 0">
              <summary class="cursor-pointer font-bold">
                {{ t()("imports.kobo.orphans.plotsWithoutCrop") }} ({{
                  nf.format(report.orphans.plotsWithoutCrop.length)
                }})
              </summary>
              @if (report.orphans.plotsWithoutCrop.length) {
                <div class="mt-3 flex flex-wrap gap-2">
                  @for (plotId of visibleOrphans("plotsWithoutCrop", report.orphans.plotsWithoutCrop); track plotId) {
                    <a
                      class="code-pill"
                      [routerLink]="['/dashboard/producteurs', producerOfPlot(plotId)]"
                      [attr.aria-label]="t()('imports.kobo.openProducer', { code: producerOfPlot(plotId) })"
                      >{{ plotId }}</a
                    >
                  }
                </div>
                @if (hiddenCount("plotsWithoutCrop", report.orphans.plotsWithoutCrop.length); as hidden) {
                  <button
                    type="button"
                    class="btn btn-ghost mt-3"
                    style="height: 36px; padding: 0 14px; font-size: 13px"
                    (click)="showAll('plotsWithoutCrop')"
                  >
                    {{ t()("imports.kobo.orphans.more", { count: nf.format(hidden) }) }}
                  </button>
                }
              } @else {
                <p class="sub mt-2">{{ t()("imports.kobo.orphans.none") }}</p>
              }
            </details>
            }

            <!-- Producteurs sans photo -->
            @if (koboSection() === "sansPhoto") {
            <details class="card p-5">
              <summary class="cursor-pointer font-bold">
                {{ t()("imports.kobo.orphans.producersWithoutPhoto") }} ({{
                  nf.format(report.orphans.producersWithoutPhoto.length)
                }})
              </summary>
              @if (report.orphans.producersWithoutPhoto.length) {
                <div class="mt-3 flex flex-wrap gap-2">
                  @for (code of visibleOrphans("producersWithoutPhoto", report.orphans.producersWithoutPhoto); track code) {
                    <a
                      class="code-pill"
                      [routerLink]="['/dashboard/producteurs', code]"
                      [attr.aria-label]="t()('imports.kobo.openProducer', { code })"
                      >{{ code }}</a
                    >
                  }
                </div>
                @if (hiddenCount("producersWithoutPhoto", report.orphans.producersWithoutPhoto.length); as hidden) {
                  <button
                    type="button"
                    class="btn btn-ghost mt-3"
                    style="height: 36px; padding: 0 14px; font-size: 13px"
                    (click)="showAll('producersWithoutPhoto')"
                  >
                    {{ t()("imports.kobo.orphans.more", { count: nf.format(hidden) }) }}
                  </button>
                }
              } @else {
                <p class="sub mt-2">{{ t()("imports.kobo.orphans.none") }}</p>
              }
            </details>
            }

            <!-- CNI et téléphones partagés -->
            @if (koboSection() === "partages") {
            @for (
              shared of [
                { label: t()("imports.kobo.orphans.sharedCni"), groups: report.orphans.sharedCni },
                { label: t()("imports.kobo.orphans.sharedPhone"), groups: report.orphans.sharedPhone },
              ];
              track shared.label
            ) {
              <details class="card p-5" [open]="shared.groups.length > 0">
                <summary class="cursor-pointer font-bold">
                  {{ shared.label }} ({{ nf.format(shared.groups.length) }})
                </summary>
                @if (shared.groups.length) {
                  <ul class="mt-3 divide-y" style="border-color: var(--v2-separateur)">
                    @for (group of shared.groups; track $index; let groupIndex = $index) {
                      <li class="flex flex-wrap items-center gap-2 py-2.5">
                        <span class="mono w-24" style="color: var(--v2-gris-texte)">
                          {{ t()("imports.kobo.orphans.group", { index: groupIndex + 1 }) }}
                        </span>
                        @for (code of group; track code) {
                          <a
                            class="code-pill"
                            [routerLink]="['/dashboard/producteurs', code]"
                            [attr.aria-label]="t()('imports.kobo.openProducer', { code })"
                            >{{ code }}</a
                          >
                        }
                      </li>
                    }
                  </ul>
                } @else {
                  <p class="sub mt-2">{{ t()("imports.kobo.orphans.none") }}</p>
                }
              </details>
            }
            }
          }
        </section>
      }

      <!-- ───── Rapport Base consolidée (mode API) ───── -->
      @if (koboMode && view() === "consolide") {
        <app-consolide-report />
      }

      <!-- ───── Tunnel d'import (4 étapes) ───── -->
      @if (view() === "import") {
      <section class="rise mt-7 space-y-5">
        <ol class="stepper" [attr.aria-label]="t()('imports.steps.label')">
          @for (stepName of STEPS; track stepName; let position = $index) {
            <li class="flex items-center gap-2.5 text-sm">
              <span
                class="step-num"
                [class.done]="position < stepIdx()"
                [class.active]="position === stepIdx()"
              >
                @if (position < stepIdx()) {
                  <ui-icon name="check_circle" [size]="16" />
                } @else {
                  {{ position + 1 }}
                }
              </span>
              <span
                [class.font-extrabold]="position === stepIdx()"
                [style.color]="
                  position <= stepIdx() ? 'var(--v2-encre)' : 'var(--v2-gris-texte)'
                "
              >
                {{ locale.tEnum("imports.step", stepName) }}
              </span>
              @if (position < STEPS.length - 1) {
                <span class="mx-1 h-px w-6" style="background: var(--v2-gris-trait)"></span>
              }
            </li>
          }
        </ol>

        @if (step() === "depot") {
          <label
            class="dropzone"
            [class.drag]="drag()"
            (click)="fileInput.click()"
            (dragover)="onDragOver($event)"
            (dragleave)="drag.set(false)"
            (drop)="onDrop($event)"
          >
            <span
              class="kind-ico"
              style="height: 52px; width: 52px; border-radius: 16px"
              [style.background]="TONE.culture.bg"
              [style.color]="TONE.culture.fg"
            >
              <ui-icon [name]="busy() ? 'refresh' : 'upload_file'" [size]="24" />
            </span>
            <span class="text-[16px] font-extrabold">
              {{ busy() ? t()("imports.drop.reading") : t()("imports.drop.prompt") }}
            </span>
            <span class="sub max-w-lg">{{ t()("imports.drop.hint") }}</span>
            <input
              #fileInput
              type="file"
              class="sr-only"
              accept=".xlsx,.xls,.csv,.txt"
              (click)="$event.stopPropagation()"
              (change)="onFileInput($event)"
            />
          </label>
        }

        @if (step() === "colonnes" && loaded(); as L) {
          <div class="space-y-4">
            <div class="card flex flex-wrap items-center gap-3 p-4">
              <span class="kind-ico" [style.background]="TONE.info.bg" [style.color]="TONE.info.fg">
                <ui-icon name="description" [size]="20" />
              </span>
              <div>
                <div class="font-extrabold">{{ L.file }}</div>
                <div class="mono" style="color: var(--v2-gris-texte)">
                  {{ t()("imports.hash", { hash: L.hash }) }}
                </div>
              </div>
              <button
                type="button"
                class="btn btn-ghost ml-auto"
                style="height: 40px; padding: 0 14px; font-size: 13px"
                (click)="reset()"
              >
                <ui-icon name="refresh" [size]="16" />
                {{ t()("imports.changeFile") }}
              </button>
            </div>

            @if (sameAsImported(); as same) {
              <div class="banner" [style.background]="TONE.info.bg" [style.color]="TONE.info.fg">
                <ui-icon name="info" [size]="18" />
                <span>
                  {{
                    t()("imports.sameFile", {
                      id: same.id,
                      date: fmtDateTime(same.at),
                    })
                  }}
                </span>
              </div>
            }

            @for (sheet of L.sheets; track sheet.name; let position = $index) {
              <div class="card overflow-hidden">
                <div
                  class="flex flex-wrap items-center gap-3 border-b p-4"
                  style="border-color: var(--v2-separateur)"
                >
                  <div>
                    <h2 class="text-[16px] font-extrabold">
                      {{ t()("imports.sheet.title", { name: sheet.name }) }}
                    </h2>
                    <span class="sub">
                      {{
                        t()("imports.rows.autre", {
                          count: sheet.rows.length,
                          n: nf.format(sheet.rows.length),
                        })
                      }}
                    </span>
                  </div>
                  <select
                    class="v2-select ml-auto"
                    [attr.aria-label]="t()('imports.sheet.contentAria', { name: sheet.name })"
                    [ngModel]="sheet.entityChoice"
                    (ngModelChange)="onEntityChoice(position, $event)"
                  >
                    <option [value]="IGNORE">{{ t()("imports.sheet.ignore") }}</option>
                    @for (entity of entityOrder; track entity) {
                      <option [value]="entity">
                        {{ t()("imports.sheet.contains", { label: entityLabel(entity) }) }}
                      </option>
                    }
                  </select>
                </div>

                @if (sheet.entityChoice !== IGNORE) {
                  <div class="overflow-x-auto">
                    <table class="tbl">
                      <thead>
                        <tr>
                          <th>{{ t()("imports.map.expected") }}</th>
                          <th>{{ t()("imports.map.column") }}</th>
                          <th>{{ t()("imports.map.preview") }}</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (
                          column of SCHEMA[asEntity(sheet.entityChoice)].columns;
                          track column.key
                        ) {
                          <tr
                            [style.background]="
                              column.required && sheet.mapping[column.key] === null
                                ? TONE.erreur.bg
                                : 'transparent'
                            "
                          >
                            <td>
                              <span class="font-bold">{{ column.label }}</span>
                              @if (column.required) {
                                <span [style.color]="TONE.erreur.fg"> *</span>
                              }
                              @if (column.hint) {
                                <div class="sub text-xs">{{ column.hint }}</div>
                              }
                            </td>
                            <td>
                              <select
                                class="v2-select"
                                [class.err]="column.required && sheet.mapping[column.key] === null"
                                [attr.aria-label]="
                                  t()('imports.map.columnFor', { label: column.label })
                                "
                                [ngModel]="mapSelectValue(sheet.mapping[column.key])"
                                (ngModelChange)="onMapping(position, column.key, $event)"
                              >
                                <option [value]="NONE">{{ t()("imports.map.notProvided") }}</option>
                                @for (header of sheet.headers; track $index; let stepIndex = $index) {
                                  <option [value]="colIdxStr(stepIndex)">
                                    {{ header || t()("imports.map.columnN", { n: stepIndex + 1 }) }}
                                  </option>
                                }
                              </select>
                            </td>
                            <td class="sub max-w-80 truncate text-xs">
                              {{ previewCells(sheet, column.key) }}
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                }
              </div>
            }

            @if (missing().length) {
              <div class="banner" [style.background]="TONE.erreur.bg" [style.color]="TONE.erreur.fg">
                <ui-icon name="warning" [size]="18" />
                <span>{{ t()("imports.map.missing", { list: missing().join(", ") }) }}</span>
              </div>
            }

            <div class="flex flex-wrap gap-3">
              <button
                type="button"
                class="btn btn-primary"
                [disabled]="!active().length || missing().length > 0"
                (click)="runDry()"
              >
                {{ t()("imports.map.runDry") }}
                <span class="btn-chip"><ui-icon name="fact_check" [size]="20" /></span>
              </button>
              <button type="button" class="btn btn-ghost" (click)="reset()">
                {{ t()("imports.abandon") }}
              </button>
            </div>
          </div>
        }

        @if (step() === "rapport" && plan(); as report) {
          <div class="space-y-5">
            <div class="flex items-center gap-3">
              <span
                class="kind-ico"
                [style.background]="TONE.attente.bg"
                [style.color]="TONE.attente.fg"
              >
                <ui-icon name="fact_check" [size]="20" />
              </span>
              <div>
                <h2 class="text-[18px] font-extrabold">
                  {{ t()("imports.report.title", { file: loaded()!.file }) }}
                </h2>
                <p class="sub">{{ t()("imports.report.intro") }}</p>
              </div>
            </div>

            <ui-stat-cards [stats]="planStatCards()" />

            <div class="card overflow-x-auto">
              <table class="tbl">
                <thead>
                  <tr>
                    <th>{{ t()("imports.report.sheet") }}</th>
                    <th>{{ t()("imports.report.content") }}</th>
                    <th class="text-right">{{ t()("imports.report.rowsRead") }}</th>
                    <th class="text-right">{{ t()("imports.kpi.rejectedRows") }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (sheet of report.sheets; track sheet.name) {
                    <tr>
                      <td class="font-bold">{{ sheet.name }}</td>
                      <td>{{ SCHEMA[sheet.entity].label }}</td>
                      <td class="text-right font-semibold tabular-nums">
                        {{ nf.format(sheet.rows) }}
                      </td>
                      <td class="text-right font-bold tabular-nums">
                        @if (sheet.rejects > 0) {
                          <span [style.color]="TONE.erreur.fg">{{ nf.format(sheet.rejects) }}</span>
                        } @else {
                          <span class="zero">0</span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>

            @if (report.issues.length) {
              <div class="card overflow-hidden">
                <div
                  class="flex flex-wrap items-center justify-between gap-3 border-b p-4"
                  style="border-color: var(--v2-separateur)"
                >
                  <div class="seg">
                    <button
                      type="button"
                      [attr.aria-pressed]="issueLevel() === 'rejet'"
                      (click)="issueLevel.set('rejet')"
                    >
                      {{ t()("imports.level.rejects", { count: rejects().length }) }}
                    </button>
                    <button
                      type="button"
                      [attr.aria-pressed]="issueLevel() === 'avertissement'"
                      (click)="issueLevel.set('avertissement')"
                    >
                      {{ t()("imports.level.warnings", { count: warnings().length }) }}
                    </button>
                    <button
                      type="button"
                      [attr.aria-pressed]="issueLevel() === 'tous'"
                      (click)="issueLevel.set('tous')"
                    >
                      {{ t()("imports.level.all") }}
                    </button>
                  </div>
                  <button
                    type="button"
                    class="btn btn-ghost"
                    style="height: 38px; padding: 0 14px; font-size: 13px"
                    (click)="downloadPlanIssues()"
                  >
                    <ui-icon name="download" [size]="16" />
                    {{ t()("imports.report.download") }}
                  </button>
                </div>

                <div class="max-h-96 overflow-auto">
                  <table class="tbl">
                    <thead>
                      <tr>
                        <th>{{ t()("imports.report.sheet") }}</th>
                        <th>{{ t()("imports.report.row") }}</th>
                        <th>{{ t()("imports.report.column") }}</th>
                        <th>{{ t()("imports.report.reason") }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (issue of issuesPager.items(); track $index) {
                        <tr>
                          <td class="font-semibold">{{ issue.sheet }}</td>
                          <td class="tabular-nums">{{ issue.row }}</td>
                          <td>{{ issue.field }}</td>
                          <td
                            class="font-semibold"
                            [style.color]="
                              issue.level === 'rejet' ? TONE.erreur.fg : TONE.attente.fg
                            "
                          >
                            {{ issue.message }}
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>

                <div class="p-4 pt-2">
                  <ui-pagination [pager]="issuesPager" />
                </div>

                @if (shownIssues().length > 500) {
                  <p class="sub px-4 pb-3 text-xs">{{ t()("imports.report.truncated") }}</p>
                }
                @if (!shownIssues().length) {
                  <p class="sub p-6 text-center">{{ t()("imports.report.nothing") }}</p>
                }
              </div>
            }

            <div class="flex flex-wrap gap-3">
              <button
                type="button"
                class="btn btn-primary"
                [disabled]="!writes() || !!sameAsImported()"
                (click)="confirm()"
              >
                {{
                  writes() === 1
                    ? t()("imports.report.confirm.un", { n: nf.format(writes()) })
                    : t()("imports.report.confirm.autre", { n: nf.format(writes()) })
                }}
                <span class="btn-chip"><ui-icon name="check_circle" [size]="20" /></span>
              </button>
              <button type="button" class="btn btn-ghost" (click)="step.set('colonnes')">
                <ui-icon name="arrow_back" [size]="18" />
                {{ t()("imports.report.back") }}
              </button>
              <button type="button" class="btn btn-ghost" (click)="reset()">
                {{ t()("imports.abandon") }}
              </button>
            </div>
            @if (sameAsImported(); as same) {
              <p class="sub">{{ t()("imports.report.blocked", { id: same.id }) }}</p>
            }
            @if (!writes() && !sameAsImported()) {
              <p class="sub">{{ t()("imports.report.nothingToWrite") }}</p>
            }
          </div>
        }

        @if (step() === "termine" && done(); as result) {
          @if (plan(); as importPlan) {
            <div class="card p-6">
              <div class="flex items-center gap-3">
                <span
                  class="kind-ico"
                  [style.background]="TONE.succes.bg"
                  [style.color]="TONE.succes.fg"
                >
                  <ui-icon name="check_circle" [size]="22" />
                </span>
                <div>
                  <h2 class="text-[20px] font-extrabold">
                    {{ t()("imports.done.title", { id: result.id }) }}
                  </h2>
                  <p class="sub mt-0.5">
                    {{
                      t()("imports.done.summary", {
                        producers: nf.format(importPlan.producers.length),
                        plots: nf.format(importPlan.plots.length),
                        orgs: nf.format(importPlan.orgs.length),
                        alerts: nf.format(importPlan.alerts.length),
                        cases: nf.format(importPlan.cases.length),
                      })
                    }}
                  </p>
                </div>
              </div>

              <div class="mt-5 flex flex-wrap gap-3">
                <a routerLink="/dashboard/producteurs" class="btn btn-ghost">
                  {{ t()("imports.done.directory") }}
                </a>
                @if (importPlan.cases.length > 0 && store.can("quality.review")) {
                  <a routerLink="/dashboard/qualite/doublons" class="btn btn-ghost">
                    {{ t()("imports.done.duplicates") }}
                  </a>
                }
                @if (hasUnqualifiedOrgs() && store.can("org.manage")) {
                  <a
                    routerLink="/dashboard/organisations"
                    [queryParams]="{ vue: 'a-qualifier' }"
                    class="btn btn-ghost"
                  >
                    {{ t()("imports.done.qualify") }}
                  </a>
                }
                @if (importPlan.unknownCrops.length > 0 && store.can("config.manage")) {
                  <a
                    routerLink="/dashboard/referentiels"
                    [queryParams]="{ section: 'noms' }"
                    class="btn btn-ghost"
                  >
                    {{
                      importPlan.unknownCrops.length === 1
                        ? t()("imports.done.crops.un", {
                            n: nf.format(importPlan.unknownCrops.length),
                          })
                        : t()("imports.done.crops.autre", {
                            n: nf.format(importPlan.unknownCrops.length),
                          })
                    }}
                  </a>
                }
                <button type="button" class="btn btn-primary" (click)="reset()">
                  {{ t()("imports.done.again") }}
                  <span class="btn-chip"><ui-icon name="upload_file" [size]="20" /></span>
                </button>
              </div>

              <div
                class="banner mt-5"
                [style.background]="TONE.attente.bg"
                [style.color]="TONE.attente.fg"
              >
                <ui-icon name="warning" [size]="18" />
                <span>{{ t()("imports.done.demo") }}</span>
              </div>
            </div>
          }
        }
      </section>

      }

      <!-- ───── Historique des imports ───── -->
      @if (view() === "historique") {
      <section class="rise mt-8 space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="text-[20px] font-extrabold tracking-[-0.02em]">
            {{ t()("imports.history.title") }}
          </h2>
        </div>

        <div class="toolbar">
          <label class="search">
            <ui-icon name="search" [size]="18" />
            <input
              [placeholder]="t()('imports.history.searchPlaceholder')"
              [ngModel]="historyQ()"
              (ngModelChange)="historyQ.set($event)"
            />
          </label>
        </div>

        <div class="card overflow-x-auto">
          @if (filteredBatches().length) {
            <table class="tbl">
              <thead>
                <tr>
                  <th>{{ t()("imports.history.batch") }}</th>
                  <th>{{ t()("imports.history.file") }}</th>
                  <th class="hidden lg:table-cell">{{ t()("imports.history.hash") }}</th>
                  <th>{{ t()("imports.history.date") }}</th>
                  <th class="hidden lg:table-cell">{{ t()("imports.history.script") }}</th>
                  <th>{{ t()("imports.history.mode") }}</th>
                  <th class="text-right">{{ t()("imports.history.counts") }}</th>
                  <th class="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (batch of batchPager.items(); track batch.id + batch.at) {
                  <tr>
                    <td class="font-mono font-bold">{{ batch.id }}</td>
                    <td class="font-semibold">{{ batch.file }}</td>
                    <td class="hidden font-mono text-xs sub lg:table-cell">{{ batch.hash }}</td>
                    <td class="whitespace-nowrap">{{ fmtDateTime(batch.at) }}</td>
                    <td class="hidden text-xs sub lg:table-cell">{{ batch.script }}</td>
                    <td>
                      @if (batch.mode === "réel") {
                        <span
                          class="badge"
                          [style.background]="TONE.succes.bg"
                          [style.color]="TONE.succes.fg"
                        >
                          {{ locale.tEnum("imports.mode", batch.mode) }}
                        </span>
                      } @else {
                        <span
                          class="badge"
                          [style.background]="TONE.attente.bg"
                          [style.color]="TONE.attente.fg"
                        >
                          {{ locale.tEnum("imports.mode", batch.mode) }}
                        </span>
                      }
                    </td>
                    <td class="text-right font-semibold tabular-nums">
                      {{ nf.format(batch.counts.producers) }} · {{ nf.format(batch.counts.plots) }} ·
                      <span [style.color]="batch.counts.rejects > 0 ? TONE.erreur.fg : 'inherit'">
                        {{ nf.format(batch.counts.rejects) }}
                      </span>
                    </td>
                    <td class="text-right">
                      <div class="inline-flex items-center justify-end gap-1.5">
                        @if (hasStoredReport(batch.id)) {
                          <button
                            type="button"
                            class="act"
                            [title]="t()('imports.report.download')"
                            [attr.aria-label]="t()('imports.report.download')"
                            (click)="downloadBatchReport(batch.id)"
                          >
                            <ui-icon name="download" [size]="18" />
                          </button>
                        }
                        <button
                          type="button"
                          class="act"
                          [title]="t()('imports.history.sheetsCsv')"
                          [attr.aria-label]="t()('imports.history.sheetsCsv')"
                          (click)="downloadSheetsCsv(batch)"
                        >
                          <ui-icon name="description" [size]="18" />
                        </button>
                        @if (canAudit()) {
                          <a
                            class="act"
                            routerLink="/dashboard/audit"
                            [queryParams]="{ q: batch.id }"
                            [title]="t()('imports.history.viewJournal')"
                            [attr.aria-label]="t()('imports.history.viewJournal')"
                          >
                            <ui-icon name="history" [size]="18" />
                          </a>
                        }
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
            <div class="p-4 pt-2">
              <ui-pagination [pager]="batchPager" />
            </div>
          } @else {
            <div class="px-6 py-12 text-center">
              <div
                class="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl"
                style="background: var(--v2-creme); color: var(--v2-gris-texte)"
              >
                <ui-icon name="upload_file" [size]="26" />
              </div>
              <div class="text-[16px] font-extrabold">{{ t()("imports.history.empty") }}</div>
              <p class="sub mt-1">{{ t()("imports.history.emptyHint") }}</p>
            </div>
          }
        </div>
      </section>
      }
    </app-shell>
  `,
})
export default class ImportsPage {
  protected readonly store = inject(StoreService);
  protected readonly locale = inject(LocaleService);
  private readonly snack = inject(SnackbarService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly host = inject(ElementRef);
  protected readonly t = this.locale.t;
  protected readonly fmtDateTime = fmtDateTime;
  protected readonly nf = nf;
  protected readonly TONE = TONE;
  protected readonly SCHEMA = SCHEMA;
  /** Ordre des entités pour les listes déroulantes (tableau, pas l'itérateur `ENTITY_ORDER`). */
  protected readonly entityOrder: readonly EntityKey[] = ENTITY_ORDER_ARR;
  protected readonly STEPS = STEPS;
  protected readonly IGNORE = IGNORE;
  protected readonly NONE = NONE;

  protected readonly csvOpen = signal(false);
  protected readonly historyQ = signal("");
  protected readonly step = signal<Step>("depot");
  protected readonly loaded = signal<Loaded | null>(null);
  protected readonly plan = signal<ImportPlan | null>(null);
  protected readonly done = signal<ImportBatch | null>(null);
  protected readonly busy = signal(false);
  protected readonly drag = signal(false);
  protected readonly flash = signal("");
  protected readonly issueLevel = signal<"rejet" | "avertissement" | "tous">("rejet");
  protected readonly sessionReports = new Map<string, Issue[]>();

  /** Mode API : pas de lots fictifs, le rapport Kobo remplace la liste. */
  protected readonly koboMode = isApiMode();
  protected readonly koboReport = signal<ApiKoboReport | null>(null);
  protected readonly koboState = signal<"idle" | "loading" | "error" | "empty" | "ready">("idle");
  private readonly expandedOrphans = signal<ReadonlySet<OrphanList>>(new Set());

  /** Mode API : pas de lots fictifs, le rapport Kobo remplace la liste. */
  protected readonly batches = computed(() => (this.koboMode ? [] : this.store.state().imports));

  // ── Sections de la page (une à la fois, dans l'adresse : ?vue=kobo|consolide|import|historique) ──
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly views = computed(() => {
    const all: { id: ImportView; label: MessageKey; icon: "fact_check" | "folder_open" | "upload_file" | "event_note" }[] = [
      { id: "kobo", label: "imports.tab.kobo", icon: "fact_check" },
      { id: "consolide", label: "imports.tab.consolide", icon: "folder_open" },
      { id: "import", label: "imports.tab.import", icon: "upload_file" },
      { id: "historique", label: "imports.tab.history", icon: "event_note" },
    ];
    return this.koboMode ? all : all.filter((item) => item.id === "import" || item.id === "historique");
  });
  private readonly requestedView = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get("vue"))),
    { initialValue: this.route.snapshot.queryParamMap.get("vue") },
  );
  protected readonly view = computed<ImportView>(() => {
    const requested = this.requestedView();
    const available = this.views();
    return available.find((item) => item.id === requested)?.id ?? available[0]!.id;
  });

  /** Sections du rapport Kobo : une seule à l'écran, pour ne pas faire défiler toute la page. */
  protected readonly koboSection = signal<KoboSection>("volumes");

  protected koboSections(report: ApiKoboReport): { id: KoboSection; label: MessageKey; count: number | null }[] {
    return [
      { id: "volumes", label: "imports.kobo.tab.volumes", count: null },
      { id: "geojson", label: "imports.kobo.tab.geojson", count: report.orphans.geojsonPoints.length },
      { id: "photos", label: "imports.kobo.tab.photos", count: report.orphans.photoFolders.length },
      { id: "sansCulture", label: "imports.kobo.tab.sansCulture", count: report.orphans.plotsWithoutCrop.length },
      { id: "sansPhoto", label: "imports.kobo.tab.sansPhoto", count: report.orphans.producersWithoutPhoto.length },
      { id: "partages", label: "imports.kobo.tab.partages", count: report.orphans.sharedCni.length + report.orphans.sharedPhone.length },
    ];
  }

  protected setView(next: ImportView) {
    void this.router.navigate([], { queryParams: { vue: next }, queryParamsHandling: "merge", replaceUrl: true });
  }

  constructor() {
    if (this.koboMode && isPlatformBrowser(this.platformId)) void this.loadKoboReport();
  }

  protected async loadKoboReport(): Promise<void> {
    this.koboState.set("loading");
    try {
      const report = await fetchKoboReport();
      this.koboReport.set(report);
      this.koboState.set("ready");
    } catch (error) {
      this.koboReport.set(null);
      // 404 : aucun lot Kobo sur le serveur ; toute autre erreur est un échec de chargement.
      this.koboState.set(error instanceof ApiError && error.status === 404 ? "empty" : "error");
    }
  }

  protected readonly koboCounts = computed(() => {
    const counts = this.koboReport()?.batch.counts ?? {};
    const translate = this.t();
    return Object.entries(counts).map(([key, value]) => ({
      key,
      value,
      label: KOBO_COUNT_KEYS[key] ? translate(KOBO_COUNT_KEYS[key]) : key,
    }));
  });

  protected readonly koboStatCards = computed<StatCard[]>(() =>
    this.koboCounts().map((c, idx) => ({
      label: c.label,
      value: nf.format(c.value),
      sub: "",
      icon: idx === 0 ? "folder_open" : "description",
      ...(idx % 2 === 0 ? TONE.info : TONE.culture),
    })),
  );

  protected readonly planStatCards = computed<StatCard[]>(() => {
    const p = this.plan();
    if (!p) return [];
    const tr = this.t();
    return [
      { label: tr("imports.kpi.newOrgs"), value: nf.format(p.orgs.length), sub: "", icon: "folder_open", ...TONE.info },
      { label: tr("imports.kpi.producers"), value: nf.format(p.producers.length), sub: "", icon: "badge", ...TONE.succes },
      { label: tr("imports.kpi.plots"), value: nf.format(p.plots.length), sub: "", icon: "map", ...TONE.culture },
      {
        label: tr("imports.kpi.rejectedRows"),
        value: nf.format(this.rejectedRows()),
        sub: tr("imports.kpi.reasons.autre", {
          count: this.rejects().length,
          n: nf.format(this.rejects().length),
        }),
        icon: "warning",
        ...(this.rejectedRows() ? TONE.erreur : TONE.neutre),
      },
      {
        label: tr("imports.kpi.warnings"),
        value: nf.format(this.warnings().length),
        sub: tr("imports.kpi.warningsSub"),
        icon: "info",
        ...(this.warnings().length ? TONE.attente : TONE.neutre),
      },
      {
        label: tr("imports.kpi.duplicates"),
        value: nf.format(p.cases.length),
        sub: "",
        icon: "fact_check",
        ...(p.cases.length ? TONE.attente : TONE.neutre),
      },
    ];
  });

  protected visibleOrphans<T>(list: OrphanList, items: readonly T[]): readonly T[] {
    return this.expandedOrphans().has(list) ? items : items.slice(0, ORPHAN_PREVIEW);
  }

  protected hiddenCount(list: OrphanList, total: number): number {
    return this.expandedOrphans().has(list) ? 0 : Math.max(total - ORPHAN_PREVIEW, 0);
  }

  protected showAll(list: OrphanList): void {
    this.expandedOrphans.update((current) => new Set([...current, list]));
  }

  /** Producteur d'une parcelle : lu dans le store, sinon déduit du code (`<code producteur>-P<n>`). */
  protected producerOfPlot(plotId: string): string {
    return (
      this.store.state().plots.find((plot) => plot.id === plotId)?.producerId ??
      plotId.replace(/-P\d+$/, "")
    );
  }

  /** Aperçu d'une ligne de propriétés brutes (point GeoJSON), sur une ligne. */
  protected summarize(data: Record<string, unknown>): string {
    const text = JSON.stringify(data ?? {});
    return text.length > 240 ? `${text.slice(0, 240)}…` : text;
  }

  protected readonly filteredBatches = computed(() => {
    const n = this.historyQ().trim().toLowerCase();
    return this.batches().filter(
      (b) =>
        !n ||
        b.id.toLowerCase().includes(n) ||
        b.file.toLowerCase().includes(n) ||
        b.hash.toLowerCase().includes(n),
    );
  });

  protected readonly stepIdx = computed(() => STEPS.indexOf(this.step()));

  protected readonly sameAsImported = computed(() => {
    const L = this.loaded();
    if (!L) return undefined;
    return this.batches().find((b) => b.hash === L.hash && b.mode === "réel");
  });

  protected readonly active = computed(() =>
    (this.loaded()?.sheets ?? []).filter((s) => s.entityChoice !== IGNORE),
  );

  protected readonly missing = computed(() =>
    this.active().flatMap((s) =>
      SCHEMA[s.entityChoice as EntityKey].columns
        .filter((c) => c.required && s.mapping[c.key] === null)
        .map((c) => `${s.name} › ${c.label}`),
    ),
  );

  protected readonly rejects = computed(
    () => this.plan()?.issues.filter((i) => i.level === "rejet") ?? [],
  );
  protected readonly warnings = computed(
    () => this.plan()?.issues.filter((i) => i.level === "avertissement") ?? [],
  );
  protected readonly shownIssues = computed(() => {
    const level = this.issueLevel();
    const issues = this.plan()?.issues ?? [];
    return level === "tous" ? issues : issues.filter((i) => i.level === level);
  });
  protected readonly rejectedRows = computed(
    () => this.plan()?.sheets.reduce((n, s) => n + s.rejects, 0) ?? 0,
  );
  protected readonly writes = computed(() => {
    const p = this.plan();
    if (!p) return 0;
    return p.producers.length + p.plots.length + p.orgs.length;
  });

  protected asEntity(v: string): EntityKey {
    return v as EntityKey;
  }

  entityLabel(e: EntityKey): string {
    return SCHEMA[e].label;
  }

  protected mapSelectValue(idx: number | null | undefined): string {
    return idx === null || idx === undefined ? NONE : String(idx);
  }

  protected previewCells(s: SheetState, key: string): string {
    const idx = s.mapping[key];
    if (idx === null || idx === undefined) return this.t()("imports.map.empty");
    return s.rows
      .slice(0, 3)
      .map((r) => r[idx] || "∅")
      .join(" · ");
  }

  protected hasUnqualifiedOrgs(): boolean {
    return !!this.plan()?.orgs.some((o) => !o.type);
  }

  protected canAudit(): boolean {
    return can(getState().session, "role.configure");
  }

  hasStoredReport(id: string): boolean {
    return this.sessionReports.has(id);
  }

  @HostListener("document:click", ["$event"])
  onDocumentClick(ev: MouseEvent): void {
    if (!this.csvOpen()) return;
    const root = this.host.nativeElement as HTMLElement;
    if (root.querySelector("[data-csv-menu]")?.contains(ev.target as Node)) return;
    this.csvOpen.set(false);
  }

  toggleCsvMenu(ev: Event): void {
    ev.stopPropagation();
    this.csvOpen.update((v) => !v);
  }

  private nextId(): string {
    return `L-${String(getState().imports.length + 1).padStart(3, "0")}`;
  }

  colIdxStr(k: number): string {
    return String(k);
  }

  protected reset(): void {
    this.step.set("depot");
    this.loaded.set(null);
    this.plan.set(null);
    this.done.set(null);
    this.flash.set("");
  }

  protected onDragOver(ev: DragEvent): void {
    ev.preventDefault();
    this.drag.set(true);
  }

  protected onDrop(ev: DragEvent): void {
    ev.preventDefault();
    this.drag.set(false);
    void this.onFile(ev.dataTransfer?.files?.[0]);
  }

  protected onFileInput(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    void this.onFile(input.files?.[0]);
    input.value = "";
  }

  private async onFile(f: File | undefined): Promise<void> {
    if (!isPlatformBrowser(this.platformId) || !f) return;
    if (!/\.(xlsx|xls|csv|txt)$/i.test(f.name)) {
      this.flash.set(
        `${this.t()("imports.error.format")} — ${this.t()("imports.error.formatHint")}`,
      );
      return;
    }
    this.busy.set(true);
    this.flash.set("");
    try {
      const [raw, hash] = await Promise.all([readFile(f), sha(f)]);
      const sheets: SheetState[] = raw.map((r: RawSheet) => {
        const [head = [], ...rows] = r.rows;
        const headersRow = head.map((h) => h.trim());
        const entity =
          detectEntity(r.name, headersRow) ?? (raw.length === 1 ? "producteurs" : null);
        const ent = entity ?? "producteurs";
        return {
          name: r.name,
          headers: headersRow,
          rows,
          entity: ent,
          entityChoice: entity && r.name !== "Lisez-moi" ? entity : IGNORE,
          mapping: autoMap(ent, headersRow),
        };
      });
      if (!sheets.length) throw new Error(this.t()("imports.error.noSheet"));
      this.loaded.set({ file: f.name, hash, sheets });
      this.step.set("colonnes");
    } catch (e) {
      this.flash.set(
        `${this.t()("imports.error.read")} — ${
          e instanceof Error ? e.message : this.t()("imports.error.unreadable")
        }`,
      );
    } finally {
      this.busy.set(false);
    }
  }

  protected onEntityChoice(i: number, v: string): void {
    this.loaded.update((L) => {
      if (!L) return L;
      const sheets = L.sheets.map((s, k) => {
        if (k !== i) return s;
        if (v === IGNORE) return { ...s, entityChoice: IGNORE as typeof IGNORE };
        const entity = v as EntityKey;
        return {
          ...s,
          entityChoice: entity,
          entity,
          mapping: autoMap(entity, s.headers),
        };
      });
      return { ...L, sheets };
    });
  }

  protected onMapping(i: number, key: string, v: string): void {
    this.loaded.update((L) => {
      if (!L) return L;
      const sheets = L.sheets.map((s, k) =>
        k !== i
          ? s
          : {
              ...s,
              mapping: { ...s.mapping, [key]: v === NONE ? null : Number(v) },
            },
      );
      return { ...L, sheets };
    });
  }

  protected runDry(): void {
    const L = this.loaded();
    if (!L) return;
    if (this.koboMode) {
      this.flash.set(this.t()("errors.api.unavailable"));
      return;
    }
    const st = getState();
    const id = this.nextId();
    const p = buildPlan(
      this.active().map((s) => ({ ...s, entity: s.entityChoice as EntityKey })),
      {
        producers: st.producers,
        orgs: st.orgs,
        plots: st.plots,
        cropRefs: st.cropRefs,
        seuils: st.seuils,
      },
      { batchId: id, now: new Date().toISOString() },
    );
    this.store.actions.addImport({
      id,
      file: L.file,
      hash: L.hash,
      at: new Date().toISOString(),
      script: SCRIPT,
      mode: "à blanc",
      counts: planCounts(p),
      sheets: p.sheets.map(({ name, rows, rejects }) => ({ name, rows, rejects })),
    });
    this.sessionReports.set(id, p.issues);
    this.plan.set(p);
    this.issueLevel.set("rejet");
    this.step.set("rapport");
  }

  protected confirm(): void {
    const L = this.loaded();
    if (!L) return;
    if (this.koboMode) {
      this.flash.set(this.t()("errors.api.unavailable"));
      return;
    }
    const st = getState();
    const id = this.nextId();
    const p = buildPlan(
      this.active().map((s) => ({ ...s, entity: s.entityChoice as EntityKey })),
      {
        producers: st.producers,
        orgs: st.orgs,
        plots: st.plots,
        cropRefs: st.cropRefs,
        seuils: st.seuils,
      },
      { batchId: id, now: new Date().toISOString() },
    );
    const batch: ImportBatch = {
      id,
      file: L.file,
      hash: L.hash,
      at: new Date().toISOString(),
      script: SCRIPT,
      mode: "réel",
      counts: planCounts(p),
      sheets: p.sheets.map(({ name, rows, rejects }) => ({ name, rows, rejects })),
    };
    this.store.actions.ingestImport(p, batch);
    this.sessionReports.set(id, p.issues);
    this.plan.set(p);
    this.done.set(batch);
    this.step.set("termine");
    const msg = `${this.t()("imports.toast.done")} — ${this.t()("imports.toast.added", {
      producers: nf.format(p.producers.length),
      plots: nf.format(p.plots.length),
    })}`;
    this.flash.set(msg);
    this.snack.show("success", msg);
  }

  protected downloadPlanIssues(): void {
    const L = this.loaded();
    const p = this.plan();
    if (!L || !p) return;
    this.downloadIssues(p.issues, `rapport_import_a_blanc_${L.file.replace(/\.[^.]+$/, "")}.csv`);
  }

  protected downloadBatchReport(id: string): void {
    this.downloadIssues(this.sessionReports.get(id) ?? [], `rapport_${id}.csv`);
  }

  private downloadIssues(issues: Issue[], name: string): void {
    downloadCsv(name, [
      ["Feuille", "Ligne", "Colonne", "Niveau", "Motif"],
      ...issues.map((i) => [i.sheet, i.row, i.field, i.level, i.message]),
    ]);
  }

  async downloadExcelTemplate(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    await downloadWorkbook("modele_import_mbay_diaay.xlsx", templateSheets());
    this.store.actions.audit("Téléchargement", "Modèle d'import", "Excel");
  }

  downloadEntityCsv(e: EntityKey): void {
    downloadCsv(`modele_${e}.csv`, [headers(e), SCHEMA[e].columns.map((c) => c.example)]);
  }

  downloadSheetsCsv(b: ImportBatch): void {
    downloadCsv(`feuilles_${b.id}.csv`, [
      ["Feuille", "Lignes lues", "Lignes rejetées"],
      ...b.sheets.map((s) => [s.name, s.rows, s.rejects]),
    ]);
  }

  /** Pagination (shownIssues) : mêmes règles que l'API (?page=&limit=). */
  protected readonly issuesPager = createPager(() => this.shownIssues());

  /** Pagination (filteredBatches) : mêmes règles que l'API (?page=&limit=). */
  protected readonly batchPager = createPager(() => this.filteredBatches());
}
