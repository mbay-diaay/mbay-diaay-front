import { CommonModule, isPlatformBrowser } from "@angular/common";
import { Component, PLATFORM_ID, computed, inject, signal } from "@angular/core";
import type { MessageKey } from "@/lib/i18n";
import { RouterLink } from "@angular/router";

import { ApiError } from "@/lib/api/client";
import { isApiMode } from "@/lib/api/config";
import {
  fetchConsolideDuplicates,
  fetchConsolideOrphans,
  fetchConsolideQuality,
  fetchConsolideReport,
  isRateLimitError,
  type ApiConsolideReport,
  type ApiPage,
  type ConsolideDuplicateGroup,
  type ConsolideOrphanItem,
  type ConsolideQualityIssue,
} from "@/lib/api/imports";
import { fmtDateTime, nf, nf1 } from "@/lib/format";
import { LocaleService } from "@shared/locale.service";
import { SourceBadgeComponent } from "@shared/source-badge.component";
import { StoreService } from "@shared/store.service";
import {
  UiEmptyStateComponent,
  IconComponent,
  StatCardsComponent,
  TONE,
  V2_PAGE_STYLES,
  type StatCard,
} from "@shared/ui";

const PAGE_LIMIT = 10;

/**
 * Bloc « Rapport Base consolidée » de la page Imports (charte V2, lecture seule, pagination serveur).
 * N'affiche rien en mode démonstration (sans API).
 */
/** Sections du rapport consolidé : une seule à l'écran. */
type ConsolideSection = "synthese" | "cooperatives" | "rattacher" | "doublons" | "anomalies";

