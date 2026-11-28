import { Component, computed, effect, inject, signal, untracked } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { map } from "rxjs";

import { isApiMode } from "@/lib/api/config";
import { describeSource, describeSourcePlace, sourceOfGroup, sourceOfProducer, type DataSource } from "@/lib/data-source";
import { compareProducers, correctProducerOnApi, producerApiMessage, type ProducerCorrection, type StrictComparison } from "@/lib/api/producers";
import { duplicateDraft, groupByScoop, producerItem } from "@/lib/coop-request-templates";
import { fmtAge, fmtDate, maskCni, nf, nf1 } from "@/lib/format";
import type { MessageKey } from "@/lib/i18n";
import type { Plot, Producer } from "@/lib/mock/data";
import { buildCompareRow, closePlotPairs, similarityReasons, type SimilarityReason } from "@/lib/producer-compare";
import { producerAlertTexts, type DuplicateGroup } from "@/lib/quality-real";
import { inScope } from "@/lib/scope";
import { AppShellComponent } from "@shared/app-shell.component";
import { ContactScoopModalComponent, type CoopRequestTarget } from "@shared/contact-scoop-modal.component";
import { LocaleService } from "@shared/locale.service";
import { MergeProducersModalComponent } from "@shared/merge-producers-modal.component";
import { PlacementBadgeComponent } from "@shared/placement-badge.component";
import { PlotMapComponent } from "@shared/plot-map.component";
import { StoreService } from "@shared/store.service";
import { IconComponent, initialsOf, SelectComponent, SnackbarService, TONE, V2_PAGE_STYLES, type SelectOption } from "@shared/ui";

/** Nombre maximal de fiches comparées côte à côte. */
const MAX_COMPARED = 4;
const LETTERS = ["A", "B", "C", "D"];
/** Une couleur par fiche, sur la carte comme sur les cartes (jetons de la charte). */
const SHEET_COLORS = ["--v2-foret", "--v2-info-fg", "--v2-attente-fg", "--v2-erreur-fg"];

const REASON_LABEL: Record<SimilarityReason, MessageKey> = {
  name: "qualite.compare.reason.name",
  phone: "qualite.compare.reason.phone",
};

const QUALITY_LABEL: Record<Producer["quality"], MessageKey> = {
  validé: "producteurs.quality.validé",
  "à vérifier": "producteurs.quality.à vérifier",
  doublon: "producteurs.quality.doublon",
  invalide: "producteurs.quality.invalide",
};

const STATUS_LABEL: Record<Producer["status"], MessageKey> = {
  recensé: "producteurs.status.recensé",
  membre: "producteurs.status.membre",
};

const QUALITY_TONE: Record<Producer["quality"], { bg: string; fg: string }> = {
  validé: TONE.succes,
  "à vérifier": TONE.attente,
  doublon: TONE.culture,
  invalide: TONE.erreur,
};

interface Sheet {
  producer: Producer;
  letter: string;
  color: string;
  plots: Plot[];
  alerts: string[];
  plotAlerts: { place: string; text: string }[];
}

/** Résultat de la comparaison stricte d'une paire de fiches (`GET /producers/:keepId/compare`). */
type PairResult = { firstId: string; secondId: string; result: StrictComparison };

/** `loading` : en cours ; `error` : le serveur n'a pas répondu (la fusion reste bloquée) ; `done` : toutes les paires sont connues. */
type CompareState = "idle" | "loading" | "error" | "done";

/** `different` : le serveur dit que le champ diffère ; `same` : il ne diffère pas ; `info` : information non comparée. */
type RowState = "same" | "different" | "info";

interface StrictRow {
  label: string;
  values: string[];
  state: RowState;
}

/** Champs d'une fiche que `PATCH /producers/:id` sait corriger (la CNI, la coopérative et les parcelles n'en font pas partie). */
type FixField = "firstName" | "lastName" | "sex" | "age" | "phone" | "village" | "status" | "handicap" | "orgId";
const FIX_FIELDS: readonly FixField[] = ["firstName", "lastName", "sex", "age", "phone", "village", "status", "handicap", "orgId"];
const FIX_LABEL: Record<FixField, MessageKey> = {
  firstName: "qualite.strict.field.firstName",
  lastName: "qualite.strict.field.lastName",
  sex: "qualite.strict.field.sex",
  age: "qualite.strict.field.age",
  phone: "qualite.strict.field.phone",
  village: "qualite.strict.field.village",
  status: "qualite.strict.field.status",
  handicap: "qualite.strict.field.handicap",
  orgId: "qualite.strict.field.orgId",
};

/**
 * Comparer les fiches (mode API) : fiches d'un groupe de doublons côte à côte, tableau champ par champ
 * (identique / différent), parcelles sur la carte, points signalés, puis décision (fusion ou non).
 * Route : `/dashboard/qualite/doublons/comparer?fiches=CODE1,CODE2[,CODE3]`.
 */
