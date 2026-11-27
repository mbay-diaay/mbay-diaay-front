import { Component, DOCUMENT, computed, effect, inject, signal, untracked } from "@angular/core";
import { NgTemplateOutlet } from "@angular/common";
import { RouterLink } from "@angular/router";
import type { ChartConfiguration } from "chart.js";

import { isApiMode } from "@/lib/api/config";
import { fetchRecentAudit } from "@/lib/api/audit";
import type { ProducerStats } from "@/lib/api/producers";
import { getStatsOverview, type StatsMembers, type StatsNetwork } from "@/lib/api/stats";
import type { AuditEntry } from "@/lib/store";
import { inScope } from "@/lib/store";
import { membershipCounts } from "@/lib/membership";
import { scopedDossiers, scopedMembers, scopedPayments, scopedRules } from "@/lib/scope";
import { memberDues } from "@/lib/contributions";
import { ageAtMost, fmtDate, fmtDateTime, nf1 } from "@/lib/format";
import { AppShellComponent } from "@shared/app-shell.component";
import { ProducersOverviewComponent } from "./producers-overview.component";
import { LocaleService } from "@shared/locale.service";
import { StoreService } from "@shared/store.service";
import { IconComponent, UiChartComponent, type IconName } from "@shared/ui";

/** Courbe de tendance SIMULÉE (démo) : 8 points croissants qui finissent sur la valeur réelle. */
function mockTrend(value: number, seed: number): number[] {
  return Array.from({ length: 8 }, (_, i) => {
    const wave = Math.sin((i + seed) * 1.7) * 0.035;
    return Math.max(0, value * (0.74 + i * 0.037 + wave));
  }).map((v, i, all) => (i === all.length - 1 ? value : v));
}

/** Tracé SVG d'une courbe (viewBox 120 × 40) : ligne + aire sous la courbe. */
function sparkPaths(series: number[]): { line: string; area: string } {
  const max = Math.max(...series);
  const min = Math.min(...series);
  const span = max - min || 1;
  const pts = series.map(
    (v, i) => [(i / (series.length - 1)) * 120, 36 - ((v - min) / span) * 30] as const,
  );
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return { line, area: `${line} L120 40 L0 40 Z` };
}

/**
 * Tableau de bord (charte V2), servi sous `/` et `/dashboard/<rôle>`.
 *
 * Données réelles du store (filtrées par droits et périmètre) : campagne en cours, qualité des fiches,
 * chiffres clés, tâches, coopératives, réunions, activité. SIMULÉ (démo) : les courbes de tendance
 * et leur variation « sur 30 jours », en attendant un historique côté API.
 */
