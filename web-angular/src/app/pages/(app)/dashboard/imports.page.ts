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
import { RouterLink } from "@angular/router";
import {
  LucideAngularModule,
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FlaskConical,
  Info,
  Loader2,
  RotateCcw,
  Upload,
  XCircle,
} from "lucide-angular";

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
import { actions, can, getState, type ImportBatch } from "@/lib/store";
import { cn } from "@/lib/utils";
import { AppShellComponent } from "@shared/app-shell.component";
import { LocaleService } from "@shared/locale.service";
import { StoreService } from "@shared/store.service";
import {
  PaginationComponent,
  UiButtonComponent,
  UiKpiTileComponent,
  UiPageHeaderComponent,
  UiPillComponent,
} from "@shared/ui";
import { createPager } from "@shared/pager";

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

/** Port de src/routes/imports.tsx — dépôt → colonnes → rapport à blanc → écriture. */
@Component({
  selector: "app-imports-page",
  imports: [
    PaginationComponent,
    CommonModule,
    FormsModule,
    RouterLink,
    LucideAngularModule,
    AppShellComponent,
    UiButtonComponent,
    UiKpiTileComponent,
    UiPageHeaderComponent,
    UiPillComponent,
  ],
  template: `
    <app-shell perm="import.manage" [area]="t()('imports.area')">
      <ui-page-header
        [eyebrow]="t()('imports.eyebrow')"
        [title]="t()('imports.title')"
        [description]="t()('imports.description')"
      >
        <div actions class="flex flex-wrap gap-2">
          <ui-button variant="outline" (click)="downloadExcelTemplate()">
            <lucide-angular [img]="icons.sheet" class="size-4" />
            {{ t()("imports.template.excel") }}
          </ui-button>
          <div class="relative inline-block" data-csv-menu>
            <ui-button
              variant="outline"
              type="button"
              [attr.aria-expanded]="csvOpen()"
              [attr.aria-label]="t()('imports.template.csvTitle')"
              (click)="toggleCsvMenu($event)"
            >
              <lucide-angular [img]="icons.download" class="size-4" />
              {{ t()("imports.template.csv") }}
            </ui-button>
            @if (csvOpen()) {
              <div
                class="absolute right-0 z-10 mt-1 min-w-56 rounded-md border bg-popover p-2 text-sm shadow-md"
                data-csv-menu
              >
                @for (entity of entityOrder; track entity) {
                  <button
                    type="button"
                    class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
                    (click)="downloadEntityCsv(entity); csvOpen.set(false)"
                  >
                    <lucide-angular [img]="icons.download" class="size-4" />
                    {{ t()("imports.template.entity", { label: entityLabel(entity) }) }}
                  </button>
                }
              </div>
            }
          </div>
        </div>
      </ui-page-header>

      @if (flash()) {
        <p class="mb-3 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm">
          {{ flash() }}
        </p>
      }

      @if (koboMode) {
        <section class="mb-8 space-y-4" aria-labelledby="kobo-report-title">
          <div class="flex flex-wrap items-center gap-2">
            <lucide-angular [img]="icons.sheet" class="size-5 text-primary" />
            <h2 id="kobo-report-title" class="font-semibold">{{ t()("imports.kobo.title") }}</h2>
            @if (koboReport(); as report) {
              <span class="text-sm text-muted-foreground">
                {{
                  t()("imports.kobo.batch", {
                    id: report.batch.id,
                    date: fmtDateTime(report.batch.importedAt),
                  })
                }}
              </span>
            }
          </div>
          <p class="text-sm text-muted-foreground">{{ t()("imports.kobo.intro") }}</p>

          @if (koboState() === "loading") {
            <p class="surface flex items-center gap-2 p-4 text-sm">
              <lucide-angular [img]="icons.loader" class="size-4 animate-spin text-primary" />
              {{ t()("imports.kobo.loading") }}
            </p>
          } @else if (koboState() === "error") {
            <div class="flex flex-wrap items-center gap-3 rounded-md bg-danger-bg p-3 text-sm text-danger-fg">
              <lucide-angular [img]="icons.x" class="size-4 shrink-0" />
              <span class="flex-1">{{ t()("imports.kobo.error") }}</span>
              <ui-button variant="outline" size="sm" (click)="loadKoboReport()">
                <lucide-angular [img]="icons.reset" class="size-4" />
                {{ t()("imports.kobo.retry") }}
              </ui-button>
            </div>
          } @else if (koboState() === "empty") {
            <p class="surface p-4 text-sm text-muted-foreground">{{ t()("imports.kobo.empty") }}</p>
          }

          @if (koboReport(); as report) {
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
              @for (count of koboCounts(); track count.key) {
                <ui-kpi-tile [label]="count.label" [value]="nf.format(count.value)" />
              }
            </div>

            <div class="grid gap-4 lg:grid-cols-2">
              <div class="surface overflow-x-auto">
                <table class="w-full text-sm">
                  <thead class="border-b bg-muted text-left text-xs text-muted-foreground">
                    <tr>
                      <th class="px-4 py-2.5 font-semibold">{{ t()("imports.kobo.sheet") }}</th>
                      <th class="pr-4 text-right font-semibold">{{ t()("imports.kobo.rows") }}</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y">
                    @for (sheet of report.sheets; track sheet.sheet) {
                      <tr>
                        <td class="px-4 py-2 font-medium">{{ sheet.sheet }}</td>
                        <td class="pr-4 text-right tabular">{{ nf.format(sheet.rows) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>

              <div class="grid grid-cols-2 content-start gap-3">
                <ui-kpi-tile
                  [label]="t()('imports.kobo.orphans.geojson')"
                  [value]="nf.format(report.orphans.geojsonPoints.length)"
                  [tone]="report.orphans.geojsonPoints.length ? 'warning' : 'neutral'"
                />
                <ui-kpi-tile
                  [label]="t()('imports.kobo.orphans.photoFolders')"
                  [value]="nf.format(report.orphans.photoFolders.length)"
                  [tone]="report.orphans.photoFolders.length ? 'warning' : 'neutral'"
                />
                <ui-kpi-tile
                  [label]="t()('imports.kobo.orphans.unidentified')"
                  [value]="nf.format(report.orphans.unidentifiedPhotos)"
                  [sub]="t()('imports.kobo.orphans.unidentifiedSub')"
                  [tone]="report.orphans.unidentifiedPhotos ? 'warning' : 'neutral'"
                />
                <ui-kpi-tile
                  [label]="t()('imports.kobo.orphans.plotsWithoutCrop')"
                  [value]="nf.format(report.orphans.plotsWithoutCrop.length)"
                  [tone]="report.orphans.plotsWithoutCrop.length ? 'warning' : 'neutral'"
                />
                <ui-kpi-tile
                  [label]="t()('imports.kobo.orphans.producersWithoutPhoto')"
                  [value]="nf.format(report.orphans.producersWithoutPhoto.length)"
                  [tone]="report.orphans.producersWithoutPhoto.length ? 'warning' : 'neutral'"
                />
                <ui-kpi-tile
                  [label]="t()('imports.kobo.orphans.sharedCni')"
                  [value]="nf.format(report.orphans.sharedCni.length)"
                  [sub]="t()('imports.kobo.orphans.groupsSub')"
                  [tone]="report.orphans.sharedCni.length ? 'danger' : 'neutral'"
                />
                <ui-kpi-tile
                  [label]="t()('imports.kobo.orphans.sharedPhone')"
                  [value]="nf.format(report.orphans.sharedPhone.length)"
                  [sub]="t()('imports.kobo.orphans.groupsSub')"
                  [tone]="report.orphans.sharedPhone.length ? 'danger' : 'neutral'"
                />
              </div>
            </div>

            <h3 class="pt-2 font-semibold">{{ t()("imports.kobo.orphans") }}</h3>

            <!-- Points GeoJSON sans producteur -->
            <details class="surface p-4" [open]="report.orphans.geojsonPoints.length > 0">
              <summary class="cursor-pointer font-medium">
                {{ t()("imports.kobo.orphans.geojson") }} ({{
                  nf.format(report.orphans.geojsonPoints.length)
                }})
              </summary>
              @if (report.orphans.geojsonPoints.length) {
                <div class="mt-3 max-h-96 overflow-auto">
                  <table class="w-full text-sm">
                    <thead class="sticky top-0 bg-card text-left text-xs text-muted-foreground">
                      <tr>
                        <th class="py-2 pr-3 font-semibold">
                          {{ t()("imports.kobo.orphans.geojsonRef") }}
                        </th>
                        <th class="font-semibold">{{ t()("imports.kobo.orphans.geojsonData") }}</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y">
                      @for (point of visibleOrphans("geojson", report.orphans.geojsonPoints); track $index) {
                        <tr>
                          <td class="py-1.5 pr-3 font-mono text-xs">{{ point.ref || "—" }}</td>
                          <td class="max-w-[40rem] truncate font-mono text-xs text-muted-foreground">
                            {{ summarize(point.data) }}
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
                @if (hiddenCount("geojson", report.orphans.geojsonPoints.length); as hidden) {
                  <ui-button variant="ghost" size="sm" class="mt-2" (click)="showAll('geojson')">
                    {{ t()("imports.kobo.orphans.more", { count: nf.format(hidden) }) }}
                  </ui-button>
                }
              } @else {
                <p class="mt-2 text-sm text-muted-foreground">{{ t()("imports.kobo.orphans.none") }}</p>
              }
            </details>

            <!-- Dossiers photo sans producteur -->
            <details class="surface p-4" [open]="report.orphans.photoFolders.length > 0">
              <summary class="cursor-pointer font-medium">
                {{ t()("imports.kobo.orphans.photoFolders") }} ({{
                  nf.format(report.orphans.photoFolders.length)
                }})
              </summary>
              @if (report.orphans.photoFolders.length) {
                <div class="mt-3 max-h-96 overflow-auto">
                  <table class="w-full text-sm">
                    <thead class="sticky top-0 bg-card text-left text-xs text-muted-foreground">
                      <tr>
                        <th class="py-2 pr-3 font-semibold">{{ t()("imports.kobo.orphans.folder") }}</th>
                        <th class="text-right font-semibold">{{ t()("imports.kobo.orphans.files") }}</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y">
                      @for (folder of visibleOrphans("photoFolders", report.orphans.photoFolders); track folder.folder) {
                        <tr>
                          <td class="py-1.5 pr-3 font-mono text-xs">{{ folder.folder }}</td>
                          <td class="text-right tabular">{{ nf.format(folder.files) }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
                @if (hiddenCount("photoFolders", report.orphans.photoFolders.length); as hidden) {
                  <ui-button variant="ghost" size="sm" class="mt-2" (click)="showAll('photoFolders')">
                    {{ t()("imports.kobo.orphans.more", { count: nf.format(hidden) }) }}
                  </ui-button>
                }
              } @else {
                <p class="mt-2 text-sm text-muted-foreground">{{ t()("imports.kobo.orphans.none") }}</p>
              }
            </details>

            <!-- Parcelles sans culture -->
            <details class="surface p-4" [open]="report.orphans.plotsWithoutCrop.length > 0">
              <summary class="cursor-pointer font-medium">
                {{ t()("imports.kobo.orphans.plotsWithoutCrop") }} ({{
                  nf.format(report.orphans.plotsWithoutCrop.length)
                }})
              </summary>
              @if (report.orphans.plotsWithoutCrop.length) {
                <div class="mt-3 flex flex-wrap gap-2">
                  @for (plotId of visibleOrphans("plotsWithoutCrop", report.orphans.plotsWithoutCrop); track plotId) {
                    <a
                      class="rounded-full border px-3 py-1 font-mono text-xs hover:bg-muted"
                      [routerLink]="['/dashboard/producteurs', producerOfPlot(plotId)]"
                      [attr.aria-label]="t()('imports.kobo.openProducer', { code: producerOfPlot(plotId) })"
                      >{{ plotId }}</a
                    >
                  }
                </div>
                @if (hiddenCount("plotsWithoutCrop", report.orphans.plotsWithoutCrop.length); as hidden) {
                  <ui-button variant="ghost" size="sm" class="mt-2" (click)="showAll('plotsWithoutCrop')">
                    {{ t()("imports.kobo.orphans.more", { count: nf.format(hidden) }) }}
                  </ui-button>
                }
              } @else {
                <p class="mt-2 text-sm text-muted-foreground">{{ t()("imports.kobo.orphans.none") }}</p>
              }
            </details>

            <!-- Producteurs sans photo -->
            <details class="surface p-4">
              <summary class="cursor-pointer font-medium">
                {{ t()("imports.kobo.orphans.producersWithoutPhoto") }} ({{
                  nf.format(report.orphans.producersWithoutPhoto.length)
                }})
              </summary>
              @if (report.orphans.producersWithoutPhoto.length) {
                <div class="mt-3 flex flex-wrap gap-2">
                  @for (code of visibleOrphans("producersWithoutPhoto", report.orphans.producersWithoutPhoto); track code) {
                    <a
                      class="rounded-full border px-3 py-1 font-mono text-xs hover:bg-muted"
                      [routerLink]="['/dashboard/producteurs', code]"
                      [attr.aria-label]="t()('imports.kobo.openProducer', { code })"
                      >{{ code }}</a
                    >
                  }
                </div>
                @if (hiddenCount("producersWithoutPhoto", report.orphans.producersWithoutPhoto.length); as hidden) {
                  <ui-button variant="ghost" size="sm" class="mt-2" (click)="showAll('producersWithoutPhoto')">
                    {{ t()("imports.kobo.orphans.more", { count: nf.format(hidden) }) }}
                  </ui-button>
                }
              } @else {
                <p class="mt-2 text-sm text-muted-foreground">{{ t()("imports.kobo.orphans.none") }}</p>
              }
            </details>

            <!-- CNI et téléphones partagés : seulement les codes producteurs, jamais la valeur -->
            @for (
              shared of [
                { label: t()("imports.kobo.orphans.sharedCni"), groups: report.orphans.sharedCni },
                { label: t()("imports.kobo.orphans.sharedPhone"), groups: report.orphans.sharedPhone },
              ];
              track shared.label
            ) {
              <details class="surface p-4" [open]="shared.groups.length > 0">
                <summary class="cursor-pointer font-medium">
                  {{ shared.label }} ({{ nf.format(shared.groups.length) }})
                </summary>
                @if (shared.groups.length) {
                  <ul class="mt-3 divide-y text-sm">
                    @for (group of shared.groups; track $index; let groupIndex = $index) {
                      <li class="flex flex-wrap items-center gap-2 py-2">
                        <span class="w-24 text-xs font-semibold text-muted-foreground">
                          {{ t()("imports.kobo.orphans.group", { index: groupIndex + 1 }) }}
                        </span>
                        @for (code of group; track code) {
                          <a
                            class="rounded-full border px-3 py-1 font-mono text-xs hover:bg-muted"
                            [routerLink]="['/dashboard/producteurs', code]"
                            [attr.aria-label]="t()('imports.kobo.openProducer', { code })"
                            >{{ code }}</a
                          >
                        }
                      </li>
                    }
                  </ul>
                } @else {
                  <p class="mt-2 text-sm text-muted-foreground">{{ t()("imports.kobo.orphans.none") }}</p>
                }
              </details>
            }
          }
        </section>
      }

      <ol
        class="mb-5 flex flex-wrap items-center gap-2 text-sm"
        [attr.aria-label]="t()('imports.steps.label')"
      >
        @for (stepName of STEPS; track stepName; let position = $index) {
          <li class="flex items-center gap-2">
            <span
              class="grid size-6 place-items-center rounded-full text-xs font-semibold"
              [class]="
                cn(
                  position < stepIdx()
                    ? 'bg-primary text-primary-foreground'
                    : position === stepIdx()
                      ? 'bg-primary-soft text-primary ring-2 ring-primary'
                      : 'bg-muted text-muted-foreground'
                )
              "
            >
              {{ position + 1 }}
            </span>
            <span
              [class.font-semibold]="position === stepIdx()"
              [class.text-muted-foreground]="position !== stepIdx()"
            >
              {{ locale.tEnum("imports.step", stepName) }}
            </span>
            @if (position < STEPS.length - 1) {
              <span class="mx-1 h-px w-6 bg-border"></span>
            }
          </li>
        }
      </ol>

      @if (step() === "depot") {
        <label
          class="surface bg-dots flex cursor-pointer flex-col items-center gap-2 border-dashed p-10 text-center hover:border-primary"
          [class.border-primary]="drag()"
          [class.bg-primary-soft]="drag()"
          (click)="fileInput.click()"
          (dragover)="onDragOver($event)"
          (dragleave)="drag.set(false)"
          (drop)="onDrop($event)"
        >
          @if (busy()) {
            <lucide-angular [img]="icons.loader" class="size-6 animate-spin text-primary" />
          } @else {
            <lucide-angular [img]="icons.upload" class="size-6 text-primary" />
          }
          <span class="font-semibold">
            {{ busy() ? t()("imports.drop.reading") : t()("imports.drop.prompt") }}
          </span>
          <span class="max-w-lg text-sm text-muted-foreground">{{ t()("imports.drop.hint") }}</span>
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
        <section class="space-y-4">
          <div class="surface flex flex-wrap items-center gap-3 p-4 text-sm">
            <lucide-angular [img]="icons.sheet" class="size-5 text-primary" />
            <span class="font-semibold">{{ L.file }}</span>
            <span class="font-mono text-xs text-muted-foreground">
              {{ t()("imports.hash", { hash: L.hash }) }}
            </span>
            <ui-button variant="ghost" size="sm" class="ml-auto" (click)="reset()">
              <lucide-angular [img]="icons.reset" class="size-4" />
              {{ t()("imports.changeFile") }}
            </ui-button>
          </div>
          @if (sameAsImported(); as same) {
            <p class="flex items-start gap-2 rounded-md bg-info-bg p-3 text-sm text-info-fg">
              <lucide-angular [img]="icons.info" class="mt-0.5 size-4 shrink-0" />
              {{
                t()("imports.sameFile", {
                  id: same.id,
                  date: fmtDateTime(same.at),
                })
              }}
            </p>
          }
          @for (sheet of L.sheets; track sheet.name; let position = $index) {
            <div class="surface p-4">
              <div class="flex flex-wrap items-center gap-3">
                <h2 class="font-semibold">
                  {{ t()("imports.sheet.title", { name: sheet.name }) }}
                </h2>
                <span class="text-sm text-muted-foreground">
                  {{
                    t()("imports.rows.autre", {
                      count: sheet.rows.length,
                      n: nf.format(sheet.rows.length),
                    })
                  }}
                </span>
                <select
                  class="ml-auto h-9 w-56 rounded-md border border-input bg-background px-3 text-sm"
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
                <div class="mt-3 overflow-x-auto">
                  <table class="w-full text-sm">
                    <thead class="border-b text-left text-xs text-muted-foreground">
                      <tr>
                        <th class="py-2 font-semibold">{{ t()("imports.map.expected") }}</th>
                        <th class="font-semibold">{{ t()("imports.map.column") }}</th>
                        <th class="font-semibold">{{ t()("imports.map.preview") }}</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y">
                      @for (
                        column of SCHEMA[asEntity(sheet.entityChoice)].columns;
                        track column.key
                      ) {
                        <tr
                          [class.bg-danger-bg/40]="
                            column.required && sheet.mapping[column.key] === null
                          "
                        >
                          <td class="py-2 pr-3">
                            <span class="font-medium">{{ column.label }}</span>
                            @if (column.required) {
                              <span class="text-danger-fg"> *</span>
                            }
                            @if (column.hint) {
                              <div class="text-xs text-muted-foreground">{{ column.hint }}</div>
                            }
                          </td>
                          <td class="pr-3">
                            <select
                              class="h-9 w-56 rounded-md border border-input bg-background px-3 text-sm"
                              [class.border-danger]="
                                column.required && sheet.mapping[column.key] === null
                              "
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
                          <td class="max-w-80 truncate text-xs text-muted-foreground">
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
            <p class="flex items-start gap-2 rounded-md bg-danger-bg p-3 text-sm text-danger-fg">
              <lucide-angular [img]="icons.x" class="mt-0.5 size-4 shrink-0" />
              {{ t()("imports.map.missing", { list: missing().join(", ") }) }}
            </p>
          }
          <div class="flex flex-wrap gap-2">
            <ui-button [disabled]="!active().length || missing().length > 0" (click)="runDry()">
              <lucide-angular [img]="icons.flask" class="size-4" />
              {{ t()("imports.map.runDry") }}
            </ui-button>
            <ui-button variant="outline" (click)="reset()">{{ t()("imports.abandon") }}</ui-button>
          </div>
        </section>
      }

      @if (step() === "rapport" && plan(); as report) {
        <section class="space-y-4">
          <div class="flex items-center gap-2">
            <lucide-angular [img]="icons.flask" class="size-5 text-ochre" />
            <h2 class="font-semibold">
              {{ t()("imports.report.title", { file: loaded()!.file }) }}
            </h2>
          </div>
          <p class="text-sm text-muted-foreground">{{ t()("imports.report.intro") }}</p>
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
            <ui-kpi-tile
              [label]="t()('imports.kpi.newOrgs')"
              [value]="nf.format(report.orgs.length)"
            />
            <ui-kpi-tile
              [label]="t()('imports.kpi.producers')"
              [value]="nf.format(report.producers.length)"
            />
            <ui-kpi-tile
              [label]="t()('imports.kpi.plots')"
              [value]="nf.format(report.plots.length)"
            />
            <ui-kpi-tile
              [label]="t()('imports.kpi.skipped')"
              [value]="nf.format(report.skipped.length)"
              [sub]="t()('imports.kpi.skippedSub')"
            />
            <ui-kpi-tile
              [label]="t()('imports.kpi.rejectedRows')"
              [value]="nf.format(rejectedRows())"
              [tone]="rejectedRows() ? 'danger' : 'neutral'"
              [sub]="
                t()('imports.kpi.reasons.autre', {
                  count: rejects().length,
                  n: nf.format(rejects().length),
                })
              "
            />
            <ui-kpi-tile
              [label]="t()('imports.kpi.warnings')"
              [value]="nf.format(warnings().length)"
              [tone]="warnings().length ? 'warning' : 'neutral'"
              [sub]="t()('imports.kpi.warningsSub')"
            />
            <ui-kpi-tile
              [label]="t()('imports.kpi.alerts')"
              [value]="nf.format(report.alerts.length)"
            />
            <ui-kpi-tile
              [label]="t()('imports.kpi.duplicates')"
              [value]="nf.format(report.cases.length)"
              [tone]="report.cases.length ? 'warning' : 'neutral'"
            />
          </div>

          <div class="surface overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="border-b bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th class="px-4 py-2.5 font-semibold">{{ t()("imports.report.sheet") }}</th>
                  <th class="font-semibold">{{ t()("imports.report.content") }}</th>
                  <th class="text-right font-semibold">{{ t()("imports.report.rowsRead") }}</th>
                  <th class="pr-4 text-right font-semibold">
                    {{ t()("imports.kpi.rejectedRows") }}
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y">
                @for (sheet of report.sheets; track sheet.name) {
                  <tr>
                    <td class="px-4 py-2 font-medium">{{ sheet.name }}</td>
                    <td>{{ SCHEMA[sheet.entity].label }}</td>
                    <td class="text-right tabular">{{ nf.format(sheet.rows) }}</td>
                    <td class="pr-4 text-right tabular">
                      @if (sheet.rejects > 0) {
                        <span class="text-danger-fg">{{ nf.format(sheet.rejects) }}</span>
                      } @else {
                        0
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          @if (report.issues.length) {
            <div class="surface">
              <div class="flex flex-wrap items-center gap-2 border-b p-3">
                <button
                  type="button"
                  class="rounded-full border px-3 py-1 text-xs font-medium"
                  [class.border-primary]="issueLevel() === 'rejet'"
                  [class.bg-primary-soft]="issueLevel() === 'rejet'"
                  (click)="issueLevel.set('rejet')"
                >
                  {{ t()("imports.level.rejects", { count: rejects().length }) }}
                </button>
                <button
                  type="button"
                  class="rounded-full border px-3 py-1 text-xs font-medium"
                  [class.border-primary]="issueLevel() === 'avertissement'"
                  [class.bg-primary-soft]="issueLevel() === 'avertissement'"
                  (click)="issueLevel.set('avertissement')"
                >
                  {{ t()("imports.level.warnings", { count: warnings().length }) }}
                </button>
                <button
                  type="button"
                  class="rounded-full border px-3 py-1 text-xs font-medium"
                  [class.border-primary]="issueLevel() === 'tous'"
                  [class.bg-primary-soft]="issueLevel() === 'tous'"
                  (click)="issueLevel.set('tous')"
                >
                  {{ t()("imports.level.all") }}
                </button>
                <ui-button
                  variant="outline"
                  size="sm"
                  class="ml-auto h-8"
                  (click)="downloadPlanIssues()"
                >
                  <lucide-angular [img]="icons.download" class="size-4" />
                  {{ t()("imports.report.download") }}
                </ui-button>
              </div>
              <div class="max-h-96 overflow-auto">
                <table class="w-full text-sm">
                  <thead class="sticky top-0 bg-card text-left text-xs text-muted-foreground">
                    <tr>
                      <th class="px-4 py-2 font-semibold">{{ t()("imports.report.sheet") }}</th>
                      <th class="font-semibold">{{ t()("imports.report.row") }}</th>
                      <th class="font-semibold">{{ t()("imports.report.column") }}</th>
                      <th class="pr-4 font-semibold">{{ t()("imports.report.reason") }}</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y">
                    @for (issue of issuesPager.items(); track $index) {
                      <tr>
                        <td class="px-4 py-1.5">{{ issue.sheet }}</td>
                        <td class="tabular">{{ issue.row }}</td>
                        <td>{{ issue.field }}</td>
                        <td
                          class="pr-4"
                          [class.text-danger-fg]="issue.level === 'rejet'"
                          [class.text-warning-fg]="issue.level !== 'rejet'"
                        >
                          {{ issue.message }}
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
                <ui-pagination class="px-4 pb-4" [pager]="issuesPager" />
                @if (shownIssues().length > 500) {
                  <p class="p-3 text-xs text-muted-foreground">
                    {{ t()("imports.report.truncated") }}
                  </p>
                }
                @if (!shownIssues().length) {
                  <p class="p-6 text-center text-sm text-muted-foreground">
                    {{ t()("imports.report.nothing") }}
                  </p>
                }
              </div>
            </div>
          }

          <div class="flex flex-wrap gap-2">
            <ui-button [disabled]="!writes() || !!sameAsImported()" (click)="confirm()">
              <lucide-angular [img]="icons.check" class="size-4" />
              {{
                writes() === 1
                  ? t()("imports.report.confirm.un", { n: nf.format(writes()) })
                  : t()("imports.report.confirm.autre", { n: nf.format(writes()) })
              }}
            </ui-button>
            <ui-button variant="outline" (click)="step.set('colonnes')">
              {{ t()("imports.report.back") }}
            </ui-button>
            <ui-button variant="ghost" (click)="reset()">{{ t()("imports.abandon") }}</ui-button>
          </div>
          @if (sameAsImported(); as same) {
            <p class="text-sm text-muted-foreground">
              {{ t()("imports.report.blocked", { id: same.id }) }}
            </p>
          }
          @if (!writes() && !sameAsImported()) {
            <p class="text-sm text-muted-foreground">{{ t()("imports.report.nothingToWrite") }}</p>
          }
        </section>
      }

      @if (step() === "termine" && done(); as result) {
        @if (plan(); as importPlan) {
          <section class="surface p-6">
            <div class="flex items-center gap-2">
              <lucide-angular [img]="icons.check" class="size-6 text-success" />
              <h2 class="text-lg font-semibold">
                {{ t()("imports.done.title", { id: result.id }) }}
              </h2>
            </div>
            <p class="mt-1 text-sm text-muted-foreground">
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
            <div class="mt-4 flex flex-wrap gap-2">
              <a
                routerLink="/dashboard/producteurs"
                class="inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium hover:bg-muted"
              >
                {{ t()("imports.done.directory") }}
              </a>
              @if (importPlan.cases.length > 0 && store.can("quality.review")) {
                <a
                  routerLink="/dashboard/qualite/doublons"
                  class="inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium hover:bg-muted"
                >
                  {{ t()("imports.done.duplicates") }}
                </a>
              }
              @if (hasUnqualifiedOrgs() && store.can("org.manage")) {
                <a
                  routerLink="/dashboard/organisations"
                  [queryParams]="{ vue: 'a-qualifier' }"
                  class="inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium hover:bg-muted"
                >
                  {{ t()("imports.done.qualify") }}
                </a>
              }
              @if (importPlan.unknownCrops.length > 0 && store.can("config.manage")) {
                <a
                  routerLink="/dashboard/referentiels"
                  [queryParams]="{ section: 'noms' }"
                  class="inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium hover:bg-muted"
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
              <ui-button (click)="reset()">
                <lucide-angular [img]="icons.upload" class="size-4" />
                {{ t()("imports.done.again") }}
              </ui-button>
            </div>
            <p
              class="mt-4 flex items-start gap-2 rounded-md bg-warning-bg p-3 text-sm text-warning-fg"
            >
              <lucide-angular [img]="icons.warn" class="mt-0.5 size-4 shrink-0" />
              <span>
                {{ t()("imports.done.demo") }}
                @if (store.can("data.backup")) {
                  {{ t()("imports.done.backupBefore") }}
                  <a routerLink="/dashboard/donnees" class="font-semibold underline">{{
                    t()("imports.done.backupLink")
                  }}</a>
                  {{ t()("imports.done.backupAfter") }}
                }
              </span>
            </p>
          </section>
        }
      }

      <div class="surface mb-3 p-3">
        <div class="relative">
          <lucide-angular
            [img]="icons.upload"
            class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            class="flex h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            [placeholder]="t()('imports.history.searchPlaceholder')"
            [ngModel]="historyQ()"
            (ngModelChange)="historyQ.set($event)"
          />
        </div>
      </div>

      <h2 class="mb-3 mt-8 font-semibold">{{ t()("imports.history.title") }}</h2>
      <div class="surface overflow-x-auto">
        @if (filteredBatches().length) {
          <table class="w-full text-sm">
            <thead class="border-b bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th class="px-4 py-3 font-semibold">{{ t()("imports.history.batch") }}</th>
                <th class="font-semibold">{{ t()("imports.history.file") }}</th>
                <th class="hidden font-semibold lg:table-cell">
                  {{ t()("imports.history.hash") }}
                </th>
                <th class="font-semibold">{{ t()("imports.history.date") }}</th>
                <th class="hidden font-semibold lg:table-cell">
                  {{ t()("imports.history.script") }}
                </th>
                <th class="font-semibold">{{ t()("imports.history.mode") }}</th>
                <th class="text-right font-semibold">{{ t()("imports.history.counts") }}</th>
                <th class="pr-4 text-right font-semibold"></th>
              </tr>
            </thead>
            <tbody class="divide-y">
              @for (batch of batchPager.items(); track batch.id + batch.at) {
                <tr>
                  <td class="px-4 py-2.5 font-medium">{{ batch.id }}</td>
                  <td>{{ batch.file }}</td>
                  <td class="hidden font-mono text-xs lg:table-cell">{{ batch.hash }}</td>
                  <td class="whitespace-nowrap">{{ fmtDateTime(batch.at) }}</td>
                  <td class="hidden text-xs lg:table-cell">{{ batch.script }}</td>
                  <td>
                    @if (batch.mode === "réel") {
                      <ui-pill tone="brand">{{ locale.tEnum("imports.mode", batch.mode) }}</ui-pill>
                    } @else {
                      <ui-pill tone="ochre">{{ locale.tEnum("imports.mode", batch.mode) }}</ui-pill>
                    }
                  </td>
                  <td class="text-right tabular">
                    {{ nf.format(batch.counts.producers) }} · {{ nf.format(batch.counts.plots) }} ·
                    <span [class.text-danger-fg]="batch.counts.rejects > 0">{{
                      nf.format(batch.counts.rejects)
                    }}</span>
                  </td>
                  <td class="pr-4 text-right">
                    @if (hasStoredReport(batch.id)) {
                      <ui-button size="sm" variant="ghost" (click)="downloadBatchReport(batch.id)">
                        <lucide-angular [img]="icons.download" class="size-4" />
                        {{ t()("imports.report.download") }}
                      </ui-button>
                    }
                    <ui-button size="sm" variant="ghost" (click)="downloadSheetsCsv(batch)">
                      <lucide-angular [img]="icons.sheet" class="size-4" />
                      {{ t()("imports.history.sheetsCsv") }}
                    </ui-button>
                    @if (canAudit()) {
                      <a
                        routerLink="/dashboard/audit"
                        [queryParams]="{ q: batch.id }"
                        class="ml-2 text-xs font-semibold text-primary hover:underline"
                      >
                        {{ t()("imports.history.viewJournal") }}
                      </a>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
          <ui-pagination class="px-4 pb-4" [pager]="batchPager" />
        } @else {
          <div class="px-4 py-10 text-center text-muted-foreground">
            <lucide-angular [img]="icons.upload" class="mx-auto mb-2 size-10 opacity-50" />
            <div class="font-semibold text-foreground">{{ t()("imports.history.empty") }}</div>
            <p class="mt-1 text-sm">{{ t()("imports.history.emptyHint") }}</p>
          </div>
        }
      </div>
    </app-shell>
  `,
})
export default class ImportsPage {
  protected readonly store = inject(StoreService);
  protected readonly locale = inject(LocaleService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly host = inject(ElementRef);
  protected readonly t = this.locale.t;
  protected readonly fmtDateTime = fmtDateTime;
  protected readonly nf = nf;
  protected readonly cn = cn;
  protected readonly SCHEMA = SCHEMA;
  /** Ordre des entités pour les listes déroulantes (tableau, pas l'itérateur `ENTITY_ORDER`). */
  protected readonly entityOrder: readonly EntityKey[] = ENTITY_ORDER_ARR;
  protected readonly STEPS = STEPS;
  protected readonly IGNORE = IGNORE;
  protected readonly NONE = NONE;
  protected readonly icons = {
    sheet: FileSpreadsheet,
    download: Download,
    upload: Upload,
    info: Info,
    loader: Loader2,
    reset: RotateCcw,
    flask: FlaskConical,
    x: XCircle,
    check: CheckCircle2,
    warn: AlertTriangle,
  };

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

  protected readonly batches = computed(() => this.store.state().imports);

  // ---------------------------------------------------- Rapport de l'import Kobo (mode API)

  /** En mode API, la page affiche d'abord le rapport du dernier import Kobo chargé sur le serveur. */
  protected readonly koboMode = isApiMode();
  protected readonly koboReport = signal<ApiKoboReport | null>(null);
  protected readonly koboState = signal<"idle" | "loading" | "error" | "empty" | "ready">("idle");
  private readonly expandedOrphans = signal<ReadonlySet<OrphanList>>(new Set());

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
    return can(getState().session, "audit.read");
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
    this.flash.set(
      `${this.t()("imports.toast.done")} — ${this.t()("imports.toast.added", {
        producers: nf.format(p.producers.length),
        plots: nf.format(p.plots.length),
      })}`,
    );
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