@Component({
  selector: "app-qualite-doublons-comparer-page",
  imports: [
    AppShellComponent,
    ContactScoopModalComponent,
    IconComponent,
    MergeProducersModalComponent,
    PlacementBadgeComponent,
    PlotMapComponent,
    RouterLink,
    SelectComponent,
  ],
  styles: [
    V2_PAGE_STYLES,
    `
      .stack {
        display: grid;
        gap: 16px;
      }
      .verdict {
        display: flex;
        gap: 14px;
        align-items: flex-start;
        border-radius: 22px;
        padding: 18px 22px;
      }
      .verdict-ico {
        display: grid;
        flex: none;
        place-items: center;
        width: 46px;
        height: 46px;
        border-radius: 14px;
        background: color-mix(in oklab, currentColor 14%, transparent);
      }
      .verdict-titre {
        margin: 0;
        font-size: 19px;
        font-weight: 800;
        letter-spacing: -0.01em;
      }
      .verdict-texte {
        margin: 4px 0 0;
        font-size: 15px;
        font-weight: 600;
        line-height: 1.45;
      }
      .verdict.v-same {
        background: var(--v2-sauge);
        color: var(--v2-vert-pousse);
      }
      .verdict.v-partial {
        background: var(--v2-attente-bg);
        color: var(--v2-attente-fg);
      }
      .verdict.v-different {
        background: var(--v2-info-bg);
        color: var(--v2-info-fg);
        border: 2px solid var(--v2-info-fg);
      }
      .sheets {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      }
      .sheet {
        display: flex;
        flex-direction: column;
        gap: 12px;
        border-radius: 22px;
        border: 1px solid var(--v2-bord-carte);
        border-top-width: 6px;
        background: var(--v2-blanc);
        padding: 18px;
      }
      .sheet-top {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .sheet .photo,
      .sheet .avatar {
        flex: none;
        width: 56px;
        height: 56px;
        border-radius: 999px;
        font-size: 18px;
      }
      .sheet .photo {
        object-fit: cover;
      }
      .sheet-letter {
        font-family: var(--v2-font-mono);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .sheet-facts {
        display: grid;
        gap: 6px;
        font-size: 14px;
        font-weight: 600;
      }
      .sheet-facts li {
        display: flex;
        gap: 8px;
        align-items: flex-start;
      }
      .sheet-facts ui-icon {
        flex: none;
        margin-top: 2px;
        color: var(--v2-gris-texte);
      }
      .summary {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px 16px;
        border-top: 1px solid var(--v2-separateur);
        padding: 14px 20px;
      }
      .cmp {
        border-collapse: collapse;
      }
      .cmp th {
        font-family: var(--v2-font-mono);
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--v2-gris-texte);
        padding: 10px 14px;
        text-align: left;
      }
      .cmp td {
        border-top: 1px solid var(--v2-separateur);
        padding: 10px 14px;
        font-size: 14px;
        font-weight: 600;
        vertical-align: top;
      }
      .cmp td.field {
        font-size: 13px;
        font-weight: 600;
        color: var(--v2-gris-texte);
        white-space: nowrap;
      }
      .cmp tr.same td.v {
        background: color-mix(in oklab, var(--v2-sauge) 70%, transparent);
      }
      .cmp tr.different td.v {
        background: color-mix(in oklab, var(--v2-attente-bg) 70%, transparent);
        font-weight: 800;
      }
      .cmp tr.info td.v {
        color: var(--v2-gris-texte);
      }
      .fix-grid {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        padding: 0 20px 8px;
      }
      .fix-input {
        height: 52px;
        width: 100%;
        border-radius: 16px;
        border: 1.5px solid var(--v2-gris-trait);
        background: var(--v2-blanc);
        padding: 0 16px;
        font-size: 15px;
        font-weight: 600;
        color: var(--v2-encre);
      }
      .fix-input:focus-visible {
        outline: none;
        border: 2px solid var(--v2-foret);
        box-shadow: var(--v2-halo);
      }
      .cell {
        display: inline-flex;
        gap: 6px;
        align-items: flex-start;
      }
      .cell ui-icon {
        flex: none;
        margin-top: 1px;
      }
      .legend {
        display: flex;
        flex-wrap: wrap;
        gap: 6px 18px;
        font-size: 12.5px;
        font-weight: 600;
        color: var(--v2-gris-texte);
      }
      .legend i {
        display: inline-block;
        width: 14px;
        height: 14px;
        margin-right: 6px;
        vertical-align: -2px;
        border-radius: 5px;
        border: 1px solid var(--v2-bord-carte);
      }
      .map {
        height: 340px;
      }
      .cols {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        padding: 4px 20px 20px;
      }
      .col {
        border-radius: 18px;
        border: 1px solid var(--v2-bord-carte);
        background: var(--v2-creme);
        padding: 14px;
      }
      .col h3 {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 14px;
        font-weight: 800;
      }
      .dot {
        flex: none;
        width: 12px;
        height: 12px;
        border-radius: 999px;
      }
      .col ul {
        display: grid;
        gap: 8px;
        margin-top: 10px;
      }
      .pill {
        display: inline-flex;
        align-items: flex-start;
        gap: 6px;
        border-radius: 14px;
        padding: 6px 10px;
        font-size: 13px;
        font-weight: 700;
        line-height: 1.35;
        background: var(--v2-attente-bg);
        color: var(--v2-attente-fg);
      }
      .alerte {
        display: flex;
        gap: 12px;
        align-items: flex-start;
        border-radius: 18px;
        padding: 14px 18px;
        background: var(--v2-attente-bg);
        color: var(--v2-attente-fg);
        font-size: 14px;
        font-weight: 600;
      }
      .decision {
        border: 2px solid var(--v2-foret);
      }
      .decision-actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        border-top: 1px solid var(--v2-separateur);
        padding: 16px 20px;
      }
      .open-links {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 16px;
        padding: 0 20px 16px;
        font-size: 14px;
        font-weight: 700;
      }
      .open-links a {
        color: var(--v2-foret);
        text-decoration: underline;
        text-underline-offset: 4px;
      }
    `,
  ],
  template: `
    <app-shell perm="quality.review" [area]="t()('qualite.compare.area')">
      <header class="rise flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <p class="mono" style="color: var(--v2-gris-texte)">{{ t()("qualite.compare.eyebrow") }}</p>
          <h1 class="mt-2 text-[30px] font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-[38px]">
            {{ t()("qualite.compare.title") }}
          </h1>
          @if (sheets().length >= 2) {
            <p class="mt-2 max-w-2xl text-[16px] font-medium" style="color: var(--v2-gris-texte)">
              {{ subtitle() }}
            </p>
          }
        </div>
        <a class="btn btn-ghost" routerLink="/dashboard/qualite/doublons">
          <ui-icon name="chevron_left" [size]="18" />{{ t()("qualite.compare.back") }}
        </a>
      </header>

      @if (!apiMode) {
        <div class="card sub mt-6 p-10 text-center">{{ t()("qualite.compare.demo") }}</div>
      } @else if (sheets().length < 2) {
        <div class="card mx-auto mt-10 flex max-w-lg flex-col items-center gap-3 p-10 text-center">
          <span
            class="grid size-14 place-items-center rounded-[16px]"
            style="background: var(--v2-attente-bg); color: var(--v2-attente-fg)"
            ><ui-icon name="warning" [size]="26"
          /></span>
          <h2 class="text-[22px] font-extrabold">{{ t()("qualite.compare.empty.title") }}</h2>
          <p class="sub">
            {{ missingCodes().length ? t()("qualite.compare.empty.body", { codes: missingCodes().join(", ") }) : t()("qualite.compare.empty.none") }}
          </p>
          <a class="btn btn-ghost mt-2" routerLink="/dashboard/qualite/doublons">{{ t()("qualite.compare.empty.back") }}</a>
        </div>
      } @else {
        <div class="stack mt-6">
          <!-- Verdict -->
          <div class="verdict rise" [class]="verdictClass()" role="note" aria-live="polite">
            <span class="verdict-ico" aria-hidden="true"
              ><ui-icon [name]="verdictIcon()" [size]="26"
            /></span>
            <div class="min-w-0">
              <p class="verdict-titre">{{ verdictTitle() }}</p>
              <p class="verdict-texte">{{ verdictBody() }}</p>
              @if (compareState() === "error") {
                <button type="button" class="btn btn-ghost mt-3" (click)="rerun()">
                  <ui-icon name="refresh" [size]="18" />{{ t()("qualite.strict.retry") }}
                </button>
              }
            </div>
          </div>

          <!-- Une carte par fiche -->
          <div class="sheets">
            @for (sheet of sheets(); track sheet.producer.id) {
              <article class="sheet" [style.border-top-color]="'var(' + sheet.color + ')'">
                <div class="sheet-top">
                  @if (sheet.producer.photoUrl) {
                    <img class="photo" [src]="sheet.producer.photoUrl" alt="" />
                  } @else {
                    <span class="avatar">{{ initials(sheet.producer.firstName + " " + sheet.producer.lastName) }}</span>
                  }
                  <div class="min-w-0">
                    <p class="sheet-letter" [style.color]="'var(' + sheet.color + ')'">
                      {{ t()("qualite.compare.cards.sheet", { letter: sheet.letter }) }}
                    </p>
                    <p class="truncate text-[17px] font-extrabold">
                      {{ sheet.producer.firstName }} {{ sheet.producer.lastName }}
                    </p>
                    <p class="sub">{{ sheet.producer.code }}</p>
                  </div>
                </div>
                <div class="flex flex-wrap gap-1.5">
                  <span class="badge" [style.background]="qualityTone[sheet.producer.quality].bg" [style.color]="qualityTone[sheet.producer.quality].fg">{{
                    t()(qualityLabel[sheet.producer.quality])
                  }}</span>
                  <span class="badge" style="background: var(--v2-creme); color: var(--v2-ardoise)">{{
                    t()(statusLabel[sheet.producer.status])
                  }}</span>
                  @let source = sourceOf(sheet.producer);
                  <span
                    class="badge"
                    [style.background]="source.bg"
                    [style.color]="source.fg"
                    [title]="sourceDetail(source) + sourcePlace(sheet.producer)"
                    ><ui-icon [name]="source.icon" [size]="14" />{{ t()(source.labelKey) }}</span
                  >
                  <app-placement-badge [record]="sheet.producer" />
                </div>
                <ul class="sheet-facts">
                  <li><ui-icon name="home_work" [size]="16" /><span>{{ scoopName(sheet.producer.scoopId) }}</span></li>
                  <li><ui-icon name="location_on" [size]="16" /><span>{{ sheet.producer.village || "—" }}</span></li>
                  <li><ui-icon name="person" [size]="16" /><span>{{ sheet.producer.sex }} · {{ fmtAge(sheet.producer.age) }}</span></li>
                  <li><ui-icon name="call" [size]="16" /><span class="tabular-nums">{{ store.phone(sheet.producer.phone) }}</span></li>
                  <li><ui-icon name="badge" [size]="16" /><span class="tabular-nums">{{ maskedCni(sheet.producer.cni) }}</span></li>
                  <li><ui-icon name="landscape" [size]="16" /><span>{{ plotsLine(sheet) }}</span></li>
                </ul>
              </article>
            }
          </div>

          <!-- Tableau champ par champ -->
          <section class="sec-card">
            <div class="sec-head">
              <h2>
                <span class="sec-ico"><ui-icon name="table_view" [size]="18" /></span
                >{{ t()("qualite.compare.table.title") }}
              </h2>
            </div>
            <div class="summary">
              @if (compareState() === "done") {
                <span class="badge" style="background: var(--v2-sauge); color: var(--v2-vert-pousse)">
                  <ui-icon name="check" [size]="14" />{{ summaryText() }}
                </span>
              }
              <div class="legend" aria-hidden="true">
                <span><i style="background: var(--v2-sauge)"></i>{{ t()("qualite.strict.legend.same") }}</span>
                <span><i style="background: var(--v2-attente-bg)"></i>{{ t()("qualite.strict.legend.differ") }}</span>
                <span><i style="background: var(--v2-blanc)"></i>{{ t()("qualite.strict.legend.info") }}</span>
              </div>
            </div>
            <div class="overflow-x-auto">
              <table class="cmp w-full" [style.min-width.px]="160 + sheets().length * 170">
                <thead>
                  <tr>
                    <th scope="col">{{ t()("qualite.compare.table.field") }}</th>
                    @for (sheet of sheets(); track sheet.producer.id) {
                      <th scope="col" [style.color]="'var(' + sheet.color + ')'">
                        {{ t()("qualite.compare.cards.sheet", { letter: sheet.letter }) }}
                      </th>
                    }
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td class="field">{{ t()("qualite.source.col") }}</td>
                    @for (sheet of sheets(); track sheet.producer.id) {
                      @let source = sourceOf(sheet.producer);
                      <td class="v">
                        <span class="cell">
                          <span
                            class="badge"
                            [style.background]="source.bg"
                            [style.color]="source.fg"
                            [title]="sourceDetail(source)"
                            ><ui-icon [name]="source.icon" [size]="14" />{{ t()(source.labelKey) }}</span
                          >
                        </span>
                      </td>
                    }
                  </tr>
                  @for (row of rows(); track row.label) {
                    <tr [class]="row.state">
                      <td class="field">
                        {{ row.label }}
                        @if (row.state === "different") {
                          <span class="badge ml-2" style="background: var(--v2-attente-bg); color: var(--v2-attente-fg)">{{
                            t()("qualite.strict.row.differ")
                          }}</span>
                        }
                      </td>
                      @for (value of row.values; track $index) {
                        <td class="v">
                          <span class="cell">
                            @if (row.state === "same") {
                              <ui-icon name="check_circle" [size]="16" style="color: var(--v2-vert-pousse)" />
                            } @else if (row.state === "different") {
                              <ui-icon name="warning" [size]="16" style="color: var(--v2-attente-fg)" />
                            }
                            <span>{{ value || "—" }}</span>
                          </span>
                        </td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            @if (mixedSources()) {
              <p class="sub px-5 py-3" style="border-top: 1px solid var(--v2-separateur)">
                {{ t()("qualite.source.compareHint") }}
              </p>
            }
            <p class="sub px-5 py-3" style="border-top: 1px solid var(--v2-separateur)">
              {{ t()("qualite.compare.masked") }} {{ t()("qualite.strict.table.hint") }}
            </p>
          </section>

          <!-- Parcelles -->
          <section class="sec-card">
            <div class="sec-head">
              <h2>
                <span class="sec-ico"><ui-icon name="map" [size]="18" /></span
                >{{ t()("qualite.compare.plots.title") }}
              </h2>
            </div>
            @if (mapPlots().length && store.can("map.read")) {
              <div class="map border-t" style="border-color: var(--v2-separateur)">
                <app-plot-map [plots]="mapPlots()" [producerColors]="plotColors()" basemap="sat" />
              </div>
              <p class="sub px-5 py-2">{{ t()("qualite.compare.plots.mapHint") }}</p>
            } @else if (store.can("map.read")) {
              <p class="sub px-5 pb-3">{{ t()("qualite.compare.plots.noContour") }}</p>
            }
            @if (closePairs().length) {
              <div class="alerte mx-5 mb-4" role="note">
                <ui-icon name="warning" [size]="20" />
                <div>
                  <p class="font-extrabold">{{ t()("qualite.compare.plots.close") }}</p>
                  @for (pair of closePairs(); track pair.first.id + pair.second.id) {
                    <p class="mt-1">
                      {{
                        t()("qualite.compare.plots.closeBody", {
                          first: pair.first.code,
                          firstCode: ownerCode(pair.first),
                          second: pair.second.code,
                          secondCode: ownerCode(pair.second),
                          distance: nf.format(Math.round(pair.distanceM)),
                        })
                      }}
                    </p>
                  }
                </div>
              </div>
            }
            <div class="cols">
              @for (sheet of sheets(); track sheet.producer.id) {
                <div class="col">
                  <h3>
                    <span class="dot" [style.background]="'var(' + sheet.color + ')'"></span>
                    {{ t()("qualite.compare.cards.sheet", { letter: sheet.letter }) }} · {{ sheet.producer.code }}
                  </h3>
                  @if (sheet.plots.length) {
                    <ul class="text-[14px] font-semibold">
                      @for (plot of sheet.plots; track plot.id) {
                        <li>
                          <span class="font-extrabold">{{ plot.code }}</span>
                          <span class="sub block">{{ plotDescription(plot) }}</span>
                        </li>
                      }
                    </ul>
                  } @else {
                    <p class="sub mt-2">{{ t()("qualite.compare.plots.none") }}</p>
                  }
                </div>
              }
            </div>
          </section>

          <!-- Alertes -->
          <section class="sec-card">
            <div class="sec-head">
              <h2>
                <span class="sec-ico"><ui-icon name="warning" [size]="18" /></span
                >{{ t()("qualite.compare.alerts.title") }}
              </h2>
            </div>
            <div class="cols">
              @for (sheet of sheets(); track sheet.producer.id) {
                <div class="col">
                  <h3>
                    <span class="dot" [style.background]="'var(' + sheet.color + ')'"></span>
                    {{ t()("qualite.compare.cards.sheet", { letter: sheet.letter }) }} · {{ sheet.producer.code }}
                  </h3>
                  @if (sheet.alerts.length || sheet.plotAlerts.length) {
                    <ul>
                      @for (text of sheet.alerts; track text) {
                        <li><span class="pill"><ui-icon name="warning" [size]="14" />{{ text }}</span></li>
                      }
                      @for (item of sheet.plotAlerts; track item.place + item.text) {
                        <li>
                          <span class="pill"
                            ><ui-icon name="landscape" [size]="14" />{{
                              t()("qualite.compare.alerts.plot", { place: item.place })
                            }}
                            : {{ item.text }}</span
                          >
                        </li>
                      }
                    </ul>
                  } @else {
                    <p class="sub mt-2">{{ t()("qualite.compare.alerts.none") }}</p>
                  }
                </div>
              }
            </div>
          </section>

          <!-- Corriger avant de fusionner -->
          @if (compareState() === "done" && !allIdentical()) {
            <section class="sec-card">
              <div class="sec-head">
                <h2>
                  <span class="sec-ico"><ui-icon name="edit" [size]="18" /></span
                  >{{ t()("qualite.strict.fix.title") }}
                </h2>
              </div>
              <p class="sub max-w-3xl px-5 pb-4">{{ t()("qualite.strict.fix.intro") }}</p>
              @if (canFix()) {
                <div class="fix-grid">
                  <div>
                    <p class="lbl">{{ t()("qualite.strict.fix.sheet") }}</p>
                    <ui-select
                      class="mt-2 block"
                      [label]="t()('qualite.strict.fix.sheet')"
                      [options]="fixSheetOptions()"
                      [value]="fixSheetId()"
                      (valueChange)="fixSheetId.set($event)"
                    />
                  </div>
                  <div>
                    <p class="lbl">{{ t()("qualite.strict.fix.field") }}</p>
                    <ui-select
                      class="mt-2 block"
                      [label]="t()('qualite.strict.fix.field')"
                      [options]="fixFieldOptions()"
                      [value]="fixField()"
                      (valueChange)="chooseFixField($event)"
                    />
                  </div>
                  <div>
                    <label class="lbl" for="fix-value">{{ t()("qualite.strict.fix.value") }}</label>
                    @if (fixChoices(); as choices) {
                      <ui-select
                        class="mt-2 block"
                        [label]="t()('qualite.strict.fix.value')"
                        [options]="choices"
                        [value]="fixValue()"
                        (valueChange)="fixValue.set($event)"
                      />
                    } @else {
                      <input
                        id="fix-value"
                        class="fix-input mt-2"
                        [type]="fixField() === 'age' ? 'number' : 'text'"
                        [attr.inputmode]="fixField() === 'age' ? 'numeric' : null"
                        [placeholder]="t()('qualite.strict.fix.valuePlaceholder')"
                        [value]="fixValue()"
                        (input)="fixValue.set($any($event.target).value)"
                      />
                    }
                  </div>
                </div>
                <p class="sub px-5 pb-3 pt-2">{{ t()("qualite.strict.fix.elsewhere") }}</p>
                <div class="decision-actions">
                  <span class="sub" role="alert">{{ fixError() }}</span>
                  <button type="button" class="btn btn-primary" [disabled]="fixBusy()" (click)="saveFix()">
                    {{ fixBusy() ? t()("qualite.strict.fix.saving") : t()("qualite.strict.fix.save")
                    }}<span class="btn-chip"><ui-icon name="check" [size]="18" /></span>
                  </button>
                </div>
              } @else {
                <p class="sub px-5 pb-5">{{ t()("qualite.strict.fix.noPerm") }}</p>
              }
            </section>
          }

          <!-- Décision -->
          <section class="sec-card decision">
            <div class="sec-head">
              <h2>
                <span class="sec-ico"><ui-icon name="gavel" [size]="18" /></span
                >{{ t()("qualite.compare.decision.title") }}
              </h2>
            </div>
            <p class="px-5 pb-4 text-[15px] font-semibold">{{ decisionText() }}</p>
            <div class="open-links">
              @for (sheet of sheets(); track sheet.producer.id) {
                <a [routerLink]="['/dashboard/producteurs', sheet.producer.id]">{{
                  t()("qualite.compare.decision.open", { name: sheet.producer.firstName + " " + sheet.producer.lastName })
                }}</a>
              }
            </div>
            <div class="decision-actions">
              <div class="min-w-0">
                @if (compareState() === "done" && !allIdentical()) {
                  <p class="sub max-w-md">{{ t()("qualite.strict.differHint") }}</p>
                }
              </div>
              <div class="flex flex-wrap justify-end gap-2">
                @if (canContact()) {
                  <button type="button" class="btn btn-ghost" (click)="openContact()">
                    <ui-icon name="mail" [size]="18" />{{ t()("demandes.action") }}
                  </button>
                }
                <a class="btn btn-ghost" routerLink="/dashboard/qualite/doublons">{{
                  t()("qualite.compare.decision.notDuplicates")
                }}</a>
                @for (action of mergeActions(); track action.subset[0]!.id) {
                  <button type="button" class="btn btn-primary" [disabled]="!action.enabled" (click)="openMerge(action.subset)">
                    <ui-icon name="hub" [size]="18" />{{ t()("qualite.compare.decision.merge") }}
                    @if (mergeActions().length > 1) {
                      <span>· {{ codes(action.subset) }}</span>
                    }
                    <span class="btn-chip"><ui-icon name="arrow_forward" [size]="18" /></span>
                  </button>
                }
              </div>
            </div>
          </section>
        </div>
      }

      <app-merge-producers-modal [group]="mergeGroup()" (closed)="mergeGroup.set(null)" />

      <ui-contact-scoop-modal
        [open]="contactTargets().length > 0"
        kind="doublon"
        [targets]="contactTargets()"
        link="/dashboard/qualite/doublons"
        (closed)="contactTargets.set([])"
      />
    </app-shell>
  `,
})
export default class QualiteDoublonsComparerPage {
  protected readonly store = inject(StoreService);
  private readonly locale = inject(LocaleService);
  protected readonly t = this.locale.t;
  private readonly route = inject(ActivatedRoute);