@Component({
  selector: "app-index-page",
  imports: [RouterLink, NgTemplateOutlet, AppShellComponent, UiChartComponent, IconComponent, ProducersOverviewComponent],
  styles: `
    .mono {
      font-family: var(--v2-font-mono);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    /* Grille du tableau de bord : zones nommées, disposition fournie par layout() selon le rôle. */
    .board {
      display: grid;
      gap: 16px;
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas: var(--areas-sm);
    }
    @media (min-width: 1024px) {
      .board {
        grid-template-columns: repeat(6, minmax(0, 1fr));
        grid-template-areas: var(--areas);
      }
    }
    .net {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      border-radius: 16px;
      padding: 6px;
      cursor: pointer;
      transition: background-color 0.15s ease;
    }
    .net:hover {
      background: var(--v2-creme);
    }
    .net-static,
    .net-static:hover {
      cursor: default;
      background: none;
    }
    .net:focus-visible {
      outline: 2px solid var(--v2-foret);
      outline-offset: 2px;
    }
    @media (min-width: 1280px) {
      .net-sep {
        border-left: 1px solid var(--v2-separateur);
        padding-left: 16px;
      }
    }
    .card {
      border-radius: 24px;
      border: 1px solid var(--v2-bord-carte);
      background: var(--v2-blanc);
    }
    .h2 {
      font-size: 18px;
      font-weight: 800;
      letter-spacing: -0.02em;
    }
    .sub {
      font-size: 13px;
      font-weight: 500;
      color: var(--v2-gris-texte);
    }
    .link {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 14px;
      font-weight: 700;
      color: var(--v2-foret-clair);
      cursor: pointer;
      text-underline-offset: 3px;
    }
    .link:hover {
      text-decoration: underline;
    }
    .btn {
      display: inline-flex;
      height: 48px;
      align-items: center;
      gap: 10px;
      border-radius: 16px;
      padding: 0 18px;
      font-size: 15px;
      font-weight: 800;
      cursor: pointer;
      transition:
        background-color 0.15s ease,
        border-color 0.15s ease;
    }
    .btn-ghost {
      border: 1.5px solid var(--v2-gris-trait);
      background: var(--v2-blanc);
      color: var(--v2-encre);
    }
    .btn-ghost:hover {
      border-color: var(--v2-gris-texte);
    }
    .btn-primary {
      padding: 0 6px 0 18px;
      background: var(--v2-foret);
      color: var(--v2-blanc);
    }
    .btn-primary:hover {
      background: var(--v2-foret-clair);
    }
    .chip {
      display: grid;
      height: 36px;
      width: 36px;
      place-items: center;
      border-radius: 12px;
      background: var(--v2-citron);
      color: var(--v2-foret);
    }
    .task {
      display: flex;
      align-items: center;
      gap: 14px;
      border-radius: 18px;
      padding: 12px;
      cursor: pointer;
      transition: background-color 0.15s ease;
    }
    .task:hover {
      background: var(--v2-creme);
    }
    .task:hover .arrow {
      transform: translateX(3px);
      color: var(--v2-foret);
    }
    .arrow {
      color: var(--v2-gris-trait);
      transition:
        transform 0.2s ease,
        color 0.2s ease;
    }
    .kpi {
      transition:
        transform 0.2s ease,
        box-shadow 0.2s ease;
    }
    .kpi:hover {
      transform: translateY(-2px);
      box-shadow: var(--v2-ombre-flottant);
    }
    .bar {
      height: 8px;
      overflow: hidden;
      border-radius: 999px;
      background: var(--v2-lin);
    }
    .bar > span {
      display: block;
      height: 100%;
      border-radius: 999px;
    }
    .row-link {
      cursor: pointer;
      transition: background-color 0.15s ease;
    }
    .row-link:hover {
      background: var(--v2-creme);
    }
    .btn:focus-visible,
    .task:focus-visible,
    .link:focus-visible,
    .row-link:focus-visible {
      outline: 2px solid var(--v2-foret);
      outline-offset: 2px;
    }
    @media (prefers-reduced-motion: reduce) {
      .kpi,
      .kpi:hover,
      .arrow {
        transition: none;
        transform: none;
      }
    }
  `,
  template: `
    <app-shell perm="dashboard.read" [area]="t()('dashboard.area')">
      <!-- ───── En-tête ───── -->
      <header class="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div class="min-w-0">
          <p class="mono" style="color: var(--v2-gris-texte)">{{ today() }}</p>
          <h1
            class="mt-2 text-[30px] font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-[38px]"
          >
            {{ t()("dashboard.greeting", { name: firstName() }) }}
          </h1>
          <p class="mt-2 text-[16px] font-medium" style="color: var(--v2-gris-texte)">
            {{ t()("dashboard.subtitle") }}
          </p>
        </div>
        @if (store.can("report.generate") || store.can("report.read")) {
          <div class="flex flex-wrap gap-3">
            <a class="btn btn-ghost" routerLink="/dashboard/rapports">
              <ui-icon name="file_export" [size]="20" />
              {{ t()("dashboard.actions.export") }}
            </a>
            <a class="btn btn-primary" routerLink="/dashboard/rapports">
              {{ t()("dashboard.actions.report") }}
              <span class="chip"><ui-icon name="add" [size]="20" /></span>
            </a>
          </div>
        }
      </header>

      <!-- ───── Blocs : disposition selon le rôle (voir layout()) ───── -->
      <div class="board mt-8" [style.--areas]="layout().lg" [style.--areas-sm]="layout().sm">
        <!-- Producteurs en chiffres : après la campagne et le réseau (effectifs, genre, âge, handicap ; serveur) -->
        <app-producers-overview style="grid-area: producers" />
        <section
          class="relative overflow-hidden rounded-[28px] p-6 sm:p-8"
          style="grid-area: campaign; background: var(--v2-foret); color: var(--v2-blanc)"
          aria-labelledby="campaign-title"
        >
          <!-- Motif décoratif : sillons du logo, très discrets -->
          <svg
            class="pointer-events-none absolute -right-10 -top-6 h-56 w-80 opacity-[0.07]"
            viewBox="0 0 320 220"
            aria-hidden="true"
          >
            <path
              d="M10 120 Q160 60 310 110"
              fill="none"
              stroke="currentColor"
              stroke-width="22"
              stroke-linecap="round"
            />
            <path
              d="M30 168 Q170 108 310 156"
              fill="none"
              stroke="currentColor"
              stroke-width="22"
              stroke-linecap="round"
            />
            <path
              d="M60 212 Q180 160 310 200"
              fill="none"
              stroke="currentColor"
              stroke-width="22"
              stroke-linecap="round"
            />
          </svg>
          <div class="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <p class="mono" style="color: var(--v2-citron)">
                {{ t()("dashboard.campaign.eyebrow") }}
              </p>
              <h2
                id="campaign-title"
                class="mt-2 text-[28px] font-extrabold leading-tight tracking-[-0.03em]"
              >
                {{ campaign().name ?? t()("dashboard.campaign.none") }}
              </h2>
              @if (campaign().name) {
                <p
                  class="mt-1 text-[14px] font-medium"
                  style="color: color-mix(in oklab, var(--v2-blanc) 70%, transparent)"
                >
                  {{
                    t()("dashboard.campaign.period", {
                      start: campaign().start,
                      end: campaign().end,
                    })
                  }}
                </p>
              }
            </div>
            <span
              class="grid size-14 place-items-center rounded-[18px]"
              style="background: color-mix(in oklab, var(--v2-blanc) 10%, transparent)"
            >
              <ui-icon name="grass" [size]="30" style="color: var(--v2-citron)" />
            </span>
          </div>

          @if (campaign().name) {
            <div class="relative mt-6">
              <div class="flex items-baseline justify-between gap-3 text-[13px] font-semibold">
                @if (campaign().remaining > 0) {
                  <span>{{ t()("dashboard.campaign.elapsed", { pct: campaign().pct }) }}</span>
                  <span style="color: color-mix(in oklab, var(--v2-blanc) 70%, transparent)">{{
                    t()("dashboard.campaign.remaining", { days: campaign().remaining })
                  }}</span>
                } @else {
                  <span
                    class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1"
                    style="background: var(--v2-attente-bg); color: var(--v2-attente-fg)"
                  >
                    <ui-icon name="schedule" [size]="15" />{{ t()("dashboard.campaign.ended") }}
                  </span>
                }
              </div>
              <div
                class="mt-2 h-2.5 overflow-hidden rounded-full"
                style="background: color-mix(in oklab, var(--v2-blanc) 14%, transparent)"
              >
                <span
                  class="block h-full rounded-full"
                  style="background: var(--v2-citron)"
                  [style.width.%]="campaign().pct"
                ></span>
              </div>
            </div>
            <dl class="relative mt-7 grid grid-cols-3 gap-4">
              @for (stat of campaign().stats; track stat.label) {
                <div>
                  <dt
                    class="text-[13px] font-semibold"
                    style="color: color-mix(in oklab, var(--v2-blanc) 70%, transparent)"
                  >
                    {{ stat.label }}
                  </dt>
                  <dd
                    class="mt-1 text-[26px] font-extrabold leading-none tracking-[-0.03em] tabular-nums"
                  >
                    {{ stat.value }}
                  </dd>
                </div>
              }
            </dl>
            @if (campaign().allCampaigns) {
              <p class="relative mt-3 text-[12px] font-semibold" style="color: color-mix(in oklab, var(--v2-blanc) 70%, transparent)">
                {{ t()("dashboard.campaign.allNote") }}
              </p>
            }
          }
        </section>

        <section
          class="card flex flex-col p-6"
          style="grid-area: quality"
          aria-labelledby="quality-title"
        >
          <div class="flex items-start justify-between gap-3">
            <h2 id="quality-title" class="h2">{{ t()("dashboard.quality.title") }}</h2>
            <ui-icon name="verified" [size]="24" style="color: var(--v2-vert-pousse)" />
          </div>
          <div class="mt-5 flex items-center gap-6">
            <div
              class="relative grid size-[132px] shrink-0 place-items-center rounded-full"
              [style.background]="quality().ring"
              role="img"
              [attr.aria-label]="quality().pct + ' % ' + t()('dashboard.quality.ring')"
            >
              <div
                class="grid size-[100px] place-items-center rounded-full text-center"
                style="background: var(--v2-blanc)"
              >
                <span>
                  <span class="block text-[28px] font-extrabold leading-none tracking-[-0.03em]"
                    >{{ quality().pct }}<span class="text-[16px]"> %</span></span
                  >
                  <span
                    class="mt-1 block text-[11px] font-semibold"
                    style="color: var(--v2-gris-texte)"
                    >{{ t()("dashboard.quality.ring") }}</span
                  >
                </span>
              </div>
            </div>
            <ul class="min-w-0 flex-1 space-y-2.5">
              @for (share of quality().rows; track share.label) {
                <li class="flex items-center justify-between gap-2 text-[14px]">
                  <span class="flex items-center gap-2 font-semibold">
                    <span
                      class="size-2.5 rounded-full"
                      [style.background]="share.color"
                      aria-hidden="true"
                    ></span
                    >{{ share.label }}
                  </span>
                  <span class="font-extrabold tabular-nums">{{
                    localeService.formatNumber(share.n)
                  }}</span>
                </li>
              }
            </ul>
          </div>
          @if (store.can("quality.review") || store.can("alert.manage")) {
            <a class="link mt-auto pt-5" routerLink="/dashboard/qualite">
              {{ t()("dashboard.quality.open") }} <ui-icon name="arrow_forward" [size]="18" />
            </a>
          }
        </section>

        <!-- ───── Le réseau (vue d'ensemble uniquement) ───── -->
        @if (network().length) {
          <section
            class="card p-5 sm:p-6"
            style="grid-area: network"
            aria-labelledby="network-title"
          >
            <h2 id="network-title" class="mono" style="color: var(--v2-gris-texte)">
              {{ t()("dashboard.network.title") }}
            </h2>
            <ul class="mt-4 grid grid-cols-2 gap-x-4 gap-y-5 md:grid-cols-3 xl:grid-cols-5">
              @for (level of network(); track level.label; let position = $index) {
                <li class="min-w-0" [class.net-sep]="position > 0">
                  @if (level.to) {
                    <a class="net" [routerLink]="level.to">
                      <ng-container
                        [ngTemplateOutlet]="netItem"
                        [ngTemplateOutletContext]="{ $implicit: level }"
                      />
                    </a>
                  } @else {
                    <div class="net net-static">
                      <ng-container
                        [ngTemplateOutlet]="netItem"
                        [ngTemplateOutletContext]="{ $implicit: level }"
                      />
                    </div>
                  }
                </li>
              }
            </ul>
          </section>
          <ng-template #netItem let-n>
            <span
              class="grid size-11 shrink-0 place-items-center rounded-[14px]"
              style="background: var(--v2-foret); color: var(--v2-citron)"
            >
              <ui-icon [name]="n.icon" [size]="22" />
            </span>
            <span class="min-w-0">
              <span class="flex items-center gap-2">
                <span
                  class="text-[26px] font-extrabold leading-none tracking-[-0.03em] tabular-nums"
                  >{{ n.value }}</span
                >
                @if (n.growth) {
                  <span
                    class="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[12px] font-extrabold"
                    style="background: var(--v2-succes-bg); color: var(--v2-succes-fg)"
                  >
                    <ui-icon name="north_east" [size]="13" />{{ n.growth }}
                  </span>
                }
              </span>
              <span class="mt-1 block text-[14px] font-bold leading-snug">{{ n.label }}</span>
              <span class="sub block leading-snug">{{ n.sub }}</span>
            </span>
          </ng-template>
        }

        <!-- ───── Chiffres clés (tendances simulées) ───── -->
        <section
          class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
          style="grid-area: kpis"
          [attr.aria-label]="t()('dashboard.overview')"
        >
          @for (kpi of kpis(); track kpi.label) {
            <div class="card kpi flex flex-col p-5">
              <div class="flex items-center justify-between gap-3">
                <span class="text-[14px] font-semibold" style="color: var(--v2-ardoise)">{{
                  kpi.label
                }}</span>
                <span
                  class="grid size-10 place-items-center rounded-[12px]"
                  style="background: var(--v2-sauge); color: var(--v2-foret)"
                >
                  <ui-icon [name]="kpi.icon" [size]="20" />
                </span>
              </div>
              <div class="mt-3 flex items-end justify-between gap-3">
                <span
                  class="whitespace-nowrap text-[32px] font-extrabold leading-none tracking-[-0.03em] tabular-nums"
                  >{{ kpi.value }}
                  @if (kpi.unit) {
                    <span class="ml-1 text-[16px] font-bold" style="color: var(--v2-gris-texte)">{{
                      kpi.unit
                    }}</span>
                  }
                </span>
                <svg
                  viewBox="0 0 120 40"
                  class="h-10 w-28 shrink-0"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path [attr.d]="kpi.spark.area" fill="var(--v2-chart-2)" fill-opacity="0.18" />
                  <path
                    [attr.d]="kpi.spark.line"
                    fill="none"
                    stroke="var(--v2-vert-pousse)"
                    stroke-width="2.2"
                    stroke-linejoin="round"
                    stroke-linecap="round"
                    vector-effect="non-scaling-stroke"
                  />
                </svg>
              </div>
              <p class="mt-3 flex items-center gap-1.5 text-[13px] font-semibold">
                <span
                  class="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[12px] font-extrabold"
                  style="background: var(--v2-sauge); color: var(--v2-vert-pousse)"
                >
                  <ui-icon name="north_east" [size]="14" />{{ kpi.delta }}
                </span>
                <span style="color: var(--v2-gris-texte)">{{ t()("dashboard.kpi.trend") }}</span>
              </p>
            </div>
          }
        </section>

        <!-- ───── À traiter · graphique ───── -->
        <section class="card p-4 sm:p-5" style="grid-area: todo" aria-labelledby="todo-title">
          <h2 id="todo-title" class="h2 px-2 pt-1">{{ t()("dashboard.todo.title") }}</h2>
          <ul class="mt-3 space-y-1">
            @for (item of todos(); track item.key) {
              <li>
                <a class="task" [routerLink]="item.to">
                  <span
                    class="grid size-12 shrink-0 place-items-center rounded-[14px]"
                    [style.background]="item.bg"
                    [style.color]="item.fg"
                  >
                    <ui-icon [name]="item.icon" [size]="22" />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block text-[15px] font-bold leading-snug">{{
                      t()(item.key)
                    }}</span>
                    <span class="sub block truncate">{{ item.sub }}</span>
                  </span>
                  <span class="text-[24px] font-extrabold tracking-[-0.03em] tabular-nums">{{
                    item.value === null ? "—" : localeService.formatNumber(item.value)
                  }}</span>
                  <ui-icon name="arrow_forward" [size]="20" class="arrow" />
                </a>
              </li>
            }
          </ul>
        </section>

        <section class="card flex flex-col p-5 sm:p-6" style="grid-area: chart">
          <h2 class="h2">{{ t()("dashboard.chart.byScoop") }}</h2>
          <div class="relative mt-4 h-72 w-full min-h-0 overflow-hidden">
            <ui-chart type="bar" [data]="byScoopChart().data" [options]="byScoopChart().options" />
          </div>
        </section>

        <!-- ───── Coopératives · réunions ───── -->
        @if (layout().ranking) {
          <section
            class="card overflow-hidden"
            style="grid-area: ranking"
            aria-labelledby="ranking-title"
          >
            <div class="flex flex-wrap items-end justify-between gap-3 px-6 pt-6">
              <div>
                <h2 id="ranking-title" class="h2">{{ t()("dashboard.ranking.title") }}</h2>
                <p class="sub mt-0.5">{{ t()("dashboard.ranking.sub") }}</p>
              </div>
              <a class="link" routerLink="/dashboard/cooperatives"
                >{{ t()("dashboard.ranking.all") }} <ui-icon name="arrow_forward" [size]="18"
              /></a>
            </div>
            <div class="mt-4 overflow-x-auto">
              <table class="w-full min-w-[560px] text-left text-[14px]">
                <thead>
                  <tr class="mono" style="color: var(--v2-gris-texte)">
                    <th class="px-6 py-2.5 font-bold">{{ t()("dashboard.ranking.scoop") }}</th>
                    <th class="px-3 py-2.5 text-right font-bold">
                      {{ t()("dashboard.ranking.producers") }}
                    </th>
                    <th class="px-3 py-2.5 text-right font-bold">
                      {{ t()("dashboard.ranking.women") }}
                    </th>
                    <th class="w-[32%] px-6 py-2.5 font-bold">
                      {{ t()("dashboard.ranking.quality") }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  @for (rankedScoop of ranking(); track rankedScoop.id; let position = $index) {
                    <tr
                      class="row-link"
                      [routerLink]="['/dashboard/cooperatives', rankedScoop.id]"
                      tabindex="0"
                      style="border-top: 1px solid var(--v2-separateur)"
                    >
                      <td class="px-6 py-3.5">
                        <span class="flex items-center gap-3">
                          <span
                            class="grid size-9 shrink-0 place-items-center rounded-[10px] text-[13px] font-extrabold"
                            style="background: var(--v2-sauge); color: var(--v2-foret)"
                            >{{ position + 1 }}</span
                          >
                          <span class="min-w-0">
                            <span class="block truncate font-bold">{{ rankedScoop.name }}</span>
                            @if (rankedScoop.commune && rankedScoop.commune !== rankedScoop.name) {
                              <span
                                class="block truncate text-[12px] font-medium"
                                style="color: var(--v2-gris-texte)"
                                >{{ rankedScoop.commune }}</span
                              >
                            }
                          </span>
                        </span>
                      </td>
                      <td class="px-3 py-3.5 text-right font-extrabold tabular-nums">
                        {{ localeService.formatNumber(rankedScoop.producers) }}
                      </td>
                      <td class="px-3 py-3.5 text-right font-semibold tabular-nums">
                        {{ rankedScoop.women }} %
                      </td>
                      <td class="px-6 py-3.5">
                        <span class="flex items-center gap-3">
                          <span class="bar flex-1"
                            ><span
                              [style.width.%]="rankedScoop.quality"
                              [style.background]="
                                rankedScoop.quality >= 70
                                  ? 'var(--v2-vert-pousse)'
                                  : 'var(--v2-soleil)'
                              "
                            ></span
                          ></span>
                          <span class="w-10 text-right text-[13px] font-bold tabular-nums"
                            >{{ rankedScoop.quality }} %</span
                          >
                        </span>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>
        }
        <section
          class="card flex flex-col p-6"
          style="grid-area: meetings"
          aria-labelledby="meetings-title"
        >
          <div class="flex items-center justify-between gap-3">
            <h2 id="meetings-title" class="h2">{{ t()("dashboard.meetings.title") }}</h2>
            <ui-icon name="event_upcoming" [size]="24" style="color: var(--v2-foret-clair)" />
          </div>
          <ul class="mt-4 space-y-2">
            @for (meeting of meetings(); track meeting.id) {
              <li>
                <a class="task" [routerLink]="['/dashboard/reunions', meeting.id]">
                  <span
                    class="grid w-14 shrink-0 place-items-center rounded-[14px] py-2 text-center"
                    style="background: var(--v2-foret); color: var(--v2-blanc)"
                  >
                    <span class="text-[20px] font-extrabold leading-none">{{ meeting.day }}</span>
                    <span class="mono mt-1" style="color: var(--v2-citron); font-size: 10px">{{
                      meeting.month
                    }}</span>
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-[15px] font-bold">{{ meeting.title }}</span>
                    <span class="sub flex items-center gap-1 truncate"
                      ><ui-icon name="location_on" [size]="14" />{{ meeting.place }}</span
                    >
                    <span class="sub block truncate">{{ meeting.scoop }}</span>
                  </span>
                </a>
              </li>
            } @empty {
              <li class="sub rounded-[16px] p-4" style="background: var(--v2-creme)">
                {{ t()("dashboard.meetings.empty") }}
              </li>
            }
          </ul>
          @if (store.can("meeting.read")) {
            <a class="link mt-auto pt-4" routerLink="/dashboard/reunions"
              >{{ t()("dashboard.meetings.all") }} <ui-icon name="arrow_forward" [size]="18"
            /></a>
          }
        </section>

        <!-- ───── Activité récente ───── -->
        <section class="card p-6" style="grid-area: activity" aria-labelledby="activity-title">
          <div class="flex items-center justify-between gap-3">
            <h2 id="activity-title" class="h2">{{ t()("dashboard.activity.title") }}</h2>
            @if (store.can("audit.read") || store.can("audit.read.scoop")) {
              <a class="link" routerLink="/dashboard/audit"
                >{{ t()("dashboard.activity.all") }} <ui-icon name="arrow_forward" [size]="18"
              /></a>
            }
          </div>
          <ol class="relative mt-5 space-y-5 pl-1">
            @for (entry of data().recentAudit; track entry.id; let last = $last) {
              <li class="relative flex gap-4">
                @if (!last) {
                  <span
                    class="absolute left-[19px] top-11 h-[calc(100%-12px)] w-px"
                    style="background: var(--v2-lin)"
                    aria-hidden="true"
                  ></span>
                }
                <span
                  class="grid size-10 shrink-0 place-items-center rounded-full text-[12px] font-extrabold"
                  style="background: var(--v2-sauge); color: var(--v2-foret)"
                  aria-hidden="true"
                  >{{ initialsOf(entry.user) }}</span
                >
                <span class="min-w-0 flex-1 pt-0.5">
                  <span class="block text-[14px]">
                    <span class="font-bold">{{ entry.action }}</span>
                    <span style="color: var(--v2-ardoise)"> · {{ entry.entity }}</span>
                  </span>
                  <span class="sub block">{{
                    t()("dashboard.activity.by", { user: entry.user })
                  }}</span>
                </span>
                <span
                  class="mono shrink-0 pt-1 normal-case tracking-normal"
                  style="color: var(--v2-gris-texte)"
                  >{{ fmtDateTime(entry.at) }}</span
                >
              </li>
            } @empty {
              <li class="sub">—</li>
            }
          </ol>
        </section>
      </div>
    </app-shell>
  `,
})
export default class IndexPage {
  protected readonly store = inject(StoreService);
  protected readonly localeService = inject(LocaleService);
  protected readonly t = this.localeService.t;
  protected readonly fmtDateTime = fmtDateTime;
  private readonly document = inject(DOCUMENT);

