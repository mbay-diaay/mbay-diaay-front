import { Component, computed, effect, inject, signal, untracked } from "@angular/core";
import { RouterLink } from "@angular/router";

import { AccessDeniedError, inScope } from "@/lib/store";
import { isApiMode } from "@/lib/api/config";
import { alertDraft, sheetDraft } from "@/lib/coop-request-templates";
import type { CoopRequestKind } from "@/lib/api/coop-requests";
import { describeSource, sourceOfProducer, type DataSource } from "@/lib/data-source";
import { fmtDate, nf } from "@/lib/format";
import { fetchAllPages } from "@/lib/api/pagination";
import {
  ALERT_REASON_KEY,
  alertErrorKey,
  detectCloseCni,
  listQualityAlerts,
  QUALITY_ALERT_KINDS,
  type QualityAlertDto,
  type QualityAlertKind,
  type QualityAlertStatus,
} from "@/lib/api/quality-alerts";
import {
  collectQualityPoints,
  explainAlert,
  type QualityPoint,
  type QualityPointKind,
} from "@/lib/quality-real";
import type { AlertStatus, DataAlert } from "@/lib/mock/data";
import type { MessageKey } from "@/lib/i18n";
import type { Permission } from "@/lib/permissions";
import { AppShellComponent } from "@shared/app-shell.component";
import { CniAlertsService } from "@shared/cni-alerts.service";
import { CniResolveModalComponent } from "@shared/cni-resolve-modal.component";
import { ContactScoopModalComponent, type CoopRequestTarget } from "@shared/contact-scoop-modal.component";
import { LocaleService } from "@shared/locale.service";
import { StoreService } from "@shared/store.service";
import { createPager } from "@shared/pager";
import {
  IconComponent,
  ModalComponent,
  PaginationComponent,
  SelectComponent,
  SnackbarService,
  StatCardsComponent,
  TONE,
  V2_PAGE_STYLES,
  type SelectOption,
  type StatCard,
} from "@shared/ui";

const STATUSES: readonly AlertStatus[] = ["ouvert", "en vérification", "résolu", "rejeté"];
const STATUS: Record<AlertStatus, { label: MessageKey; tab: MessageKey; bg: string; fg: string }> =
  {
    ouvert: {
      label: "qualite.alertes.statusValue.ouvert",
      tab: "qualite.alertes.status.ouvert",
      ...TONE.attente,
    },
    "en vérification": {
      label: "qualite.alertes.statusValue.en vérification",
      tab: "qualite.alertes.status.en vérification",
      ...TONE.info,
    },
    résolu: {
      label: "qualite.alertes.statusValue.résolu",
      tab: "qualite.alertes.status.résolu",
      ...TONE.succes,
    },
    rejeté: {
      label: "qualite.alertes.statusValue.rejeté",
      tab: "qualite.alertes.status.rejeté",
      ...TONE.neutre,
    },
  };
const SEVERITY: Record<DataAlert["severity"], { label: MessageKey; bg: string; fg: string }> = {
  élevée: { label: "qualite.alertes.severity.élevée", ...TONE.erreur },
  moyenne: { label: "qualite.alertes.severity.moyenne", ...TONE.attente },
  faible: { label: "qualite.alertes.severity.faible", ...TONE.neutre },
};
const RANK = { élevée: 0, moyenne: 1, faible: 2 } as const;
const norm = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Alertes qualité (charte V2) : statistiques, filtres état / sévérité à compteurs, tableau
 * sélectionnable, décision en lot (vérifier, résoudre, rejeter) avec commentaire, lien vers la fiche.
 */