  protected readonly apiMode = isApiMode();
  protected readonly initials = initialsOf;
  protected readonly fmtAge = fmtAge;
  protected readonly nf = nf;
  protected readonly Math = Math;
  protected readonly qualityLabel = QUALITY_LABEL;
  protected readonly statusLabel = STATUS_LABEL;
  protected readonly qualityTone = QUALITY_TONE;
  protected readonly mergeGroup = signal<DuplicateGroup | null>(null);
  protected readonly contactTargets = signal<CoopRequestTarget[]>([]);
  protected readonly canContact = computed(() => this.apiMode && this.store.can("coop_request.send"));

  private readonly queryParams = toSignal(this.route.queryParamMap.pipe(map((params) => params.get("fiches") ?? "")), {
    initialValue: this.route.snapshot.queryParamMap.get("fiches") ?? "",
  });

  /** Codes demandés (sans doublon, 4 au plus), en majuscules. */
  protected readonly requestedCodes = computed(() => {
    const codes = this.queryParams()
      .split(/[,;\s]+/)
      .map((code) => code.trim().toUpperCase())
      .filter(Boolean);
    return [...new Set(codes)].slice(0, MAX_COMPARED);
  });

  /** Fiches trouvées dans le périmètre de la session, dans l'ordre demandé. */
  protected readonly members = computed<Producer[]>(() => {
    const state = this.store.state();
    const visible = inScope(
      state.producers.filter((producer) => !producer.mergedInto),
      state.session,
    );
    const byCode = new Map(visible.map((producer) => [producer.code.trim().toUpperCase(), producer]));
    return this.requestedCodes()
      .map((code) => byCode.get(code))
      .filter((producer): producer is Producer => !!producer);
  });