  /** Mode API : activité récente lue sur le serveur (jamais dans le navigateur). */
  private readonly serverActivity = signal<AuditEntry[]>([]);

  /**
   * Mode API : les totaux de l'accueil (effectifs, genre, jeunes, qualité) viennent du serveur (`/producers/stats`) et
   * les chiffres par coopérative de `/scoops/stats` : l'accueil ne télécharge plus la liste des producteurs.
   */
  private readonly serverTotals = signal<ProducerStats | null>(null);
  /** Alertes de qualité ouvertes, comptées par le serveur (`null` tant qu'il n'a pas répondu). */
  private readonly serverOpenAlerts = signal<number | null>(null);
  /** Réseau (organisations, GIE, comptes) lu dans le même résumé serveur. */
  private readonly serverNetwork = signal<StatsNetwork | null>(null);
  /** Adhérents (actifs, total) et alertes critiques, comptés par le serveur : plus de liste de membres dans le navigateur. */
  private readonly serverMembers = signal<StatsMembers | null>(null);
  private readonly serverOpenHigh = signal<number | null>(null);

  /** Les coopératives du périmètre avec leurs chiffres serveur (mode API). */
  private coopStats() {
    const s = this.store.state();
    return s.scoops
      .filter((scoop) => !scoop.archived)
      .map((scoop) => ({ scoop, st: s.scoopStats[scoop.id] }))
      .filter((row): row is { scoop: (typeof s.scoops)[number]; st: NonNullable<(typeof row)["st"]> } => !!row.st);
  }