@Component({
  selector: "app-qualite-alertes-page",
  imports: [
    AppShellComponent,
    CniResolveModalComponent,
    ContactScoopModalComponent,
    IconComponent,
    ModalComponent,
    PaginationComponent,
    RouterLink,
    SelectComponent,
    StatCardsComponent,
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
      .cni-head {
        border-bottom: 1px solid var(--v2-separateur);
      }
      .cni-dot {
        display: inline-grid;
        place-items: center;
        width: 32px;
        height: 32px;
        border-radius: 10px;
        background: var(--v2-erreur-bg);
        color: var(--v2-erreur-fg);
      }
      .cni-explain {
        max-width: 66ch;
        border-radius: 16px;
        background: var(--v2-info-bg);
        color: var(--v2-info-fg);
        padding: 12px 14px;
        font-size: 14px;
        font-weight: 500;
        line-height: 1.5;
      }
      .cni-pill.format {
        background: var(--v2-attente-bg);
        color: var(--v2-attente-fg);
      }
      .cni-pill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        border-radius: 999px;
        padding: 2px 8px;
        font-size: 11px;
        font-weight: 800;
        background: var(--v2-erreur-bg);
        color: var(--v2-erreur-fg);
      }
      .act-ok:hover {
        border-color: var(--v2-vert-pousse);
        background: var(--v2-sauge);
        color: var(--v2-vert-pousse);
      }
    `,
  ],
  template: `
    <app-shell [perm]="pagePerms" [area]="t()('qualite.alertes.area')">
      <header class="rise">
        <p class="mono" style="color: var(--v2-gris-texte)">{{ t()("qualite.header.title") }}</p>
        <h1
          class="mt-2 text-[30px] font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-[38px]"
        >
          {{ t()("qualite.alertes.area") }}
        </h1>
        <p class="mt-2 max-w-2xl text-[16px] font-medium" style="color: var(--v2-gris-texte)">
          {{ t()("qualite.alertes.description") }}
        </p>
      </header>

      <ui-stat-cards class="rise mt-8" [stats]="stats()" />

      @if (!apiMode) {
      <div class="toolbar card mt-6">
        <label class="search">
          <ui-icon name="search" [size]="20" />
          <input
            type="search"
            [placeholder]="t()('qualite.alertes.searchPlaceholder')"
            [attr.aria-label]="t()('qualite.alertes.searchAria')"
            [value]="q()"
            (input)="q.set($any($event.target).value)"
          />
        </label>
        <ui-select
          class="min-w-[200px]"
          variant="compact"
          leadingIcon="warning"
          [label]="t()('qualite.alertes.filter.severity')"
          [options]="severityOptions()"
          [value]="severity()"
          (valueChange)="severity.set($event)"
        />
        <div class="seg" role="radiogroup" [attr.aria-label]="t()('qualite.alertes.status.aria')">
          @for (statusButton of statusButtons(); track statusButton.id) {
            <button
              type="button"
              role="radio"
              [class.on]="status() === statusButton.id"
              [attr.aria-checked]="status() === statusButton.id"
              (click)="status.set(statusButton.id); selected.set([])"
            >
              {{ statusButton.label
              }}<span class="n" [class.zero]="!statusButton.count">{{
                nf.format(statusButton.count)
              }}</span>
            </button>
          }
        </div>
      </div>

      <p class="sub mt-4" aria-live="polite">
        {{ t()("qualite.v2.alertes.count", { count: nf.format(rows().length) }) }}
      </p>

      <section class="card mt-3 overflow-hidden">
        @if (rows().length) {
          <div class="overflow-x-auto">
            <table class="tbl min-w-[960px]">
              <thead>
                <tr>
                  <th class="w-10">
                    @if (canDecide()) {
                      <input
                        type="checkbox"
                        [checked]="allPageSelected()"
                        [attr.aria-label]="t()('qualite.alertes.selectAll')"
                        (change)="togglePage($any($event.target).checked)"
                      />
                    }
                  </th>
                  <th>{{ t()("qualite.alertes.col.type") }}</th>
                  <th>{{ t()("qualite.alertes.col.entity") }}</th>
                  <th>{{ t()("qualite.alertes.col.enumerator") }}</th>
                  <th>{{ t()("qualite.alertes.col.severity") }}</th>
                  <th>{{ t()("qualite.alertes.col.status") }}</th>
                  <th class="text-right">{{ t()("organisations.col.actions") }}</th>
                </tr>
              </thead>
              <tbody>
                @for (alert of pager.items(); track alert.id) {
                  <tr [class.row-link]="canDecide()" (click)="canDecide() && toggle(alert.id)">
                    <td (click)="$event.stopPropagation()">
                      @if (canDecide()) {
                        <input
                          type="checkbox"
                          [checked]="selected().includes(alert.id)"
                          [attr.aria-label]="t()('qualite.alertes.selectOne', { type: alert.type })"
                          (change)="toggle(alert.id)"
                        />
                      }
                    </td>
                    <td>
                      <span class="block font-bold">{{ alert.type }}</span>
                      <span class="sub block max-w-[320px] truncate" [title]="alert.detail">{{
                        alert.detail
                      }}</span>
                    </td>
                    <td>
                      <span class="block font-semibold">{{ entityName(alert) }}</span>
                      <span class="sub block">{{
                        t()(
                          alert.entity === "producteur"
                            ? "qualite.alertes.entity.producteur"
                            : "qualite.alertes.entity.parcelle"
                        )
                      }}</span>
                    </td>
                    <td class="font-medium">{{ alert.enumerator }}</td>
                    <td>
                      <span
                        class="badge"
                        [style.background]="sev[alert.severity].bg"
                        [style.color]="sev[alert.severity].fg"
                        >{{ t()(sev[alert.severity].label) }}</span
                      >
                    </td>
                    <td>
                      <span
                        class="badge"
                        [style.background]="stat[alert.status].bg"
                        [style.color]="stat[alert.status].fg"
                        >{{ t()(stat[alert.status].label) }}</span
                      >
                    </td>
                    <td (click)="$event.stopPropagation()">
                      <span class="flex justify-end gap-2">
                        @if (
                          canDecide() &&
                          (alert.status === "ouvert" || alert.status === "en vérification")
                        ) {
                          <button
                            type="button"
                            class="act act-ok"
                            [title]="t()('qualite.alertes.resolve')"
                            [attr.aria-label]="t()('qualite.alertes.resolve')"
                            (click)="openDecision([alert.id], 'résolu')"
                          >
                            <ui-icon name="check" [size]="18" />
                          </button>
                          <button
                            type="button"
                            class="act act-danger"
                            [title]="t()('qualite.alertes.reject')"
                            [attr.aria-label]="t()('qualite.alertes.reject')"
                            (click)="openDecision([alert.id], 'rejeté')"
                          >
                            <ui-icon name="close" [size]="18" />
                          </button>
                        }
                        @if (ownerOf(alert); as producerId) {
                          <a
                            class="act"
                            [routerLink]="['/dashboard/producteurs', producerId]"
                            [title]="t()('qualite.v2.alertes.open')"
                            [attr.aria-label]="t()('qualite.v2.alertes.open')"
                            ><ui-icon name="visibility" [size]="18"
                          /></a>
                        }
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
              ><ui-icon name="task_alt" [size]="26"
            /></span>
            <p class="text-[16px] font-extrabold">{{ t()("qualite.alertes.empty") }}</p>
          </div>
        }
      </section>

      } @else {
        <!-- Mode API : alertes rouges « CNI proches : à vérifier », enregistrées sur le serveur -->
        @if (cniAlerts.canView()) {
          <section class="card mt-6 overflow-hidden" aria-labelledby="cni-alerts-title">
            <div class="cni-head p-5">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <h2 id="cni-alerts-title" class="flex items-center gap-2 text-[20px] font-extrabold">
                  <span class="cni-dot" aria-hidden="true"><ui-icon name="warning" [size]="18" /></span>{{ t()("cni.page.title") }}
                </h2>
                <div class="flex flex-wrap items-center gap-2">
                  <ui-select
                    class="min-w-[180px]"
                    variant="compact"
                    leadingIcon="warning"
                    [label]="t()('cni.filter.kind')"
                    [options]="cniKindOptions()"
                    [value]="cniKind()"
                    (valueChange)="cniKind.set($any($event))"
                  />
                  <ui-select
                    class="min-w-[180px]"
                    variant="compact"
                    leadingIcon="fact_check"
                    [label]="t()('cni.filter.status')"
                    [options]="cniStatusOptions()"
                    [value]="cniStatus()"
                    (valueChange)="cniStatus.set($any($event))"
                  />
                  @if (canDetect()) {
                    <button type="button" class="btn btn-ghost" [disabled]="cniBusy()" (click)="runDetection()">
                      <ui-icon name="refresh" [size]="18" />{{ t()("cni.action.detect") }}
                    </button>
                  }
                </div>
              </div>
              @if (cniKind() !== "cni_format_inhabituel") {
                <p class="cni-explain mt-3">{{ t()("cni.explain.body") }}</p>
              }
              @if (cniKind() !== "cni_proches") {
                <p class="cni-explain mt-3">{{ t()("cni.format.message") }}</p>
              }
              <p class="sub mt-3" aria-live="polite">
                {{ t()("cni.page.stat", { open: nf.format(cniOpen()), high: nf.format(cniOpenHigh()) }) }}
              </p>
            </div>
            @if (cniFailed()) {
              <div class="flex flex-col items-center gap-3 p-10 text-center">
                <p class="max-w-md text-[16px] font-extrabold">{{ t()("cni.page.loadError") }}</p>
                <button type="button" class="btn btn-ghost" (click)="loadCniAlerts()">{{ t()("cni.page.retry") }}</button>
              </div>
            } @else if (cniRows().length) {
              <div class="overflow-x-auto">
                <table class="tbl min-w-[900px]">
                  <thead>
                    <tr>
                      <th>{{ t()("cni.col.fiches") }}</th>
                      <th>{{ t()("cni.col.scoop") }}</th>
                      <th>{{ t()("cni.col.reason") }}</th>
                      <th>{{ t()("cni.col.status") }}</th>
                      <th>{{ t()("cni.col.detected") }}</th>
                      <th class="text-right">{{ t()("organisations.col.actions") }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (alert of cniPager.items(); track alert.id) {
                      <tr>
                        <td>
                          <span class="flex flex-wrap items-center gap-2">
                            <a class="code font-bold underline" [routerLink]="['/dashboard/producteurs', alert.producerId]">{{
                              alert.producerCode ?? alert.producerId
                            }}</a>
                            @if (alert.kind === "cni_proches") {
                              <ui-icon name="arrow_forward" [size]="14" />
                              @if (alert.otherProducerId) {
                                <a class="code font-bold underline" [routerLink]="['/dashboard/producteurs', alert.otherProducerId]">{{
                                  alert.otherProducerCode ?? alert.otherProducerId
                                }}</a>
                              } @else {
                                <span class="sub">{{ t()("cni.otherHidden") }}</span>
                              }
                            }
                          </span>
                          @if (alert.kind === "cni_proches") {
                            <span class="cni-pill mt-1"><ui-icon name="warning" [size]="12" />{{ t()("cni.badge") }}</span>
                          } @else {
                            <span class="cni-pill format mt-1"><ui-icon name="info" [size]="12" />{{ t()("cni.format.badge") }}</span>
                          }
                        </td>
                        <td class="font-medium">{{ scoopName(alert.scoopId) }}</td>
                        <td class="font-medium">{{ t()(reasonKey(alert)) }}</td>
                        <td>
                          <span
                            class="badge"
                            [style.background]="cniStatusTone[alert.status].bg"
                            [style.color]="cniStatusTone[alert.status].fg"
                            >{{ t()(cniStatusLabel[alert.status]) }}</span
                          >
                        </td>
                        <td class="font-medium tabular-nums">{{ date(alert.detectedAt) }}</td>
                        <td>
                          <span class="flex justify-end gap-2">
                            @if (alert.status === "ouverte") {
                              @if (canContact()) {
                                <button
                                  type="button"
                                  class="act"
                                  [title]="t()('cni.action.ask')"
                                  [attr.aria-label]="t()('cni.action.ask')"
                                  (click)="askAboutCni(alert)"
                                >
                                  <ui-icon name="mail" [size]="18" />
                                </button>
                              }
                              <button
                                type="button"
                                class="act act-ok"
                                [title]="t()('cni.action.resolve')"
                                [attr.aria-label]="t()('cni.action.resolve')"
                                (click)="cniResolving.set(alert)"
                              >
                                <ui-icon name="check" [size]="18" />
                              </button>
                            }
                          </span>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <ui-pagination class="px-5 pb-5" [pager]="cniPager" />
            } @else {
              <div class="flex flex-col items-center gap-3 p-10 text-center">
                <span
                  class="grid size-14 place-items-center rounded-[16px]"
                  style="background: var(--v2-sauge); color: var(--v2-foret)"
                  ><ui-icon name="task_alt" [size]="26"
                /></span>
                <p class="max-w-md text-[16px] font-extrabold">{{ t()("cni.page.empty") }}</p>
              </div>
            }
          </section>
          <app-cni-resolve-modal [alert]="cniResolving()" (closed)="cniResolving.set(null)" (resolved)="afterCniResolved()" />
        }

        <!-- Points signalés par le CRADESC à l'import Kobo (données réelles) -->
        <div class="toolbar card mt-6">
          <label class="search">
            <ui-icon name="search" [size]="20" />
            <input
              type="search"
              [placeholder]="t()('qualite.real.search')"
              [attr.aria-label]="t()('qualite.real.search')"
              [value]="q()"
              (input)="q.set($any($event.target).value)"
            />
          </label>
          <ui-select
            class="min-w-[200px]"
            variant="compact"
            leadingIcon="storefront"
            [label]="t()('qualite.real.filter.scoop')"
            [options]="scoopOptions()"
            [value]="scoopFilter()"
            (valueChange)="scoopFilter.set($event)"
          />
          <ui-select
            class="min-w-[180px]"
            variant="compact"
            leadingIcon="warning"
            [label]="t()('qualite.real.filter.kind')"
            [options]="kindOptions()"
            [value]="kindFilter()"
            (valueChange)="kindFilter.set($event)"
          />
          <ui-select
            class="min-w-[200px]"
            variant="compact"
            leadingIcon="verified"
            [label]="t()('qualite.real.filter.quality')"
            [options]="qualityOptions()"
            [value]="qualityFilter()"
            (valueChange)="qualityFilter.set($event)"
          />
        </div>

        <p class="sub mt-4" aria-live="polite">
          {{ t()("qualite.real.count", { count: nf.format(realRows().length) }) }}
        </p>

        <section class="card mt-3 overflow-hidden">
          @if (realRows().length) {
            <div class="overflow-x-auto">
              <table class="tbl min-w-[1040px]">
                <thead>
                  <tr>
                    <th>{{ t()("qualite.real.col.producer") }}</th>
                    <th>{{ t()("qualite.real.col.scoop") }}</th>
                    <th>{{ t()("qualite.source.col") }}</th>
                    <th>{{ t()("qualite.real.col.where") }}</th>
                    <th>{{ t()("qualite.real.col.point") }}</th>
                    <th class="text-right">{{ t()("organisations.col.actions") }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (point of realPager.items(); track point.id) {
                    <tr>
                      <td>
                        <span class="block font-bold">{{ point.producerName }}</span>
                        <span class="sub block">{{ point.producerCode }}</span>
                      </td>
                      <td class="font-medium">{{ scoopName(point.scoopId) }}</td>
                      <td>
                        @if (sourceOfPoint(point); as source) {
                          <span
                            class="badge"
                            [style.background]="source.bg"
                            [style.color]="source.fg"
                            [title]="sourceDetail(source)"
                            ><ui-icon [name]="source.icon" [size]="14" />{{ t()(source.labelKey) }}</span
                          >
                        }
                      </td>
                      <td>
                        <span
                          class="badge"
                          [style.background]="kindTone[point.kind].bg"
                          [style.color]="kindTone[point.kind].fg"
                          >{{ t()(kindLabel[point.kind]) }}</span
                        >
                        @if (point.place) {
                          <span class="sub block">{{ point.place }}</span>
                        }
                      </td>
                      <td>
                        <span class="block max-w-[460px] font-bold">{{
                          point.text || t()("qualite.real.noReason")
                        }}</span>
                        @if (explanation(point.text); as why) {
                          <span class="sub block max-w-[460px]">{{ t()(why) }}</span>
                        }
                      </td>
                      <td>
                        <span class="flex justify-end gap-2">
                          @if (canContact()) {
                            <button
                              type="button"
                              class="act"
                              [title]="t()('demandes.action')"
                              [attr.aria-label]="t()('demandes.action')"
                              (click)="openContact(point)"
                            >
                              <ui-icon name="mail" [size]="18" />
                            </button>
                          }
                          <a
                            class="act"
                            [routerLink]="['/dashboard/producteurs', point.producerId]"
                            [title]="t()('qualite.v2.alertes.open')"
                            [attr.aria-label]="t()('qualite.v2.alertes.open')"
                            ><ui-icon name="visibility" [size]="18"
                          /></a>
                        </span>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <ui-pagination class="px-5 pb-5" [pager]="realPager" />
          } @else {
            <div class="flex flex-col items-center gap-3 p-10 text-center">
              <span
                class="grid size-14 place-items-center rounded-[16px]"
                style="background: var(--v2-sauge); color: var(--v2-foret)"
                ><ui-icon name="task_alt" [size]="26"
              /></span>
              <p class="max-w-md text-[16px] font-extrabold">
                {{ t()(realPoints().length ? "qualite.real.emptyFilter" : "qualite.real.empty") }}
              </p>
            </div>
          }
        </section>
      }

      <!-- Contacter la coopérative (mode API, administrateur CRADESC) -->
      <ui-contact-scoop-modal
        [open]="contactTargets().length > 0"
        [kind]="contactKind()"
        [targets]="contactTargets()"
        link="/dashboard/qualite/alertes"
        (closed)="contactTargets.set([])"
      />

      <!-- Actions groupées -->
      @if (selected().length) {
        <div
          class="bulk mt-4"
          role="region"
          [attr.aria-label]="t()('qualite.alertes.selected', { n: selected().length })"
        >
          <span class="flex-1 text-[14px] font-extrabold">{{
            t()("qualite.alertes.selected", { n: selected().length })
          }}</span>
          <button type="button" class="b" style="color: var(--v2-blanc)" (click)="selected.set([])">
            {{ t()("qualite.alertes.deselect") }}
          </button>
          <button
            type="button"
            class="b"
            style="background: var(--v2-info-bg); color: var(--v2-info-fg)"
            (click)="openDecision(selected(), 'en vérification')"
          >
            <ui-icon name="visibility" [size]="16" />{{ t()("qualite.alertes.verifyShort") }}
          </button>
          <button
            type="button"
            class="b"
            style="background: var(--v2-erreur-bg); color: var(--v2-erreur-fg)"
            (click)="openDecision(selected(), 'rejeté')"
          >
            <ui-icon name="close" [size]="16" />{{ t()("qualite.alertes.reject") }}
          </button>
          <button
            type="button"
            class="b"
            style="background: var(--v2-citron); color: var(--v2-foret)"
            (click)="openDecision(selected(), 'résolu')"
          >
            <ui-icon name="check" [size]="16" />{{ t()("qualite.alertes.resolve") }}
          </button>
        </div>
      }

      <!-- Décision -->
      @if (pending(); as decision) {
        <ui-modal
          [tone]="decision.status === 'rejeté' ? 'danger' : 'default'"
          [open]="true"
          [title]="
            t()('qualite.alertes.dialog.title', {
              n: decision.ids.length,
              status: t()(stat[decision.status].label),
            })
          "
          [description]="t()('qualite.alertes.dialog.description')"
          icon="fact_check"
          [width]="580"
          [closeLabel]="t()('common.close')"
          (closed)="pending.set(null)"
        >
          <ul
            class="mb-4 max-h-48 overflow-y-auto rounded-[16px] border"
            style="border-color: var(--v2-bord-carte)"
          >
            @for (alert of pendingAlerts(); track alert.id) {
              <li
                class="flex items-center justify-between gap-3 border-t px-4 py-2.5 text-[14px] first:border-t-0"
                style="border-color: var(--v2-separateur)"
              >
                <span class="min-w-0 truncate font-bold"
                  >{{ alert.type }} · {{ entityName(alert) }}</span
                >
                <span
                  class="badge"
                  [style.background]="sev[alert.severity].bg"
                  [style.color]="sev[alert.severity].fg"
                  >{{ t()(sev[alert.severity].label) }}</span
                >
              </li>
            }
          </ul>
          <label class="lbl" for="alert-comment">{{ t()("qualite.common.comment") }}</label>
          <textarea
            id="alert-comment"
            class="area mb-5 mt-2"
            [placeholder]="t()('qualite.alertes.dialog.commentPlaceholder')"
            [value]="comment()"
            (input)="comment.set($any($event.target).value)"
          ></textarea>
          <button modal-footer type="button" class="btn btn-ghost" (click)="pending.set(null)">
            {{ t()("common.cancel") }}
          </button>
          <button
            modal-footer
            type="button"
            class="btn"
            [class.btn-danger]="decision.status === 'rejeté'"
            [class.btn-primary]="decision.status !== 'rejeté'"
            (click)="confirmDecision()"
          >
            {{ t()("qualite.alertes.dialog.submit") }}
            @if (decision.status !== "rejeté") {
              <span class="btn-chip"><ui-icon name="check" [size]="18" /></span>
            }
          </button>
        </ui-modal>
      }
    </app-shell>
  `,
})
export default class QualiteAlertesPage {
  protected readonly store = inject(StoreService);
  protected readonly locale = inject(LocaleService);
  private readonly snackbar = inject(SnackbarService);
  protected readonly t = this.locale.t;
  protected readonly nf = nf;
  protected readonly stat = STATUS;
  protected readonly sev = SEVERITY;
  protected readonly q = signal("");
  protected readonly status = signal<AlertStatus | "__all">("ouvert");
  protected readonly severity = signal("");
  protected readonly selected = signal<string[]>([]);
  protected readonly comment = signal("");
  protected readonly pending = signal<{ ids: string[]; status: AlertStatus } | null>(null);

  /** Mode API : liste réelle des points signalés à l'import (jamais de donnée de démonstration). */
  protected readonly apiMode = isApiMode();
  protected readonly scoopFilter = signal("");

  // ── Alertes rouges « CNI proches : à vérifier » : lues sur le serveur, jamais calculées ici ──
  protected readonly pagePerms: readonly Permission[] = ["alert.manage", "quality.review"];
  protected readonly cniAlerts = inject(CniAlertsService);
  protected readonly cniItems = signal<QualityAlertDto[]>([]);
  protected readonly cniOpen = signal(0);
  protected readonly cniOpenHigh = signal(0);
  protected readonly cniFailed = signal(false);
  protected readonly cniBusy = signal(false);
  protected readonly cniStatus = signal<QualityAlertStatus | "">("ouverte");
  protected readonly cniKind = signal<QualityAlertKind | "">("");
  protected readonly cniKindOptions = computed<SelectOption[]>(() => [
    { value: "", label: this.t()("cni.kind.all") },
    ...QUALITY_ALERT_KINDS.map((kind) => ({ value: kind, label: this.t()(`cni.kind.${kind}` as MessageKey) })),
  ]);
  protected readonly cniResolving = signal<QualityAlertDto | null>(null);
  protected readonly cniStatusLabel: Record<QualityAlertStatus, MessageKey> = {
    ouverte: "cni.status.ouverte",
    résolue: "cni.status.résolue",
    obsolète: "cni.status.obsolète",
  };
  protected readonly cniStatusTone: Record<QualityAlertStatus, { bg: string; fg: string }> = {
    ouverte: TONE.erreur,
    résolue: TONE.succes,
    obsolète: TONE.neutre,
  };
  protected readonly cniStatusOptions = computed<SelectOption[]>(() => [
    { value: "", label: this.t()("cni.status.all") },
    ...(["ouverte", "résolue", "obsolète"] as const).map((status) => ({
      value: status,
      label: this.t()(this.cniStatusLabel[status]),
    })),
  ]);
  protected readonly cniRows = computed(() => {
    const status = this.cniStatus();
    const kind = this.cniKind();
    return this.cniItems().filter((alert) => (!status || alert.status === status) && (!kind || alert.kind === kind));
  });
  protected readonly cniPager = createPager(() => this.cniRows());
  /** La détection compare toutes les coopératives : droit `quality.review` (le serveur exige en plus le périmètre complet). */
  protected readonly canDetect = computed(() => this.store.can("quality.review"));
  protected readonly date = fmtDate;

  private readonly _loadCni = effect(() => {
    if (this.apiMode && this.cniAlerts.canView()) untracked(() => void this.loadCniAlerts());
  });

  protected reasonKey(alert: QualityAlertDto): MessageKey {
    return ALERT_REASON_KEY[alert.reason];
  }

  protected async loadCniAlerts(): Promise<void> {
    try {
      const page = await listQualityAlerts({ limit: 1 });
      this.cniOpen.set(page.open);
      this.cniOpenHigh.set(page.openHigh);
      this.cniItems.set(await fetchAllPages<QualityAlertDto>((query) => listQualityAlerts(query)));
      this.cniFailed.set(false);
    } catch {
      this.cniItems.set([]);
      this.cniFailed.set(true);
    }
  }

  protected afterCniResolved(): void {
    void this.loadCniAlerts();
    void this.cniAlerts.refresh();
  }

  protected async runDetection(): Promise<void> {
    if (this.cniBusy()) return;
    this.cniBusy.set(true);
    try {
      const result = await detectCloseCni();
      this.snackbar.success(
        result.format
          ? this.t()("cni.detect.doneFormat", { created: result.created, formatCreated: result.format.created })
          : this.t()("cni.detect.done", { created: result.created, reopened: result.reopened, obsolete: result.obsolete }),
      );
      await this.loadCniAlerts();
      await this.cniAlerts.refresh();
    } catch (error) {
      this.snackbar.error(this.t()(alertErrorKey(error)));
    } finally {
      this.cniBusy.set(false);
    }
  }

  /** Demande type « CNI proches à vérifier » à la coopérative (permission `coop_request.send`). Codes de fiche seulement. */
  protected askAboutCni(alert: QualityAlertDto): void {
    const code = alert.producerCode ?? alert.producerId;
    if (alert.kind === "cni_format_inhabituel") {
      this.contactKind.set("fiche");
      this.contactTargets.set([
        {
          scoopId: alert.scoopId,
          items: [{ type: "producer", id: alert.producerId, label: code }],
          subject: this.t()("cni.format.ask.subject", { code }),
          message: this.t()("cni.format.ask.message", { code }),
        },
      ]);
      return;
    }
    const other = alert.otherProducerCode;
    const items: CoopRequestTarget["items"] = [{ type: "producer", id: alert.producerId, label: code }];
    if (alert.otherProducerId && alert.otherScoopId === alert.scoopId)
      items.push({ type: "producer", id: alert.otherProducerId, label: other ?? alert.otherProducerId });
    this.contactKind.set("cni_proches");
    this.contactTargets.set([
      {
        scoopId: alert.scoopId,
        items,
        subject: this.t()("cni.ask.subject", { code }),
        message: other
          ? this.t()("cni.ask.message", { code, other })
          : this.t()("cni.ask.messageOne", { code }),
      },
    ]);
  }
  protected readonly kindFilter = signal("");
  protected readonly qualityFilter = signal("");
  protected readonly kindLabel: Record<QualityPointKind, MessageKey> = {
    fiche: "qualite.real.kind.fiche",
    parcelle: "qualite.real.kind.parcelle",
    culture: "qualite.real.kind.culture",
  };
  protected readonly kindTone: Record<QualityPointKind, { bg: string; fg: string }> = {
    fiche: TONE.info,
    parcelle: TONE.attente,
    culture: TONE.culture,
  };

  protected readonly realPoints = computed<QualityPoint[]>(() =>
    this.apiMode ? collectQualityPoints(this.store.state()) : [],
  );

  protected readonly realRows = computed(() => {
    const needle = norm(this.q().trim());
    const scoop = this.scoopFilter();
    const kind = this.kindFilter();
    const quality = this.qualityFilter();
    return this.realPoints().filter(
      (point) =>
        (!scoop || point.scoopId === scoop) &&
        (!kind || point.kind === kind) &&
        (!quality || point.quality === quality) &&
        (!needle ||
          norm(
            `${point.producerName} ${point.producerCode} ${point.place} ${point.text} ${this.scoopName(point.scoopId)}`,
          ).includes(needle)),
    );
  });

  protected readonly realPager = createPager(() => this.realRows());

  /** Base d'origine de la fiche du point signalé (Kobo apurée ou saisie dans l'application). */
  private readonly producersById = computed(
    () => new Map(this.store.state().producers.map((producer) => [producer.id, producer])),
  );

  protected sourceOfPoint(point: QualityPoint): DataSource | null {
    const producer = this.producersById().get(point.producerId);
    return producer ? sourceOfProducer(producer) : null;
  }

  protected sourceDetail(source: DataSource): string {
    return describeSource(source, this.t());
  }

  protected readonly canContact = computed(() => this.apiMode && this.store.can("coop_request.send"));
  protected readonly contactTargets = signal<CoopRequestTarget[]>([]);
  protected readonly contactKind = signal<CoopRequestKind>("alerte");

  /**
   * Demande à la coopérative du producteur de la ligne : tous ses points signalés (fiche, parcelles, cultures)
   * partent ensemble, en langage simple. Fiche seule : demande « fiche à vérifier » ; sinon « alerte ».
   */
  protected openContact(point: QualityPoint) {
    const all = this.realPoints().filter((candidate) => candidate.producerId === point.producerId);
    const onlySheet = all.every((candidate) => candidate.kind === "fiche");
    const input = {
      code: point.producerCode,
      name: point.producerName,
      points: all.map((candidate) => ({ text: candidate.text, place: candidate.place })),
    };
    this.contactKind.set(onlySheet ? "fiche" : "alerte");
    this.contactTargets.set([
      {
        scoopId: point.scoopId,
        items: [{ type: "producer", id: point.producerId, label: `${point.producerName} (${point.producerCode})` }],
        ...(onlySheet ? sheetDraft(input) : alertDraft(input)),
      },
    ]);
  }

  protected readonly scoopOptions = computed<SelectOption[]>(() => {
    const ids = new Set(this.realPoints().map((point) => point.scoopId));
    return [
      { value: "", label: this.t()("qualite.real.filter.scoopAll") },
      ...this.store
        .state()
        .scoops.filter((scoop) => ids.has(scoop.id))
        .map((scoop) => ({ value: scoop.id, label: scoop.name })),
    ];
  });

  protected readonly kindOptions = computed<SelectOption[]>(() => [
    { value: "", label: this.t()("qualite.real.filter.kindAll") },
    ...(["fiche", "parcelle", "culture"] as const).map((kind) => ({
      value: kind,
      label: this.t()(this.kindLabel[kind]),
    })),
  ]);

  protected readonly qualityOptions = computed<SelectOption[]>(() => [
    { value: "", label: this.t()("qualite.real.filter.qualityAll") },
    { value: "validé", label: this.t()("dashboard.quality.validated") },
    { value: "à vérifier", label: this.t()("dashboard.quality.toVerify") },
    { value: "doublon", label: this.t()("dashboard.quality.duplicate") },
    { value: "invalide", label: this.t()("dashboard.quality.invalid") },
  ]);

  private readonly realStats = computed<StatCard[]>(() => {
    const t = this.t();
    const points = this.realPoints();
    const count = (kind: QualityPointKind) => points.filter((point) => point.kind === kind).length;
    return [
      {
        label: t("qualite.real.stat.total"),
        value: nf.format(points.length),
        sub: t("qualite.real.stat.totalSub", {
          count: nf.format(new Set(points.map((point) => point.producerId)).size),
        }),
        icon: "warning",
        bg: "",
        fg: "",
      },
      {
        label: t("qualite.real.stat.fiche"),
        value: nf.format(count("fiche")),
        sub: t("qualite.real.stat.ficheSub"),
        icon: "badge",
        ...TONE.info,
      },
      {
        label: t("qualite.real.stat.parcelle"),
        value: nf.format(count("parcelle")),
        sub: t("qualite.real.stat.parcelleSub"),
        icon: "map",
        ...TONE.attente,
      },
      {
        label: t("qualite.real.stat.culture"),
        value: nf.format(count("culture")),
        sub: t("qualite.real.stat.cultureSub"),
        icon: "agriculture",
        ...TONE.culture,
      },
    ];
  });

  protected scoopName(id: string): string {
    return this.store.state().scoops.find((scoop) => scoop.id === id)?.name ?? "—";
  }

  protected explanation(text: string): MessageKey | null {
    return explainAlert(text);
  }

  protected readonly canDecide = computed(() => this.store.can("alert.manage"));

  /** Alertes du périmètre (producteurs et parcelles de la session). */
  private readonly mine = computed(() => {
    const s = this.store.state();
    const prod = new Set(inScope(s.producers, s.session).map((p) => p.id));
    const plots = new Set(s.plots.filter((p) => prod.has(p.producerId)).map((p) => p.id));
    return s.alerts.filter((a) => prod.has(a.entityId) || plots.has(a.entityId));
  });

  private readonly names = computed(() => {
    const s = this.store.state();
    return {
      producer: new Map(s.producers.map((p) => [p.id, `${p.firstName} ${p.lastName}`])),
      plot: new Map(s.plots.map((p) => [p.id, { code: p.code, owner: p.producerId }])),
    };
  });

  /** Recherche et sévérité, avant le filtre d'état (pour les compteurs). */
  private readonly base = computed(() => {
    const needle = norm(this.q().trim());
    const sev = this.severity();
    return this.mine().filter(
      (a) =>
        (!sev || a.severity === sev) &&
        (!needle ||
          norm(`${a.type} ${a.detail} ${a.enumerator} ${this.entityName(a)}`).includes(needle)),
    );
  });

  protected readonly statusButtons = computed(() => {
    const t = this.t();
    const base = this.base();
    return [
      ...STATUSES.map((st) => ({
        id: st as AlertStatus | "__all",
        label: t(STATUS[st].tab),
        count: base.filter((a) => a.status === st).length,
      })),
      { id: "__all" as const, label: t("qualite.common.all"), count: base.length },
    ];
  });

  protected readonly severityOptions = computed<SelectOption[]>(() => [
    { value: "", label: this.t()("qualite.v2.alertes.severityAll") },
    ...(["élevée", "moyenne", "faible"] as const).map((s) => ({
      value: s,
      label: this.t()(SEVERITY[s].label),
    })),
  ]);

  protected readonly rows = computed(() => {
    const st = this.status();
    return this.base()
      .filter((a) => st === "__all" || a.status === st)
      .sort((a, b) => RANK[a.severity] - RANK[b.severity] || a.id.localeCompare(b.id));
  });

  /** Pagination : mêmes règles que l'API (`GET /v1/quality/alerts?page=&limit=`). */
  protected readonly pager = createPager(() => this.rows());

  protected readonly stats = computed<StatCard[]>(() =>
    this.apiMode ? this.realStats() : this.demoStats(),
  );

  private readonly demoStats = computed<StatCard[]>(() => {
    const t = this.t();
    const all = this.mine();
    const n = (st: AlertStatus) => all.filter((a) => a.status === st).length;
    const open = all.filter((a) => a.status === "ouvert");
    const types = new Map<string, number>();
    for (const a of open) types.set(a.type, (types.get(a.type) ?? 0) + 1);
    const top = [...types].sort((a, b) => b[1] - a[1])[0];
    return [
      {
        label: t("qualite.v2.alertes.stat.open"),
        value: nf.format(open.length),
        sub: t("qualite.v2.alertes.stat.openSub", {
          count: open.filter((a) => a.severity === "élevée").length,
        }),
        icon: "warning",
        bg: "",
        fg: "",
      },
      {
        label: t("qualite.v2.alertes.stat.verify"),
        value: nf.format(n("en vérification")),
        sub: t("qualite.v2.alertes.stat.verifySub"),
        icon: "visibility",
        ...TONE.info,
      },
      {
        label: t("qualite.v2.alertes.stat.resolved"),
        value: nf.format(n("résolu")),
        sub: t("qualite.v2.alertes.stat.resolvedSub", { count: n("rejeté") }),
        icon: "task_alt",
        ...TONE.succes,
      },
      {
        label: t("qualite.v2.alertes.stat.top"),
        value: top ? nf.format(top[1]) : "—",
        sub: top?.[0] ?? "—",
        icon: "analytics",
        ...TONE.attente,
      },
    ];
  });

  protected entityName(a: DataAlert): string {
    const n = this.names();
    if (a.entity === "producteur") return n.producer.get(a.entityId) ?? a.entityId;
    const pl = n.plot.get(a.entityId);
    return pl ? `${pl.code} · ${n.producer.get(pl.owner) ?? ""}` : a.entityId;
  }

  /** Producteur à ouvrir : la personne, ou le propriétaire de la parcelle. */
  protected ownerOf(a: DataAlert): string | null {
    if (a.entity === "producteur") return a.entityId;
    return this.names().plot.get(a.entityId)?.owner ?? null;
  }

  protected readonly allPageSelected = computed(() => {
    const ids = this.pager.items().map((a) => a.id);
    return ids.length > 0 && ids.every((id) => this.selected().includes(id));
  });

  protected toggle(id: string): void {
    this.selected.update((list) =>
      list.includes(id) ? list.filter((x) => x !== id) : [...list, id],
    );
  }

  protected togglePage(on: boolean): void {
    const ids = this.pager.items().map((a) => a.id);
    this.selected.update((list) =>
      on ? [...new Set([...list, ...ids])] : list.filter((x) => !ids.includes(x)),
    );
  }

  protected readonly pendingAlerts = computed(() => {
    const p = this.pending();
    return p ? this.mine().filter((a) => p.ids.includes(a.id)) : [];
  });

  protected openDecision(ids: string[], status: AlertStatus): void {
    this.comment.set("");
    this.pending.set({ ids: [...ids], status });
  }

  protected confirmDecision(): void {
    const p = this.pending();
    if (!p) return;
    try {
      this.store.actions.updateAlerts(p.ids, p.status, this.comment().trim());
    } catch (e) {
      this.snackbar.error(e instanceof AccessDeniedError ? this.locale.tNow(e.key) : String(e));
      return;
    }
    this.pending.set(null);
    this.selected.update((list) => list.filter((id) => !p.ids.includes(id)));
    this.snackbar.success(this.t()("qualite.alertes.dialog.updated", { n: p.ids.length }));
  }
}