  protected readonly missingCodes = computed(() => {
    const found = new Set(this.members().map((producer) => producer.code.trim().toUpperCase()));
    return this.requestedCodes().filter((code) => !found.has(code));
  });

  protected readonly sheets = computed<Sheet[]>(() => {
    const state = this.store.state();
    return this.members().map((producer, index) => {
      const plots = state.plots.filter((plot) => plot.producerId === producer.id);
      return {
        producer,
        letter: LETTERS[index] ?? String(index + 1),
        color: SHEET_COLORS[index] ?? SHEET_COLORS[0]!,
        plots,
        alerts: producerAlertTexts(producer),
        plotAlerts: plots.flatMap((plot) => [
          ...(plot.alerts ?? []).map((text) => ({ place: plot.code, text })),
          ...(plot.cropDetails ?? []).flatMap((crop) =>
            crop.alerts.map((text) => ({ place: `${crop.crop} · ${plot.code}`, text })),
          ),
        ]),
      };
    });
  });

  protected readonly reasons = computed(() => similarityReasons(this.members()));

  protected readonly subtitle = computed(() => {
    const t = this.t();
    const reasons = this.reasons();
    const text = reasons.length
      ? reasons.map((reason) => t(REASON_LABEL[reason])).join(", ")
      : t("qualite.compare.reason.none");
    return t("qualite.compare.subtitle", { n: this.members().length, reasons: text });
  });