  // Droits sous forme de valeurs simples : un effet qui les lit ne se relance que quand elles changent (et non à chaque
  // modification du store), ce qui évite de renvoyer plusieurs fois les mêmes demandes au serveur.
  private readonly canReadOrgs = computed(() => this.store.can("org.read"));
  private readonly canReadProducers = computed(() => this.store.can("producer.read"));
  private readonly canReadMembers = computed(() => this.store.can("member.read"));
  private readonly canReadAudit = computed(() => {
    const session = this.store.state().session;
    return !!session && (session.permissions.includes("audit.read") || session.permissions.includes("audit.read.scoop"));
  });
  private readonly youthMaxAge = computed(() => this.store.state().youthMaxAge);

  constructor() {
    if (!isApiMode()) return;
    // Un seul appel pour tout l'accueil : producteurs, réseau et alertes (`GET /stats/overview`).
    effect(() => {
      const allowed = this.canReadProducers() || this.canReadOrgs() || this.canReadMembers();
      const youthMaxAge = this.youthMaxAge();
      untracked(() => {
        if (!allowed) return;
        getStatsOverview(youthMaxAge)
          .then((overview) => {
            this.serverTotals.set(overview.producers?.ALL ?? null);
            this.serverNetwork.set(overview.network);
            this.serverOpenAlerts.set(overview.openAlerts);
            this.serverOpenHigh.set(overview.openHighAlerts);
            this.serverMembers.set(overview.members);
          })
          .catch((error: unknown) => console.error("[ERROR][IndexPage.overview]", error));
      });
    });
    effect(() => {
      const allowed = this.canReadAudit();
      untracked(() => {
        if (!allowed) {
          this.serverActivity.set([]);
          return;
        }
        fetchRecentAudit(6)
          .then((entries) => this.serverActivity.set(entries))
          .catch((error: unknown) => {
            console.error("[ERROR][IndexPage.activity]", error);
            this.serverActivity.set([]);
          });
      });
    });
  }