@Component({
  selector: "app-consolide-report",
  imports: [
    CommonModule,
    UiEmptyStateComponent,
    IconComponent,
    RouterLink,
    SourceBadgeComponent,
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
      .pager-bar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        border-top: 1px solid var(--v2-separateur);
        padding: 12px 16px;
      }
      .pager-btn {
        height: 36px;
        padding: 0 14px;
        font-size: 13px;
      }
      .code-pill {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        border: 1px solid var(--v2-bord-carte);
        background: var(--v2-creme);
        padding: 3px 10px;
        font-family: var(--v2-font-mono);
        font-size: 12px;
        font-weight: 700;
        color: var(--v2-encre);
        text-decoration: none;
      }
      .code-pill:hover {
        border-color: var(--v2-foret);
      }
      .metric-box {
        border-radius: 18px;
        border: 1px solid var(--v2-bord-carte);
        background: var(--v2-blanc);
        padding: 14px 16px;
      }
    `,
  ],
  template: `
    @if (apiMode) {
      <section class="rise mt-8 space-y-5" aria-labelledby="consolide-report-title">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <span class="kind-ico" [style.background]="TONE.culture.bg" [style.color]="TONE.culture.fg">
              <ui-icon name="database" [size]="20" />
            </span>
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <h2 id="consolide-report-title" class="text-[18px] font-extrabold tracking-[-0.01em]">
                  {{ t()("imports.consolide.title") }}
                </h2>
                <app-source-badge [record]="{ sourceBase: 'CONSOLIDE' }" />
              </div>
              <p class="sub">{{ t()("imports.consolide.intro") }}</p>
              @if (report(); as currentReport) {
                @if (currentReport.batch.id) {
                  <p class="mt-2 inline-flex items-center gap-2 text-[13px] font-semibold" style="color: var(--v2-ardoise)">
                    <ui-icon name="info" [size]="15" />
                    {{
                      t()("imports.consolide.batch", {
                        id: currentReport.batch.id,
                        date: currentReport.batch.importedAt ? fmtDateTime(currentReport.batch.importedAt) : "—",
                      })
                    }}
                  </p>
                }
              }
            </div>
          </div>

        </div>

        @if (status() === "loading" && !report()) {
          <div class="card flex items-center gap-3 p-5 text-sm font-semibold">
            <ui-icon name="refresh" [size]="18" />
            <span>{{ t()("imports.consolide.loading") }}</span>
          </div>
        } @else if (status() === "error") {
          <div
            class="banner justify-between"
            [style.background]="TONE.erreur.bg"
            [style.color]="TONE.erreur.fg"
          >
            <div class="flex items-center gap-2">
              <ui-icon name="warning" [size]="18" />
              <span>{{ errorMessage() }}</span>
            </div>
            <button
              type="button"
              class="btn btn-ghost pager-btn"
              (click)="reloadAll()"
            >
              <ui-icon name="refresh" [size]="16" />
              {{ t()("imports.consolide.retry") }}
            </button>
          </div>
        } @else if (status() === "empty") {
          <div class="card p-6 text-center sub">{{ t()("imports.consolide.empty") }}</div>
        }

        @if (report(); as currentReport) {
          <ui-stat-cards [stats]="statCards()" />

          <nav class="tabs" role="tablist" [attr.aria-label]="t()('imports.consolide.tab.label')">
            @for (item of sections(currentReport); track item.id) {
              <button
                type="button"
                role="tab"
                class="tab"
                [class.on]="section() === item.id"
                [attr.aria-selected]="section() === item.id"
                (click)="section.set(item.id)"
              >
                {{ t()(item.label) }}
                @if (item.count !== null) {
                  <span class="n">{{ nf.format(item.count) }}</span>
                }
              </button>
            }
          </nav>

          <!-- ───── Répartition par coopérative (paginée côté serveur) ───── -->
          @if (section() === "cooperatives") {
          <div class="card overflow-hidden">
            <div
              class="flex flex-wrap items-center justify-between gap-2 border-b p-4"
              style="border-color: var(--v2-separateur)"
            >
              <h3 class="text-[16px] font-extrabold">{{ t()("imports.consolide.coop.title") }}</h3>
              @if (currentReport.batch.sourceFile) {
                <span class="sub text-xs">
                  {{ t()("imports.consolide.sourceFile", { file: currentReport.batch.sourceFile }) }}
                </span>
              }
            </div>
            @if (currentReport.cooperatives.items.length) {
              <div class="overflow-x-auto">
                <table class="tbl">
                  <thead>
                    <tr>
                      <th>{{ t()("imports.consolide.coop.name") }}</th>
                      <th class="text-right">{{ t()("imports.consolide.coop.producers") }}</th>
                      <th class="text-right">{{ t()("imports.consolide.coop.members") }}</th>
                      <th class="text-right">{{ t()("imports.consolide.coop.organisations") }}</th>
                      <th class="text-right">{{ t()("imports.consolide.coop.plots") }}</th>
                      <th class="text-right">{{ t()("imports.consolide.coop.area") }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (cooperative of currentReport.cooperatives.items; track cooperative.id) {
                      <tr>
                        <td>
                          <a
                            class="font-bold hover:underline"
                            [routerLink]="['/dashboard/cooperatives', cooperative.id]"
                          >
                            {{ cooperative.name }}
                          </a>
                          <span class="mono ml-2" style="color: var(--v2-gris-texte)">
                            {{ cooperative.code }}
                          </span>
                        </td>
                        <td class="text-right font-semibold tabular-nums">{{ nf.format(cooperative.producers) }}</td>
                        <td class="text-right font-semibold tabular-nums">{{ nf.format(cooperative.members) }}</td>
                        <td class="text-right font-semibold tabular-nums">{{ nf.format(cooperative.organisations) }}</td>
                        <td class="text-right font-semibold tabular-nums">{{ nf.format(cooperative.plots) }}</td>
                        <td class="text-right font-semibold tabular-nums">{{ nf1.format(cooperative.areaHa) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              @if (currentReport.cooperatives.pages > 1) {
                <div class="pager-bar">
                  <span class="sub text-xs">
                    {{
                      t()("imports.consolide.page", {
                        page: currentReport.cooperatives.page,
                        pages: currentReport.cooperatives.pages,
                        total: nf.format(currentReport.cooperatives.total),
                      })
                    }}
                  </span>
                  <div class="flex gap-2">
                    <button
                      type="button"
                      class="btn btn-ghost pager-btn"
                      [disabled]="currentReport.cooperatives.page <= 1"
                      (click)="loadReportPage(currentReport.cooperatives.page - 1)"
                    >
                      {{ t()("imports.consolide.prev") }}
                    </button>
                    <button
                      type="button"
                      class="btn btn-ghost pager-btn"
                      [disabled]="currentReport.cooperatives.page >= currentReport.cooperatives.pages"
                      (click)="loadReportPage(currentReport.cooperatives.page + 1)"
                    >
                      {{ t()("imports.consolide.next") }}
                    </button>
                  </div>
                </div>
              }
            } @else {
              <ui-empty-state
                [compact]="true"
                icon="folder_open"
                [title]="t()('imports.consolide.coop.emptyTitle')"
                [description]="t()('imports.consolide.coop.emptyDesc')"
              />
            }
          </div>

                    }

          <!-- ───── Liaison Kobo ↔ consolidé & Qualité ───── -->
          @if (section() === "synthese") {
          <div class="grid gap-4 lg:grid-cols-2">
            <div class="card p-5">
              <div class="flex items-center justify-between gap-2">
                <h3 class="text-[16px] font-extrabold">{{ t()("imports.consolide.koboLink.title") }}</h3>
                <app-source-badge [record]="{ sourceBase: 'KOBO' }" />
              </div>
              <p class="sub mt-1 text-xs">{{ t()("imports.consolide.koboLink.desc") }}</p>
              <div class="mt-4 grid grid-cols-3 gap-3">
                <div class="metric-box">
                  <p class="mono" style="color: var(--v2-gris-texte)">
                    {{ t()("imports.consolide.koboLink.exact") }}
                  </p>
                  <p class="mt-1 text-[22px] font-extrabold tabular-nums">
                    {{ nf.format(currentReport.koboLink.exactMatches) }}
                  </p>
                </div>
                <div class="metric-box">
                  <p class="mono" style="color: var(--v2-gris-texte)">
                    {{ t()("imports.consolide.koboLink.consolideOnly") }}
                  </p>
                  <p class="mt-1 text-[22px] font-extrabold tabular-nums">
                    {{ nf.format(currentReport.koboLink.consolideOnly) }}
                  </p>
                </div>
                <div class="metric-box">
                  <p class="mono" style="color: var(--v2-gris-texte)">
                    {{ t()("imports.consolide.koboLink.koboOnly") }}
                  </p>
                  <p class="mt-1 text-[22px] font-extrabold tabular-nums">
                    {{ nf.format(currentReport.koboLink.koboOnly) }}
                  </p>
                </div>
              </div>
            </div>

            <div class="card p-5">
              <h3 class="text-[16px] font-extrabold">{{ t()("imports.consolide.quality.title") }}</h3>
              <div class="mt-4 grid grid-cols-2 gap-3">
                <div class="metric-box">
                  <p class="mono" style="color: var(--v2-gris-texte)">
                    {{ t()("imports.consolide.quality.cni") }}
                  </p>
                  <p
                    class="mt-1 text-[22px] font-extrabold tabular-nums"
                    [style.color]="currentReport.quality.cniFormatIssues ? TONE.attente.fg : 'var(--v2-encre)'"
                  >
                    {{ nf.format(currentReport.quality.cniFormatIssues) }}
                  </p>
                </div>
                <div class="metric-box">
                  <p class="mono" style="color: var(--v2-gris-texte)">
                    {{ t()("imports.consolide.quality.missingPhone") }}
                  </p>
                  <p
                    class="mt-1 text-[22px] font-extrabold tabular-nums"
                    [style.color]="currentReport.quality.missingPhone ? TONE.attente.fg : 'var(--v2-encre)'"
                  >
                    {{ nf.format(currentReport.quality.missingPhone) }}
                  </p>
                </div>
                <div class="metric-box">
                  <p class="mono" style="color: var(--v2-gris-texte)">
                    {{ t()("imports.consolide.quality.sharedPhone") }}
                  </p>
                  <p
                    class="mt-1 text-[22px] font-extrabold tabular-nums"
                    [style.color]="currentReport.quality.sharedPhoneGroups ? TONE.erreur.fg : 'var(--v2-encre)'"
                  >
                    {{ nf.format(currentReport.quality.sharedPhoneGroups) }}
                  </p>
                </div>
                <div class="metric-box">
                  <p class="mono" style="color: var(--v2-gris-texte)">
                    {{ t()("imports.consolide.quality.noContour") }}
                  </p>
                  <p
                    class="mt-1 text-[22px] font-extrabold tabular-nums"
                    [style.color]="currentReport.quality.plotsWithoutContour ? TONE.attente.fg : 'var(--v2-encre)'"
                  >
                    {{ nf.format(currentReport.quality.plotsWithoutContour) }}
                  </p>
                </div>
              </div>
            </div>
          </div>

                    }

          <!-- ───── Éléments à rattacher (HCR, paginé serveur) ───── -->
          @if (section() === "rattacher") {
          <div class="card overflow-hidden">
            <div
              class="flex flex-wrap items-center justify-between gap-2 border-b p-4"
              style="border-color: var(--v2-separateur)"
            >
              <div>
                <h3 class="text-[16px] font-extrabold">{{ t()("imports.consolide.hcr.title") }}</h3>
                <p class="sub text-xs">
                  {{
                    t()("imports.consolide.hcr.summary", {
                      producers: nf.format(currentReport.toAttach.producers),
                      organisations: nf.format(currentReport.toAttach.organisations),
                      members: nf.format(currentReport.toAttach.members),
                      confirm: nf.format(currentReport.toAttach.placementToConfirm),
                    })
                  }}
                </p>
              </div>
              @if (canTransfer()) {
                <a routerLink="/dashboard/cooperatives/hcr" class="btn btn-primary">
                  {{ t()("imports.consolide.hcr.transferAction") }}
                  <span class="btn-chip"><ui-icon name="arrow_forward" [size]="20" /></span>
                </a>
              }
            </div>
            @if (orphansPage(); as orphans) {
              @if (orphans.items.length) {
                <div class="overflow-x-auto">
                  <table class="tbl">
                    <thead>
                      <tr>
                        <th>{{ t()("imports.consolide.hcr.kind") }}</th>
                        <th>{{ t()("imports.consolide.hcr.code") }}</th>
                        <th>{{ t()("imports.consolide.hcr.source") }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (orphan of orphans.items; track orphan.kind + orphan.id) {
                        <tr>
                          <td>
                            <span
                              class="badge"
                              [style.background]="orphan.kind === 'organisation' ? TONE.info.bg : TONE.attente.bg"
                              [style.color]="orphan.kind === 'organisation' ? TONE.info.fg : TONE.attente.fg"
                            >
                              {{ orphanKindLabel(orphan.kind) }}
                            </span>
                          </td>
                          <td>
                            @if (orphan.kind === "producer") {
                              <a class="code-pill" [routerLink]="['/dashboard/producteurs', orphan.code]">
                                {{ orphan.code }}
                              </a>
                            } @else {
                              <a class="font-bold hover:underline" [routerLink]="['/dashboard/organisations', orphan.id]">
                                {{ orphan.label }}
                              </a>
                            }
                          </td>
                          <td>
                            <app-source-badge
                              [record]="{
                                sourceBase: 'CONSOLIDE',
                                sourceSheet: orphan.sourceSheet ?? undefined,
                                sourceRow: orphan.sourceRow ?? undefined,
                              }"
                              [showPlace]="true"
                            />
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
                @if (orphans.pages > 1) {
                  <div class="pager-bar">
                    <span class="sub text-xs">
                      {{
                        t()("imports.consolide.page", {
                          page: orphans.page,
                          pages: orphans.pages,
                          total: nf.format(orphans.total),
                        })
                      }}
                    </span>
                    <div class="flex gap-2">
                      <button
                        type="button"
                        class="btn btn-ghost pager-btn"
                        [disabled]="orphans.page <= 1"
                        (click)="loadOrphansPage(orphans.page - 1)"
                      >
                        {{ t()("imports.consolide.prev") }}
                      </button>
                      <button
                        type="button"
                        class="btn btn-ghost pager-btn"
                        [disabled]="orphans.page >= orphans.pages"
                        (click)="loadOrphansPage(orphans.page + 1)"
                      >
                        {{ t()("imports.consolide.next") }}
                      </button>
                    </div>
                  </div>
                }
              } @else {
                <ui-empty-state
                  [compact]="true"
                  icon="check_circle"
                  [title]="t()('imports.consolide.hcr.emptyTitle')"
                  [description]="t()('imports.consolide.hcr.emptyDesc')"
                />
              }
            }
          </div>

                    }

          <!-- ───── Doublons stricts (paginé serveur, sans fusion auto) ───── -->
          @if (section() === "doublons") {
          <div class="card overflow-hidden">
            <div class="border-b p-4" style="border-color: var(--v2-separateur)">
              <h3 class="text-[16px] font-extrabold">{{ t()("imports.consolide.duplicates.title") }}</h3>
              <p class="sub text-xs">
                {{
                  t()("imports.consolide.duplicates.summary", {
                    groups: nf.format(currentReport.duplicates.strictGroups),
                    extra: nf.format(currentReport.duplicates.strictExtraRows),
                  })
                }}
              </p>
            </div>
            @if (duplicatesPage(); as duplicates) {
              @if (duplicates.items.length) {
                <div class="overflow-x-auto">
                  <table class="tbl">
                    <thead>
                      <tr>
                        <th>{{ t()("imports.consolide.duplicates.hash") }}</th>
                        <th class="text-right">{{ t()("imports.consolide.duplicates.count") }}</th>
                        <th>{{ t()("imports.consolide.duplicates.codes") }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (group of duplicates.items; track group.signatureHash) {
                        <tr>
                          <td class="font-mono text-xs font-bold">{{ group.signatureHash }}</td>
                          <td class="text-right font-bold tabular-nums">{{ nf.format(group.count) }}</td>
                          <td>
                            <div class="flex flex-wrap gap-1.5">
                              @for (memberItem of group.items; track memberItem.id) {
                                <a class="code-pill" [routerLink]="['/dashboard/producteurs', memberItem.code]">
                                  {{ memberItem.code }}
                                </a>
                              }
                            </div>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
                @if (duplicates.pages > 1) {
                  <div class="pager-bar">
                    <span class="sub text-xs">
                      {{
                        t()("imports.consolide.page", {
                          page: duplicates.page,
                          pages: duplicates.pages,
                          total: nf.format(duplicates.total),
                        })
                      }}
                    </span>
                    <div class="flex gap-2">
                      <button
                        type="button"
                        class="btn btn-ghost pager-btn"
                        [disabled]="duplicates.page <= 1"
                        (click)="loadDuplicatesPage(duplicates.page - 1)"
                      >
                        {{ t()("imports.consolide.prev") }}
                      </button>
                      <button
                        type="button"
                        class="btn btn-ghost pager-btn"
                        [disabled]="duplicates.page >= duplicates.pages"
                        (click)="loadDuplicatesPage(duplicates.page + 1)"
                      >
                        {{ t()("imports.consolide.next") }}
                      </button>
                    </div>
                  </div>
                }
              } @else {
                <ui-empty-state
                  [compact]="true"
                  icon="check_circle"
                  [title]="t()('imports.consolide.duplicates.emptyTitle')"
                  [description]="t()('imports.consolide.duplicates.emptyDesc')"
                />
              }
            }
          </div>

                    }

          <!-- ───── Anomalies de qualité (paginé serveur) ───── -->
          @if (section() === "anomalies") {
          <div class="card overflow-hidden">
            <div class="border-b p-4" style="border-color: var(--v2-separateur)">
              <h3 class="text-[16px] font-extrabold">{{ t()("imports.consolide.quality.title") }}</h3>
            </div>
            @if (qualityPage(); as qualityList) {
              @if (qualityList.items.length) {
                <div class="overflow-x-auto">
                  <table class="tbl">
                    <thead>
                      <tr>
                        <th>{{ t()("imports.consolide.quality.kind") }}</th>
                        <th>{{ t()("imports.consolide.quality.entity") }}</th>
                        <th>{{ t()("imports.consolide.quality.detail") }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (issue of qualityList.items; track issue.kind + issue.id) {
                        <tr>
                          <td>
                            <span
                              class="badge"
                              [style.background]="issue.kind === 'shared_phone' ? TONE.erreur.bg : TONE.attente.bg"
                              [style.color]="issue.kind === 'shared_phone' ? TONE.erreur.fg : TONE.attente.fg"
                            >
                              {{ qualityKindLabel(issue.kind) }}
                            </span>
                          </td>
                          <td>
                            @if (issue.entityType === "producer") {
                              <a class="code-pill" [routerLink]="['/dashboard/producteurs', issue.code]">
                                {{ issue.code }}
                              </a>
                            } @else {
                              <span class="font-mono text-xs font-bold">{{ issue.code }}</span>
                            }
                          </td>
                          <td class="sub text-xs">{{ issue.detail }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
                @if (qualityList.pages > 1) {
                  <div class="pager-bar">
                    <span class="sub text-xs">
                      {{
                        t()("imports.consolide.page", {
                          page: qualityList.page,
                          pages: qualityList.pages,
                          total: nf.format(qualityList.total),
                        })
                      }}
                    </span>
                    <div class="flex gap-2">
                      <button
                        type="button"
                        class="btn btn-ghost pager-btn"
                        [disabled]="qualityList.page <= 1"
                        (click)="loadQualityPage(qualityList.page - 1)"
                      >
                        {{ t()("imports.consolide.prev") }}
                      </button>
                      <button
                        type="button"
                        class="btn btn-ghost pager-btn"
                        [disabled]="qualityList.page >= qualityList.pages"
                        (click)="loadQualityPage(qualityList.page + 1)"
                      >
                        {{ t()("imports.consolide.next") }}
                      </button>
                    </div>
                  </div>
                }
              } @else {
                <ui-empty-state
                  [compact]="true"
                  icon="check_circle"
                  [title]="t()('imports.consolide.quality.emptyTitle')"
                  [description]="t()('imports.consolide.quality.emptyDesc')"
                />
              }
            }
          </div>
          }
        }
      </section>
    }
  `,
})
export class ConsolideReportComponent {
  private readonly locale = inject(LocaleService);
  private readonly store = inject(StoreService);
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly t = this.locale.t;

  /** Section affichée sous les chiffres : une seule à la fois, pour ne pas faire défiler une page entière. */
  protected readonly section = signal<ConsolideSection>("synthese");

  protected sections(report: ApiConsolideReport): { id: ConsolideSection; label: MessageKey; count: number | null }[] {
    const quality = report.quality;
    return [
      { id: "synthese", label: "imports.consolide.tab.synthese", count: null },
      { id: "cooperatives", label: "imports.consolide.tab.cooperatives", count: report.cooperatives.total },
      { id: "rattacher", label: "imports.consolide.tab.rattacher", count: report.toAttach.producers + report.toAttach.organisations },
      { id: "doublons", label: "imports.consolide.tab.doublons", count: report.duplicates.strictGroups },
      { id: "anomalies", label: "imports.consolide.tab.anomalies", count: quality.cniFormatIssues + quality.missingPhone + quality.sharedPhoneGroups + quality.plotsWithoutContour },
    ];
  }

  /** Libellés des types (clés écrites en entier : le dictionnaire est typé, pas de clé composée). */
  protected orphanKindLabel(kind: "producer" | "organisation"): string {
    return this.t()(kind === "producer" ? "imports.consolide.hcr.kind.producer" : "imports.consolide.hcr.kind.organisation");
  }

  protected qualityKindLabel(kind: "cni_format" | "missing_phone" | "shared_phone" | "plot_without_contour"): string {
    const keys = {
      cni_format: "imports.consolide.quality.kind.cni_format",
      missing_phone: "imports.consolide.quality.kind.missing_phone",
      shared_phone: "imports.consolide.quality.kind.shared_phone",
      plot_without_contour: "imports.consolide.quality.kind.plot_without_contour",
    } as const;
    return this.t()(keys[kind]);
  }
  protected readonly nf = nf;
  protected readonly nf1 = nf1;
  protected readonly fmtDateTime = fmtDateTime;
  protected readonly TONE = TONE;
  protected readonly apiMode = isApiMode();

  protected readonly status = signal<"idle" | "loading" | "error" | "empty" | "ready">("idle");
  protected readonly errorMessage = signal("");
  protected readonly report = signal<ApiConsolideReport | null>(null);
  protected readonly orphansPage = signal<ApiPage<ConsolideOrphanItem> | null>(null);
  protected readonly duplicatesPage = signal<ApiPage<ConsolideDuplicateGroup> | null>(null);
  protected readonly qualityPage = signal<ApiPage<ConsolideQualityIssue> | null>(null);

  protected readonly canTransfer = computed(() => this.store.can("scoop.transfer"));

  protected readonly statCards = computed<StatCard[]>(() => {
    const current = this.report();
    if (!current) return [];
    const translate = this.t();
    return [
      {
        label: translate("imports.consolide.kpi.producers"),
        value: nf.format(current.totals.producers),
        sub: "",
        icon: "badge",
        ...TONE.succes,
      },
      {
        label: translate("imports.consolide.kpi.plots"),
        value: nf.format(current.totals.plots),
        sub: "",
        icon: "map",
        ...TONE.culture,
      },
      {
        label: translate("imports.consolide.kpi.organisations"),
        value: nf.format(current.totals.organisations),
        sub: "",
        icon: "folder_open",
        ...TONE.info,
      },
      {
        label: translate("imports.consolide.kpi.members"),
        value: nf.format(current.totals.members),
        sub: "",
        icon: "group",
        ...TONE.neutre,
      },
      {
        label: translate("imports.consolide.kpi.toAttach"),
        value: nf.format(current.toAttach.producers + current.toAttach.organisations),
        sub: "",
        icon: "warning",
        ...(current.toAttach.producers + current.toAttach.organisations ? TONE.attente : TONE.neutre),
      },
    ];
  });

  constructor() {
    if (this.apiMode && isPlatformBrowser(this.platformId)) {
      void this.reloadAll();
    }
  }

  protected async reloadAll(): Promise<void> {
    this.status.set("loading");
    this.errorMessage.set("");
    try {
      const [mainReport, orphans, duplicates, quality] = await Promise.all([
        fetchConsolideReport(1, PAGE_LIMIT),
        fetchConsolideOrphans(1, PAGE_LIMIT),
        fetchConsolideDuplicates(1, PAGE_LIMIT),
        fetchConsolideQuality(1, PAGE_LIMIT),
      ]);
      this.report.set(mainReport);
      this.orphansPage.set(orphans);
      this.duplicatesPage.set(duplicates);
      this.qualityPage.set(quality);
      this.status.set(mainReport.totals.producers === 0 && !mainReport.batch.id ? "empty" : "ready");
    } catch (error) {
      this.handleError(error);
    }
  }

  protected async loadReportPage(page: number): Promise<void> {
    try {
      const updated = await fetchConsolideReport(page, PAGE_LIMIT);
      this.report.set(updated);
    } catch (error) {
      this.handleError(error);
    }
  }

  protected async loadOrphansPage(page: number): Promise<void> {
    try {
      this.orphansPage.set(await fetchConsolideOrphans(page, PAGE_LIMIT));
    } catch (error) {
      this.handleError(error);
    }
  }

  protected async loadDuplicatesPage(page: number): Promise<void> {
    try {
      this.duplicatesPage.set(await fetchConsolideDuplicates(page, PAGE_LIMIT));
    } catch (error) {
      this.handleError(error);
    }
  }

  protected async loadQualityPage(page: number): Promise<void> {
    try {
      this.qualityPage.set(await fetchConsolideQuality(page, PAGE_LIMIT));
    } catch (error) {
      this.handleError(error);
    }
  }

  private handleError(error: unknown): void {
    if (error instanceof ApiError && error.status === 404) {
      this.status.set("empty");
      return;
    }
    this.status.set("error");
    this.errorMessage.set(
      isRateLimitError(error)
        ? this.t()("imports.consolide.rateLimited")
        : this.t()("imports.consolide.error"),
    );
  }
}