  // ───────────────────────── Comparaison stricte (serveur) ─────────────────────────
  // Règle Q-02 : deux fiches ne se fusionnent que si TOUTES leurs informations sont strictement identiques. Seul le
  // serveur le dit (`GET /producers/:keepId/compare`) : le site n'en déduit rien de ce qu'il affiche (valeurs masquées).

  protected readonly compareState = signal<CompareState>("idle");
  private readonly pairResults = signal<PairResult[]>([]);
  private readonly rerunTick = signal(0);
  private runToken = 0;

  /** Relance la comparaison (après une correction, ou après un échec réseau). */
  protected rerun(): void {
    this.rerunTick.update((tick) => tick + 1);
  }

  private readonly compareTrigger = effect(() => {
    const ids = this.members().map((member) => member.id);
    this.rerunTick();
    untracked(() => void this.runComparison(ids));
  });

  private async runComparison(ids: string[]): Promise<void> {
    const token = ++this.runToken;
    if (!this.apiMode || ids.length < 2) {
      this.pairResults.set([]);
      this.compareState.set("idle");
      return;
    }
    this.compareState.set("loading");
    const pairs: [string, string][] = [];
    for (let first = 0; first < ids.length; first += 1) {
      for (let second = first + 1; second < ids.length; second += 1) pairs.push([ids[first]!, ids[second]!]);
    }
    try {
      const results = await Promise.all(
        pairs.map(async ([firstId, secondId]) => ({ firstId, secondId, result: await compareProducers(firstId, secondId) })),
      );
      if (token !== this.runToken) return;
      this.pairResults.set(results);
      this.compareState.set("done");
    } catch {
      if (token !== this.runToken) return;
      this.pairResults.set([]);
      this.compareState.set("error");
    }
  }