  /** Valeur calculée d'un token CSS (axes et légendes Chart.js) ; `undefined` au rendu serveur. */
  private token(name: string): string | undefined {
    try {
      return (
        getComputedStyle(this.document.documentElement).getPropertyValue(name).trim() || undefined
      );
    } catch {
      return undefined;
    }
  }

  protected readonly firstName = computed(
    () => this.store.state().session?.name.split(" ")[0] ?? "",
  );

  protected readonly today = computed(() =>
    this.localeService.formatDate(new Date(), {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
  );

  protected initialsOf(name: string): string {
    return name
      .split(" ")
      .filter(Boolean)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }

  protected readonly data = computed(() => {
    const s = this.store.state();
    const session = s.session;
    const now = new Date().toISOString();

    const producersInScope = inScope(
      s.producers.filter((p) => !p.mergedInto),
      session,
    );
    const members = scopedMembers(s.members, session);
    const mc = membershipCounts(members);
    const ids = new Set(producersInScope.map((p) => p.id));
    const women = producersInScope.filter((p) => p.sex === "F");
    const youth = producersInScope.filter((p) => ageAtMost(p.age, s.youthMaxAge));
    const plotsInScope = s.plots.filter((p) => ids.has(p.producerId));

    const pendingDossiers = scopedDossiers(s.dossiers, session)
      .filter((d) => d.status === "soumis" || d.status === "en examen")
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
    const oldestDays = pendingDossiers[0]
      ? Math.max(
          0,
          Math.floor((Date.now() - new Date(pendingDossiers[0].updatedAt).getTime()) / 86_400_000),
        )
      : 0;

    const prodById = new Map(producersInScope.map((p) => [p.id, p]));
    const plotById = new Map(s.plots.map((p) => [p.id, p]));
    const openAlerts = s.alerts.filter((a) => {
      if (a.status !== "ouvert") return false;
      const owner =
        a.entity === "producteur"
          ? prodById.get(a.entityId)
          : prodById.get(plotById.get(a.entityId)?.producerId ?? "");
      return !!owner && ids.has(owner.id);
    });
    const criticalAlerts = openAlerts.filter((a) => a.severity === "élevée").length;

    const scopeRules = scopedRules(s.contributionRules, session);
    const payments = scopedPayments(s.payments, session);
    const lateDues = members.filter((m) => {
      if (m.status !== "membre") return false;
      const rule = scopeRules.find((r) => r.scoopId === m.scoopId);
      const state = memberDues(m, rule, payments, now).state;
      return state === "en retard" || state === "jamais payé";
    }).length;

    const api = isApiMode();
    const totals = api ? this.serverTotals() : null;
    const coop = api ? this.coopStats() : [];
    const sumCoop = (pick: (st: (typeof coop)[number]["st"]) => number) => coop.reduce((sum, row) => sum + pick(row.st), 0);
    const plotsCount = api ? sumCoop((st) => st.plots) : plotsInScope.length;
    const plotsValidated = api ? sumCoop((st) => st.plotsValidated) : plotsInScope.filter((p) => p.status === "validée").length;
    return {
      producers: api ? (totals?.total ?? sumCoop((st) => st.producers)) : producersInScope.length,
      activeMembers: api ? (this.serverMembers()?.active ?? 0) : mc.active,
      womenPct: api
        ? totals?.total
          ? (totals.women / totals.total) * 100
          : 0
        : producersInScope.length
          ? (women.length / producersInScope.length) * 100
          : 0,
      youthCount: api ? (totals?.youth ?? 0) : youth.length,
      plotsCount,
      plotsValidated,
      pendingDossiers: pendingDossiers.length,
      oldestDays,
      // Mode API : points signalés à l'import Kobo (pas d'alertes de démonstration).
      openAlerts: isApiMode() ? (this.serverOpenAlerts() ?? 0) : openAlerts.length,
      criticalAlerts: api ? (this.serverOpenHigh() ?? 0) : criticalAlerts,
      // Mode API : les cotisations dues ne sont pas encore calculées par le serveur → « — » plutôt qu'un faux 0.
      lateDues: api ? null : lateDues,
      producersInScope,
      plotsInScope,
      measuredHa: api ? sumCoop((st) => st.plotAreaHa) : plotsInScope.reduce((sum, p) => sum + (p.measured || 0), 0),
      recentAudit: isApiMode() ? this.serverActivity() : s.audit.slice(0, 6),
    };
  });

  /**
   * Ordre des blocs selon le rôle :
   * - vue d'ensemble (admin CRADESC, faîtière) : campagne en cours et prochaines réunions d'abord,
   *   puis le réseau et les chiffres, puis ce qui demande une action ;
   * - rôles limités à leur coopérative : le travail d'abord (« À traiter »), puis les chiffres.
   * Le classement des coopératives n'a de sens qu'avec plusieurs SCOOP dans le périmètre.
   */
  protected readonly layout = computed(() => {
    const consolidated = this.store.state().session?.scope.kind === "consolidé";
    const ranking = this.ranking().length > 1;
    const full = (area: string) => Array(6).fill(area).join(" ");
    // « Producteurs en chiffres » : après la campagne et le réseau (mode serveur, droit de lecture des producteurs).
    const producers = isApiMode() && this.store.can("producer.read") ? [full("producers")] : [];
    const rows = consolidated
      ? [
          "campaign campaign campaign campaign meetings meetings",
          ...(this.network().length ? [full("network")] : []),
          ...producers,
          full("kpis"),
          "quality quality todo todo todo todo",
          ...(ranking ? [full("ranking")] : []),
          "chart chart chart activity activity activity",
        ]
      : [
          "todo todo todo todo quality quality",
          full("kpis"),
          "campaign campaign campaign campaign meetings meetings",
          ...producers,
          ...(ranking ? [full("ranking")] : []),
          full("chart"),
          full("activity"),
        ];
    const order = rows.flatMap((r) => [...new Set(r.split(" "))]);
    return {
      ranking,
      lg: rows.map((r) => `"${r}"`).join(" "),
      sm: [...new Set(order)].map((a) => `"${a}"`).join(" "),
    };
  });

  /** Taille du réseau (vue d'ensemble seulement) : chaque compteur mène à sa page si le rôle y a accès. */
  protected readonly network = computed(() => {
    const s = this.store.state();
    if (s.session?.scope.kind !== "consolidé") return [];
    const t = this.t();
    const n = (v: number) => this.localeService.formatNumber(v);
    const scoops = s.scoops.filter((x) => !x.archived);
    // Croissance réelle : coopératives créées dans la plateforme ces 90 derniers jours.
    const since = Date.now() - 90 * 86_400_000;
    const joined = scoops
      .filter((x) => x.createdAt && new Date(x.createdAt).getTime() >= since)
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    // Mode API : organisations, GIE et comptes viennent du résumé serveur (`null` = non autorisé : « — », jamais un faux 0).
    const api = isApiMode();
    const net = api ? this.serverNetwork() : null;
    const dash = (value: number | null | undefined) => (value === null || value === undefined ? "—" : n(value));
    const gie = api ? (net?.gie ?? 0) : s.orgs.filter((o) => o.type === "GIE").length;
    const technicians = api ? [] : s.users.filter((u) => u.role === "technicien" && u.active);
    const active = api ? (net?.accountsActive ?? 0) : s.users.filter((u) => u.active).length;
    const invited = api ? (net?.invitationsPending ?? 0) : s.users.filter((u) => !u.active && u.invited).length;
    const validated = isApiMode() ? this.data().plotsValidated : s.plots.filter((p) => p.status === "validée").length;
    const canOrgs = this.store.can("org.read");
    const canUsers = this.store.can("user.manage");
    const items: {
      icon: IconName;
      value: string;
      label: string;
      sub: string;
      growth?: string;
      to: string | null;
    }[] = [
      {
        icon: "diversity_3",
        value: n(scoops.length),
        label: t("dashboard.network.scoops"),
        sub: joined.length
          ? t("dashboard.network.latest", { name: joined[0]!.name })
          : t("dashboard.network.scoopsSub", { count: new Set(scoops.map((x) => x.commune)).size }),
        growth: joined.length ? t("dashboard.network.joined", { count: joined.length }) : undefined,
        to: canOrgs ? "/dashboard/cooperatives" : null,
      },
      {
        icon: "hub",
        value: api ? dash(net?.organisations) : n(s.orgs.length),
        label: t("dashboard.network.orgs"),
        sub: t("dashboard.network.orgsSub", { count: n(gie) }),
        to: canOrgs ? "/dashboard/organisations" : null,
      },
      {
        icon: "person",
        value: api ? dash(net?.techniciansActive) : n(technicians.length),
        label: t("dashboard.network.technicians"),
        sub: t("dashboard.network.techniciansSub"),
        to: canUsers ? "/dashboard/utilisateurs" : null,
      },
      {
        icon: "account_circle",
        value: api ? dash(net?.accountsActive) : n(active),
        label: t("dashboard.network.accounts"),
        sub: t("dashboard.network.accountsSub", { count: invited }),
        to: canUsers ? "/dashboard/utilisateurs" : null,
      },
      {
        icon: "pin_drop",
        value: n(isApiMode() ? this.data().plotsCount : s.plots.length),
        label: t("dashboard.network.plots"),
        sub: t("dashboard.network.plotsSub", { count: n(validated) }),
        to: null,
      },
    ];
    return items;
  });

  /** Campagne « en cours » (sinon la plus récente) : avancement dans le temps + parcelles relevées. */
  protected readonly campaign = computed(() => {
    const s = this.store.state();
    const list = [...s.campaigns].sort((a, b) => b.start.localeCompare(a.start));
    const c = list.find((x) => x.status === "en cours") ?? list[0];
    const empty = {
      name: null as string | null,
      start: "",
      end: "",
      pct: 0,
      remaining: 0,
      stats: [] as { label: string; value: string }[],
      allCampaigns: false,
    };
    if (!c) return empty;
    const start = new Date(c.start).getTime();
    const end = new Date(c.end).getTime();
    const pct = Math.round(
      Math.min(1, Math.max(0, (Date.now() - start) / Math.max(1, end - start))) * 100,
    );
    const remaining = Math.max(0, Math.ceil((end - Date.now()) / 86_400_000));
    const api = isApiMode();
    const plots = api ? [] : this.data().plotsInScope.filter((p) => p.campaign === c.name);
    const t = this.t();
    const n = (v: number) => this.localeService.formatNumber(v);
    return {
      name: c.name,
      // Mode API : les parcelles ne sont pas rattachées à une campagne par le serveur → chiffres de toutes les campagnes.
      allCampaigns: api,
      start: fmtDate(c.start),
      end: fmtDate(c.end),
      pct,
      remaining,
      stats: [
        { label: t("dashboard.campaign.plots"), value: n(api ? this.data().plotsCount : plots.length) },
        {
          label: t("dashboard.campaign.validated"),
          value: n(api ? this.data().plotsValidated : plots.filter((p) => p.status === "validée").length),
        },
        {
          label: t("dashboard.campaign.area"),
          value: t("dashboard.kpi.unitHa", {
            value: nf1.format(api ? this.data().measuredHa : plots.reduce((sum, p) => sum + (p.measured || 0), 0)),
          }),
        },
      ],
    };
  });

  /** Répartition des fiches par état de qualité, en anneau (conic-gradient, sans Chart.js). */
  protected readonly quality = computed(() => {
    const ps = this.data().producersInScope;
    const server = isApiMode() ? this.serverTotals() : null;
    const count = (quality: string) => (server ? (server.byQuality[quality] ?? 0) : ps.filter((p) => p.quality === quality).length);
    const t = this.t();
    const rows = [
      { label: t("dashboard.quality.validated"), n: count("validé"), color: "var(--v2-vert-pousse)" },
      { label: t("dashboard.quality.toVerify"), n: count("à vérifier"), color: "var(--v2-soleil)" },
      { label: t("dashboard.quality.duplicate"), n: count("doublon"), color: "var(--v2-info-fg)" },
      { label: t("dashboard.quality.invalid"), n: count("invalide"), color: "var(--v2-erreur-fg)" },
    ];
    const grandTotal = server ? server.qualityTotal : ps.length;
    const total = grandTotal || 1;
    let acc = 0;
    const stops = rows.map((r) => {
      const from = (acc / total) * 100;
      acc += r.n;
      return `${r.color} ${from}% ${(acc / total) * 100}%`;
    });
    return {
      rows,
      pct: Math.round((rows[0]!.n / total) * 100),
      ring: grandTotal ? `conic-gradient(${stops.join(", ")})` : "var(--v2-lin)",
    };
  });

  /** Chiffres clés : valeurs réelles ; courbe et variation SIMULÉES (démo). */
  protected readonly kpis = computed(() => {
    const d = this.data();
    const t = this.t();
    const n = (v: number) => this.localeService.formatNumber(v);
    const items: {
      label: string;
      icon: IconName;
      raw: number;
      value: string;
      unit: string;
      delta: string;
    }[] = [
      {
        label: t("dashboard.kpi.producers"),
        icon: "agriculture",
        raw: d.producers,
        value: n(d.producers),
        unit: "",
        delta: "+6,4 %",
      },
      {
        label: t("dashboard.kpi.activeMembers"),
        icon: "group",
        raw: d.activeMembers,
        value: n(d.activeMembers),
        unit: "",
        delta: "+3,1 %",
      },
      {
        label: t("dashboard.kpi.area"),
        icon: "square_foot",
        raw: d.measuredHa,
        value: nf1.format(d.measuredHa),
        unit: "ha",
        delta: "+8,9 %",
      },
      {
        label: t("dashboard.kpi.women"),
        icon: "female",
        raw: d.womenPct,
        value: nf1.format(d.womenPct),
        unit: "%",
        delta: "+1,2 pt",
      },
    ];
    return items.map((k, i) => ({ ...k, spark: sparkPaths(mockTrend(k.raw, i + 1)) }));
  });

  /** Tâches « À traiter » : couleurs d'état de la charte selon l'urgence. */
  protected readonly todos = computed(() => {
    const d = this.data();
    const t = this.t();
    return [
      {
        key: "dashboard.todo.dossiers" as const,
        to: "/dashboard/dossiers",
        icon: "folder_shared" as IconName,
        value: d.pendingDossiers,
        sub: d.pendingDossiers
          ? t("dashboard.todo.dossiersSub", { days: d.oldestDays })
          : t("dashboard.todo.empty"),
        bg: "var(--v2-info-bg)",
        fg: "var(--v2-info-fg)",
      },
      {
        key: "dashboard.todo.alerts" as const,
        to: "/dashboard/qualite/alertes",
        icon: "warning" as IconName,
        value: d.openAlerts,
        sub: t("dashboard.todo.alertsSub", { critical: d.criticalAlerts }),
        bg: d.criticalAlerts ? "var(--v2-erreur-bg)" : "var(--v2-attente-bg)",
        fg: d.criticalAlerts ? "var(--v2-erreur-fg)" : "var(--v2-attente-fg)",
      },
      {
        key: "dashboard.todo.dues" as const,
        to: "/dashboard/cotisations",
        icon: "payments" as IconName,
        value: d.lateDues,
        sub: t("dashboard.todo.duesSub"),
        bg: "var(--v2-attente-bg)",
        fg: "var(--v2-attente-fg)",
      },
    ];
  });

  /** Coopératives du périmètre, classées par nombre de producteurs (6 premières). */
  protected readonly ranking = computed(() => {
    const s = this.store.state();
    if (isApiMode()) {
      // Chiffres de chaque coopérative lus sur le serveur (`/scoops/stats`).
      return this.coopStats()
        .map(({ scoop, st }) => ({
          id: scoop.id,
          name: scoop.name,
          commune: scoop.commune,
          producers: st.producers,
          women: st.producers ? Math.round((st.women / st.producers) * 100) : 0,
          quality: st.producers ? Math.round((st.producersValidated / st.producers) * 100) : 0,
        }))
        .filter((r) => r.producers > 0)
        .sort((a, b) => b.producers - a.producers)
        .slice(0, 6);
    }
    const ps = this.data().producersInScope;
    return s.scoops
      .filter((sc) => !sc.archived)
      .map((sc) => {
        const mine = ps.filter((p) => p.scoopId === sc.id);
        const n = mine.length || 1;
        return {
          id: sc.id,
          name: sc.name,
          commune: sc.commune,
          producers: mine.length,
          women: Math.round((mine.filter((p) => p.sex === "F").length / n) * 100),
          quality: Math.round((mine.filter((p) => p.quality === "validé").length / n) * 100),
        };
      })
      .filter((r) => r.producers > 0)
      .sort((a, b) => b.producers - a.producers)
      .slice(0, 6);
  });

  /** Trois prochaines réunions planifiées du périmètre. */
  protected readonly meetings = computed(() => {
    const s = this.store.state();
    if (!this.store.can("meeting.read")) return [];
    const now = new Date().toISOString();
    const scoopName = new Map(s.scoops.map((sc) => [sc.id, sc.name]));
    return inScope(s.meetings, s.session)
      .filter((m) => m.status === "planifiée" && m.date >= now)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 3)
      .map((m) => ({
        id: m.id,
        title: m.title,
        place: m.place,
        scoop: scoopName.get(m.scoopId) ?? "",
        day: this.localeService.formatDate(m.date, { day: "2-digit" }),
        month: this.localeService.formatDate(m.date, { month: "short" }).replace(".", ""),
      }));
  });

  protected readonly byScoopChart = computed((): ChartConfiguration<"bar"> => {
    const s = this.store.state();
    const producers = this.data().producersInScope;
    const font = { family: "Plus Jakarta Sans, system-ui, sans-serif", size: 12 };
    const ink = this.token("--v2-encre");
    const muted = this.token("--v2-gris-texte");
    const line = this.token("--v2-separateur");
    const rows = (
      isApiMode()
        ? this.coopStats().map(({ scoop, st }) => ({ name: scoop.commune, F: st.women, H: st.men }))
        : s.scoops.map((scoop) => {
            const ps = producers.filter((p) => p.scoopId === scoop.id);
            return {
              name: scoop.commune,
              F: ps.filter((p) => p.sex === "F").length,
              H: ps.filter((p) => p.sex === "H").length,
            };
          })
    ).filter((r) => r.F + r.H > 0);
    return {
      type: "bar",
      data: {
        labels: rows.map((r) => r.name),
        datasets: [
          {
            label: this.t()("dashboard.chart.women"),
            data: rows.map((r) => r.F),
            backgroundColor: "var(--v2-chart-2)",
            borderRadius: 6,
            borderSkipped: false,
            barThickness: 12,
          },
          {
            label: this.t()("dashboard.chart.men"),
            data: rows.map((r) => r.H),
            backgroundColor: "var(--v2-chart-1)",
            borderRadius: 6,
            borderSkipped: false,
            barThickness: 12,
          },
        ],
      },
      options: {
        indexAxis: "y",
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              usePointStyle: true,
              pointStyle: "rectRounded",
              padding: 18,
              color: ink,
              font: { ...font, weight: 600 },
            },
          },
        },
        scales: {
          x: {
            stacked: true,
            beginAtZero: true,
            grid: { color: line },
            border: { display: false },
            ticks: { color: muted, font },
          },
          y: {
            stacked: true,
            grid: { display: false },
            border: { display: false },
            ticks: { color: ink, font: { ...font, weight: 600 } },
          },
        },
      },
    };
  });
}