  /** Clés des champs que le serveur dit différents, sur au moins une paire. */
  private readonly differingKeys = computed(
    () => new Set(this.pairResults().flatMap((pair) => pair.result.fields.map((field) => field.key))),
  );

  /** Libellés (français, donnés par le serveur) des champs qui diffèrent, sans doublon. */
  private readonly differingLabels = computed(() => {
    const seen = new Map<string, string>();
    for (const pair of this.pairResults()) for (const field of pair.result.fields) seen.set(field.key, field.label);
    return [...seen.values()];
  });

  /** Ensembles de fiches strictement identiques entre elles (l'identité stricte est transitive), deux fiches au moins. */
  private readonly identicalClasses = computed<Producer[][]>(() => {
    const members = this.members();
    const parent = new Map(members.map((member) => [member.id, member.id]));
    const find = (id: string): string => {
      let root = id;
      while (parent.get(root) !== root) root = parent.get(root)!;
      return root;
    };
    for (const pair of this.pairResults()) {
      if (pair.result.identical) parent.set(find(pair.firstId), find(pair.secondId));
    }
    const groups = new Map<string, Producer[]>();
    for (const member of members) {
      const root = find(member.id);
      groups.set(root, [...(groups.get(root) ?? []), member]);
    }
    return [...groups.values()].filter((group) => group.length > 1);
  });

  /** Toutes les paires sont identiques : seule situation où tout peut se fusionner d'un coup. */
  protected readonly allIdentical = computed(
    () => this.compareState() === "done" && this.pairResults().length > 0 && this.pairResults().every((pair) => pair.result.identical),
  );

  private readonly verdictKind = computed<"checking" | "error" | "identical" | "partial" | "differ">(() => {
    const state = this.compareState();
    if (state === "loading" || state === "idle") return "checking";
    if (state === "error") return "error";
    if (this.allIdentical()) return "identical";
    return this.identicalClasses().length ? "partial" : "differ";
  });

  protected readonly verdictClass = computed(() => {
    const kind = this.verdictKind();
    return kind === "identical" ? "v-same" : kind === "partial" ? "v-partial" : "v-different";
  });

  protected readonly verdictIcon = computed<"task_alt" | "warning" | "info">(() => {
    const kind = this.verdictKind();
    return kind === "identical" ? "task_alt" : kind === "checking" ? "info" : "warning";
  });

  protected readonly verdictTitle = computed(() => this.t()(`qualite.strict.verdict.${this.verdictKind()}`));

  protected readonly verdictBody = computed(() => {
    const t = this.t();
    const kind = this.verdictKind();
    if (kind === "differ") {
      return t("qualite.strict.verdict.differBody", { hint: t("qualite.strict.differHint"), fields: this.differingLabels().join(", ") });
    }
    if (kind === "partial") {
      return t("qualite.strict.verdict.partialBody", { codes: this.identicalClasses().map((group) => this.codes(group)).join(" / ") });
    }
    return t(`qualite.strict.verdict.${kind}Body`);
  });

  protected readonly rows = computed<StrictRow[]>(() => {
    const t = this.t();
    const state = this.store.state();
    const sheets = this.sheets();
    const compared = this.compareState() === "done";
    const differing = this.differingKeys();
    // `keys` : champs du serveur couverts par la ligne ; vide = information non comparée (pas de couleur).
    const row = (label: string, keys: string[], value: (sheet: Sheet) => string | null | undefined): StrictRow => {
      const built = buildCompareRow(label, sheets.map(value));
      const rowState: RowState = !keys.length || !compared ? "info" : keys.some((key) => differing.has(key)) ? "different" : "same";
      return { label: built.label, values: built.values, state: rowState };
    };
    return [
      row(t("qualite.strict.field.firstName"), ["firstName"], (sheet) => sheet.producer.firstName),
      row(t("qualite.strict.field.lastName"), ["lastName"], (sheet) => sheet.producer.lastName),
      row(t("qualite.doublons.row.code"), [], (sheet) => sheet.producer.code),
      row(t("qualite.doublons.row.scoop"), ["scoopId"], (sheet) => this.scoopName(sheet.producer.scoopId)),
      row(t("qualite.compare.row.org"), ["orgId"], (sheet) => state.orgs.find((org) => org.id === sheet.producer.orgId)?.name ?? ""),
      row(t("qualite.doublons.row.village"), ["village"], (sheet) => sheet.producer.village),
      row(t("qualite.doublons.row.sex"), ["sex"], (sheet) => sheet.producer.sex),
      row(t("qualite.doublons.row.age"), ["age"], (sheet) => (sheet.producer.age === null ? "" : fmtAge(sheet.producer.age))),
      row(t("qualite.strict.field.handicap"), ["handicap"], (sheet) =>
        t(sheet.producer.handicap ? "qualite.strict.fix.yes" : "qualite.strict.fix.no"),
      ),
      row(t("qualite.strict.field.status"), ["status"], (sheet) => t(STATUS_LABEL[sheet.producer.status])),
      row(t("qualite.compare.row.quality"), [], (sheet) => t(QUALITY_LABEL[sheet.producer.quality])),
      row(t("qualite.doublons.row.phone"), ["phone"], (sheet) => this.store.phone(sheet.producer.phone)),
      row(t("qualite.doublons.row.cni"), ["cni"], (sheet) => this.maskedCni(sheet.producer.cni)),
      row(t("qualite.doublons.row.enumerator"), ["enumerator"], (sheet) => sheet.producer.enumerator),
      row(t("qualite.compare.row.createdAt"), [], (sheet) => (sheet.producer.createdAt ? fmtDate(sheet.producer.createdAt) : "")),
      row(t("qualite.strict.field.survey"), ["survey"], (sheet) =>
        t(sheet.producer.survey ? "qualite.strict.row.surveyYes" : "qualite.strict.row.surveyNo"),
      ),
      row(t("qualite.strict.field.crops"), ["crops"], (sheet) => sheet.producer.crops.map((crop) => crop.crop).sort().join(", ")),
      row(t("qualite.doublons.row.plots"), ["plots"], (sheet) => String(sheet.plots.length)),
      row(t("qualite.compare.row.area"), ["plots"], (sheet) => `${nf1.format(this.totalArea(sheet))} ha`),
      row(t("qualite.strict.field.plotCrops"), ["plotCrops"], (sheet) => this.cropsOf(sheet).join(", ")),
    ];
  });

  protected readonly summaryText = computed(() => {
    const rows = this.rows().filter((row) => row.state !== "info");
    const different = rows.filter((row) => row.state === "different").length;
    return this.t()("qualite.compare.table.summary", { same: rows.length - different, different });
  });

  /** Parcelles avec contour, seules affichables sur la carte. */
  protected readonly mapPlots = computed(() =>
    this.sheets()
      .flatMap((sheet) => sheet.plots)
      .filter((plot) => (plot.repaired?.length ?? plot.raw.length) > 0),
  );

  protected readonly plotColors = computed<Record<string, string>>(() =>
    Object.fromEntries(this.sheets().map((sheet) => [sheet.producer.id, sheet.color])),
  );

  protected readonly closePairs = computed(() => closePlotPairs(this.mapPlots()));

  /**
   * Boutons « Fusionner » : un par ensemble de fiches que le serveur dit strictement identiques (même coopérative, droit
   * `quality.merge`). Tant qu'aucun ensemble n'existe, un seul bouton reste visible mais **inactif**.
   */
  protected readonly mergeActions = computed<{ subset: Producer[]; enabled: boolean }[]>(() => {
    if (!this.store.can("quality.merge") || this.members().length < 2) return [];
    const classes = this.identicalClasses().filter((group) => new Set(group.map((member) => member.scoopId)).size === 1);
    if (this.compareState() === "done" && classes.length) return classes.map((subset) => ({ subset, enabled: true }));
    return [{ subset: this.members(), enabled: false }];
  });

  protected readonly decisionText = computed(() => {
    const t = this.t();
    if (!this.store.can("quality.merge")) return t("qualite.compare.decision.notMergeable.perm");
    switch (this.verdictKind()) {
      case "identical":
        return t("qualite.strict.decision.identical");
      case "partial":
        return t("qualite.strict.verdict.partialBody", { codes: this.identicalClasses().map((group) => this.codes(group)).join(" / ") });
      case "differ":
        return t("qualite.strict.decision.differ");
      case "error":
        return t("qualite.strict.decision.error");
      default:
        return t("qualite.strict.decision.checking");
    }
  });

  // ───────────────────────── Corriger avant de fusionner ─────────────────────────

  private readonly snackbar = inject(SnackbarService);
  /** Correction d'une fiche : droit `producer.edit`, route `PATCH /producers/:id` (historique et audit côté serveur). */
  protected readonly canFix = computed(() => this.apiMode && this.store.can("producer.edit"));
  protected readonly fixSheetId = signal("");
  protected readonly fixField = signal<FixField>("village");
  protected readonly fixValue = signal("");
  protected readonly fixBusy = signal(false);
  protected readonly fixError = signal("");

  private readonly fixSheetDefault = effect(() => {
    const first = this.members()[0]?.id ?? "";
    untracked(() => {
      if (!this.members().some((member) => member.id === this.fixSheetId())) this.fixSheetId.set(first);
    });
  });

  protected readonly fixSheetOptions = computed<SelectOption[]>(() =>
    this.sheets().map((sheet) => ({
      value: sheet.producer.id,
      label: this.t()("qualite.compare.cards.sheet", { letter: sheet.letter }) + " · " + sheet.producer.code,
    })),
  );

  protected readonly fixFieldOptions = computed<SelectOption[]>(() =>
    FIX_FIELDS.map((field) => ({ value: field, label: this.t()(FIX_LABEL[field]) })),
  );

  /** Choix fermés pour les champs à valeurs connues (sexe, statut, handicap, organisation) ; `null` : saisie libre. */
  protected readonly fixChoices = computed<SelectOption[] | null>(() => {
    const t = this.t();
    switch (this.fixField()) {
      case "sex":
        return [
          { value: "F", label: t("producteurs.sex.F") },
          { value: "H", label: t("producteurs.sex.H") },
        ];
      case "status":
        return [
          { value: "recensé", label: t(STATUS_LABEL["recensé"]) },
          { value: "membre", label: t(STATUS_LABEL["membre"]) },
        ];
      case "handicap":
        return [
          { value: "oui", label: t("qualite.strict.fix.yes") },
          { value: "non", label: t("qualite.strict.fix.no") },
        ];
      case "orgId": {
        const sheet = this.members().find((member) => member.id === this.fixSheetId());
        return this.store
          .state()
          .orgs.filter((org) => org.scoopId === sheet?.scoopId)
          .map((org) => ({ value: org.id, label: org.name }));
      }
      default:
        return null;
    }
  });

  protected chooseFixField(field: string): void {
    this.fixField.set(field as FixField);
    this.fixValue.set("");
    this.fixError.set("");
  }

  /** Corps du `PATCH` pour la valeur saisie, ou le message d'erreur à afficher. */
  private fixBody(): { body: ProducerCorrection } | { error: string } {
    const t = this.t();
    const value = this.fixValue().trim();
    if (!value) return { error: t("qualite.strict.fix.empty") };
    switch (this.fixField()) {
      case "age": {
        const age = Number(value);
        return Number.isInteger(age) && age >= 15 && age <= 100 ? { body: { age } } : { error: t("qualite.strict.fix.ageRange") };
      }
      case "sex":
        return { body: { sex: value === "F" ? "F" : "H" } };
      case "status":
        return { body: { status: value === "membre" ? "membre" : "recensé" } };
      case "handicap":
        return { body: { handicap: value === "oui" } };
      default:
        return { body: { [this.fixField()]: value } as ProducerCorrection };
    }
  }

  /** Enregistre la correction (la fiche est relue sur le serveur) puis relance la comparaison. */
  protected async saveFix(): Promise<void> {
    const sheet = this.members().find((member) => member.id === this.fixSheetId());
    if (!sheet || this.fixBusy()) return;
    const built = this.fixBody();
    if ("error" in built) {
      this.fixError.set(built.error);
      return;
    }
    this.fixError.set("");
    this.fixBusy.set(true);
    try {
      this.store.actions.upsertProducerFromApi(await correctProducerOnApi(sheet.id, built.body));
      this.fixValue.set("");
      this.snackbar.success(this.t()("qualite.strict.fix.done", { code: sheet.code }));
      this.rerun();
    } catch (error) {
      this.fixError.set(producerApiMessage(error, this.t()("qualite.strict.fix.failed")));
    } finally {
      this.fixBusy.set(false);
    }
  }

  /** Base d'origine d'une fiche (Kobo apurée ou saisie dans l'application). */
  protected sourceOf(producer: Producer): DataSource {
    return sourceOfProducer(producer);
  }

  protected sourceDetail(source: DataSource): string {
    return describeSource(source, this.t());
  }

  /** Feuille et ligne du fichier d'origine, précédées d'un séparateur (vide si rien n'est enregistré). */
  protected sourcePlace(producer: Producer): string {
    const place = describeSourcePlace(producer, this.t());
    return place ? ` · ${place}` : "";
  }

  /** Les fiches comparées viennent de bases différentes : c'est précisément le cas où la colonne sert. */
  protected readonly mixedSources = computed(
    () => sourceOfGroup(this.sheets().map((sheet) => sheet.producer)).id === "mixte",
  );

  protected scoopName(id: string): string {
    return this.store.state().scoops.find((scoop) => scoop.id === id)?.name ?? "";
  }

  protected maskedCni(cni: string): string {
    return cni ? maskCni(cni) : "";
  }

  protected codes(members: Producer[]): string {
    return members.map((member) => member.code).join(", ");
  }

  protected ownerCode(plot: Plot): string {
    return this.members().find((member) => member.id === plot.producerId)?.code ?? "";
  }

  private totalArea(sheet: Sheet): number {
    return sheet.plots.reduce((sum, plot) => sum + (plot.measured || 0), 0);
  }

  private cropsOf(sheet: Sheet): string[] {
    const fromPlots = sheet.plots.map((plot) => plot.crop).filter(Boolean);
    const all = fromPlots.length ? fromPlots : sheet.producer.crops.map((crop) => crop.crop);
    return [...new Set(all)].sort((first, second) => first.localeCompare(second));
  }

  protected plotsLine(sheet: Sheet): string {
    const t = this.t();
    return `${t("qualite.merge.plots", { n: sheet.plots.length })} · ${nf1.format(this.totalArea(sheet))} ha`;
  }

  protected plotDescription(plot: Plot): string {
    const t = this.t();
    return t("qualite.compare.plots.line", {
      crop: plot.crop || t("qualite.compare.plots.cropUnknown"),
      area: nf1.format(plot.measured || 0),
    });
  }

  /** Une demande par coopérative des fiches comparées, avec leurs codes producteur. */
  protected openContact() {
    this.contactTargets.set(
      groupByScoop(this.members()).map(({ scoopId, entries }) => ({
        scoopId,
        items: entries.map(producerItem),
        ...duplicateDraft({ codes: entries.map((member) => member.code) }),
      })),
    );
  }

  protected openMerge(subset: Producer[]) {
    this.mergeGroup.set({ id: `compare-${this.codes(subset)}`, reason: "phone", members: subset });
  }
}

