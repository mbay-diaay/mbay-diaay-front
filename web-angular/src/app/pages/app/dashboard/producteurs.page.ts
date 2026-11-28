import { UiEmptyStateComponent } from "@shared/ui/empty-state.component";
import { Component, computed, effect, inject, linkedSignal, signal, untracked } from "@angular/core";
import { ActivatedRoute, type ParamMap, Router } from "@angular/router";
import { toSignal } from "@angular/core/rxjs-interop";
import { map } from "rxjs";

import { isApiMode } from "@/lib/api/config";
import {
  fetchProducersPage,
  getProducerStats,
  type ProducerListFilters,
  type ProducerSourceCounts,
  type ProducerStats,
} from "@/lib/api/producers";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, type PageMeta } from "@/lib/api/pagination";
import { actions, can, inScope } from "@/lib/store";
import { CROPS, VILLAGES, type Producer, type Quality } from "@/lib/mock/data";
import { AGE_BANDS, ageAtMost, ageBand, downloadCsv, fmtDate, maskPhone, nf } from "@/lib/format";
import { countBySource, describeSourceFact, SOURCE_FILTER_IDS, sourceOfRecord, type DataSourceId } from "@/lib/data-source";
import type { MessageKey } from "@/lib/i18n";
import { AppShellComponent } from "@shared/app-shell.component";
import { LocaleService } from "@shared/locale.service";
import { CniAlertBadgeComponent } from "@shared/cni-alert-badge.component";
import { CniAlertsService } from "@shared/cni-alerts.service";
import { MoveToOrganisationModalComponent, type MoveRequest } from "@shared/move-to-organisation-modal.component";
import { PlacementBadgeComponent } from "@shared/placement-badge.component";
import { SourceBadgeComponent } from "@shared/source-badge.component";
import { TransferScoopModalComponent, type TransferRequest } from "@shared/transfer-scoop-modal.component";
import { StoreService } from "@shared/store.service";
import { createPager, createServerPager } from "@shared/pager";
import { ProducerWorkflow } from "@shared/producer-workflow.service";
import {
  detailFact,
  detailKpi,
  DetailModalComponent,
  AvatarComponent,
  IconComponent,
  initialsOf,
  ModalComponent,
  PaginationComponent,
  SelectComponent,
  SnackbarService,
  StatCardsComponent,
  TONE,
  V2_PAGE_STYLES,
  type DetailView,
  type IconName,
  type SelectOption,
  type StatCard,
} from "@shared/ui";
import { GlobalFiltersComponent } from "@shared/global-filters.component";

const ALL = "__all";

type FilterKey = "village" | "sexe" | "handicap" | "age" | "qualite" | "culture" | "source";

const SOURCE_LABEL: Record<DataSourceId, MessageKey> = {
  kobo: "qualite.source.kobo",
  consolidee: "qualite.source.consolidee",
  application: "qualite.source.application",
  cradesc: "qualite.source.cradesc",
};

interface ProducteursUrlState {
  q: string;
  village: string;
  sexe: string;
  handicap: string;
  age: string;
  qualite: string;
  culture: string;
  source: string;
  scoop: string;
  campagne: string;
}

function parseProducteursQuery(m: ParamMap): ProducteursUrlState {
  const get = (k: string) => m.get(k);
  return {
    q: get("q") ?? "",
    village: get("village") ?? ALL,
    sexe: get("sexe") ?? ALL,
    handicap: get("handicap") ?? ALL,
    age: get("age") ?? ALL,
    qualite: get("qualite") ?? ALL,
    culture: get("culture") ?? ALL,
    source: get("source") ?? ALL,
    scoop: get("scoop") ?? "",
    campagne: get("campagne") ?? "",
  };
}

const QUALITIES: readonly Quality[] = ["validé", "à vérifier", "doublon", "invalide"];

const QUALITY: Record<Quality, { label: MessageKey; bg: string; fg: string }> = {
  validé: { label: "producteurs.quality.validé", ...TONE.succes },
  "à vérifier": { label: "producteurs.quality.à vérifier", ...TONE.attente },
  doublon: { label: "producteurs.quality.doublon", ...TONE.info },
  invalide: { label: "producteurs.quality.invalide", ...TONE.erreur },
};

const STATUS = {
  recensé: { label: "producteurs.status.recensé", ...TONE.neutre },
  membre: { label: "producteurs.status.membre", ...TONE.culture },
} as const satisfies Record<string, { label: MessageKey; bg: string; fg: string }>;

/**
 * Annuaire des producteurs (charte V2) : statistiques, recherche + filtre qualité à compteurs,
 * filtres village / sexe / âge / culture, tableau paginé, détail en modale (lien vers la fiche).
 * Critères `q`, `village`, `sexe`, `age`, `qualite`, `culture` + `scoop` / `campagne`
 * (en-tête) sont lus/écrits dans l'URL (`replaceUrl`).
 */
@Component({
  selector: "app-producteurs-page",
  imports: [
    UiEmptyStateComponent,
    GlobalFiltersComponent,
    AppShellComponent,
    AvatarComponent,
    PlacementBadgeComponent,
    SourceBadgeComponent,
    CniAlertBadgeComponent,
    MoveToOrganisationModalComponent,
    TransferScoopModalComponent,
    IconComponent,
    ModalComponent,
    DetailModalComponent,
    PaginationComponent,
    SelectComponent,
    StatCardsComponent,
  ],
  styles: [
    V2_PAGE_STYLES,
    `
      .filters {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
        gap: 8px;
      }
      .reset {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 14px;
        font-weight: 800;
        color: var(--v2-foret);
        cursor: pointer;
      }
      .reset:hover {
        text-decoration: underline;
      }
      /* Qualité : ce qui demande une action ressort (rouge, ambre), seulement quand il y a des fiches concernées. */
      .seg button.has[data-tone="ok"] {
        color: var(--v2-foret);
      }
      .seg button.has[data-tone="ok"] .n {
        background: var(--v2-foret);
        color: var(--v2-blanc);
      }
      .seg button.has[data-tone="danger"] {
        color: var(--v2-erreur-fg);
        font-weight: 800;
      }
      .seg button.has[data-tone="danger"] .n {
        background: var(--v2-erreur-fg);
        color: var(--v2-blanc);
      }
      .seg button.has[data-tone="warn"] {
        color: var(--v2-attente-fg);
        font-weight: 800;
      }
      .seg button.has[data-tone="warn"] .n {
        background: var(--v2-attente-bg);
        color: var(--v2-attente-fg);
      }
      .seg button.has[data-tone="alert"] {
        color: var(--v2-erreur-fg);
      }
      .seg button.has[data-tone="alert"] .n {
        background: var(--v2-erreur-bg);
        color: var(--v2-erreur-fg);
      }
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
      .code {
        font-family: var(--v2-font-mono);
        font-size: 11.5px;
        font-weight: 600;
        color: var(--v2-gris-texte);
      }
    `,
  ],
  template: `
    <app-shell perm="producer.read" [area]="t()('producteurs.area')">
      <!-- ───── En-tête ───── -->
      <header class="rise flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div class="min-w-0">
          <p class="mono" style="color: var(--v2-gris-texte)">
            {{ t()("producteurs.index.eyebrow") }}
          </p>
          <h1
            class="mt-2 text-[30px] font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-[38px]"
          >
            {{ t()("producteurs.index.title") }}
          </h1>
          <p class="mt-2 max-w-2xl text-[16px] font-medium" style="color: var(--v2-gris-texte)">
            {{ t()("producteurs.index.lead") }}
          </p>
        </div>
        <span class="ml-auto flex flex-wrap gap-2">
          <button type="button" class="btn btn-ghost" (click)="exportOpen.set(true)">
            <ui-icon name="download" [size]="18" />{{ t()("producteurs.index.exportCsv") }}
          </button>
          @if (store.can("dossier.create")) {
            <button type="button" class="btn btn-primary" (click)="newProducer()">
              {{ t()("producteurs.index.new") }}<span class="btn-chip"><ui-icon name="add" [size]="20" /></span>
            </button>
          }
        </span>
      </header>

      <!-- ───── Statistiques ───── -->
      <ui-stat-cards class="rise mt-8" [stats]="stats()" />

      <!-- ───── Recherche · qualité · filtres ───── -->
      <div class="card mt-6 p-2">
        <div class="toolbar p-0">
          <label class="search">
            <ui-icon name="search" [size]="20" />
            <input
              type="search"
              [placeholder]="t()('producteurs.index.searchPlaceholder')"
              [attr.aria-label]="t()('producteurs.index.searchLabel')"
              [value]="q()"
              (input)="onSearch($any($event.target).value)"
            />
          </label>
          <div class="seg" role="radiogroup" [attr.aria-label]="t()('producteurs.col.quality')">
            @for (qualityButton of qualityButtons(); track qualityButton.id) {
              <button
                type="button"
                role="radio"
                [class.on]="filters().qualite === qualityButton.id"
                [class.has]="qualityButton.count > 0"
                [attr.data-tone]="qualityTone(qualityButton.id)"
                [attr.aria-checked]="filters().qualite === qualityButton.id"
                (click)="setFilter('qualite', qualityButton.id)"
              >
                {{ qualityButton.label
                }}<span class="n" [class.zero]="!qualityButton.count">{{
                  nf.format(qualityButton.count)
                }}</span>
              </button>
            }
          </div>
        </div>
        <div class="filters mt-2">
          <!-- Périmètre : coopérative et campagne (paramètres ?scoop= et ?campagne=) -->
          <app-global-filters [campaign]="true" />
          @for (filter of filterDefs(); track filter.key) {
            <ui-select
              variant="compact"
              [label]="filter.label"
              [leadingIcon]="filter.icon"
              [options]="filter.options"
              [highlight]="isFiltered(filter.key)"
              [value]="filters()[filter.key]"
              (valueChange)="setFilter(filter.key, $event)"
            />
          }
        </div>
      </div>

      <div class="mt-4 flex min-h-6 flex-wrap items-center justify-between gap-3">
        <p class="sub" aria-live="polite">
          {{
            t()(
              total() > 1 ? "producteurs.index.count.autre" : "producteurs.index.count.un",
              { count: nf.format(total()) }
            )
          }}
        </p>
        @if (activeCount() > 0) {
          <button type="button" class="reset" (click)="resetFilters()">
            <ui-icon name="close" [size]="16" />{{ t()("producteurs.index.reset") }} ({{
              activeCount()
            }})
          </button>
        }
      </div>

      <!-- ───── Liste ───── -->
      <section class="card mt-3 overflow-hidden">
        @if (rows().length) {
          <!-- Téléphone : cartes -->
          <ul class="md:hidden">
            @for (producer of pager.items(); track producer.id; let first = $first) {
              <li [style.border-top]="first ? 'none' : '1px solid var(--v2-separateur)'">
                <button
                  type="button"
                  class="row-link flex w-full items-center gap-3 px-4 py-3.5 text-left"
                  (click)="openDetail(producer.id)"
                >
                  @if (producer.photoUrl) {
                    <ui-avatar [src]="producer.photoUrl" [name]="producer.firstName + ' ' + producer.lastName" [size]="36" />
                  } @else {
                    <span class="avatar">{{
                      initials(producer.firstName + " " + producer.lastName)
                    }}</span>
                  }
                  <span class="min-w-0 flex-1">
                    <span class="block truncate font-bold"
                      >{{ producer.firstName }} {{ producer.lastName }}</span
                    >
                    <span class="sub block truncate"
                      >{{ producer.village }} · {{ ageLabel(producer.age) }}</span
                    >
                    @if (handicapState(producer) === "yes") {
                      <span class="badge mt-1" style="background: var(--v2-info-bg); color: var(--v2-info-fg)">{{
                        t()("producteurs.col.handicap")
                      }}</span>
                    }
                    <app-placement-badge [record]="producer" />
                    <app-cni-alert-badge [producerId]="producer.id" />
                  </span>
                  <span
                    class="badge"
                    [style.background]="quality[producer.quality].bg"
                    [style.color]="quality[producer.quality].fg"
                    >{{ t()(quality[producer.quality].label) }}</span
                  >
                </button>
              </li>
            }
          </ul>

          <!-- Tablette et bureau : tableau -->
          <div class="hidden overflow-x-auto md:block">
            <table class="tbl min-w-[980px]">
              <thead>
                <tr>
                  @if (canSelect()) {
                    <th class="w-10">
                      <input
                        type="checkbox"
                        [checked]="allPageSelected()"
                        [attr.aria-label]="t()('transfert.selectPage')"
                        (change)="togglePage($any($event.target).checked)"
                      />
                    </th>
                  }
                  <th>{{ t()("producteurs.index.colProducer") }}</th>
                  <th>{{ t()("producteurs.index.colSexAge") }}</th>
                  <th>{{ t()("producteurs.col.handicap") }}</th>
                  <th>{{ t()("producteurs.col.village") }}</th>
                  <th class="hidden xl:table-cell">{{ t()("producteurs.col.organisation") }}</th>
                  <th class="hidden lg:table-cell">{{ t()("producteurs.col.phone") }}</th>
                  <th>{{ t()("producteurs.col.status") }}</th>
                  <th>{{ t()("producteurs.col.quality") }}</th>
                  @if (store.canSeeSource()) {
                    <th>{{ t()("qualite.source.col") }}</th>
                  }
                  <th class="text-right">{{ t()("producteurs.index.colActions") }}</th>
                </tr>
              </thead>
              <tbody>
                @for (producer of pager.items(); track producer.id) {
                  <tr class="row-link" (click)="openDetail(producer.id)">
                    @if (canSelect()) {
                      <td (click)="$event.stopPropagation()">
                        <input
                          type="checkbox"
                          [checked]="selected().includes(producer.id)"
                          [attr.aria-label]="t()('transfert.selectOne', { name: producer.firstName + ' ' + producer.lastName })"
                          (change)="toggle(producer.id)"
                        />
                      </td>
                    }
                    <td>
                      <span class="flex items-center gap-3">
                        @if (producer.photoUrl) {
                          <ui-avatar [src]="producer.photoUrl" [name]="producer.firstName + ' ' + producer.lastName" [size]="36" />
                        } @else {
                        <span
                          class="avatar"
                          [style.background]="
                            producer.sex === 'F' ? 'var(--v2-culture-bg)' : 'var(--v2-sauge)'
                          "
                          [style.color]="
                            producer.sex === 'F' ? 'var(--v2-culture-fg)' : 'var(--v2-foret)'
                          "
                          >{{ initials(producer.firstName + " " + producer.lastName) }}</span
                        >
                        }
                        <span class="min-w-0">
                          <span class="block truncate font-bold"
                            >{{ producer.firstName }} {{ producer.lastName }}</span
                          >
                          <span class="code block">{{ producer.code }}</span>
                          <app-placement-badge [record]="producer" />
                          <app-cni-alert-badge [producerId]="producer.id" />
                        </span>
                      </span>
                    </td>
                    <td class="whitespace-nowrap font-medium tabular-nums">
                      {{ t()(producer.sex === "F" ? "producteurs.sex.F" : "producteurs.sex.H") }} ·
                      <span [class.zero]="producer.age === null">{{ ageLabel(producer.age) }}</span>
                    </td>
                    <td>
                      @if (handicapState(producer) === "yes") {
                        <span class="badge" style="background: var(--v2-info-bg); color: var(--v2-info-fg)">{{
                          t()("producteurs.handicap.yes")
                        }}</span>
                      } @else if (handicapState(producer) === "no") {
                        <span class="font-medium" style="color: var(--v2-gris-texte)">{{ t()("producteurs.handicap.no") }}</span>
                      } @else {
                        <span class="zero">—</span>
                      }
                    </td>
                    <td class="font-medium">{{ producer.village }}</td>
                    <td
                      class="hidden max-w-56 truncate font-medium xl:table-cell"
                      [class.zero]="!orgName(producer.orgId)"
                    >
                      {{ orgName(producer.orgId) || "—" }}
                    </td>
                    <td
                      class="hidden whitespace-nowrap tabular-nums lg:table-cell"
                      style="color: var(--v2-gris-texte)"
                    >
                      {{ store.phone(producer.phone) }}
                    </td>
                    <td>
                      <span
                        class="badge"
                        [style.background]="status[producer.status].bg"
                        [style.color]="status[producer.status].fg"
                        >{{ t()(status[producer.status].label) }}</span
                      >
                    </td>
                    <td>
                      <span
                        class="badge"
                        [style.background]="quality[producer.quality].bg"
                        [style.color]="quality[producer.quality].fg"
                        >{{ t()(quality[producer.quality].label) }}</span
                      >
                    </td>
                    @if (store.canSeeSource()) {
                      <td><app-source-badge [record]="producer" [showPlace]="true" /></td>
                    }
                    <td>
                      <span class="flex justify-end">
                        <button
                          type="button"
                          class="act"
                          [title]="t()('common.view')"
                          [attr.aria-label]="
                            t()('producteurs.index.view', {
                              name: producer.firstName + ' ' + producer.lastName,
                            })
                          "
                          (click)="$event.stopPropagation(); openDetail(producer.id)"
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
          <ui-empty-state
            [icon]="loadError() ? 'warning' : activeCount() > 0 ? 'search' : 'person'"
            [title]="loadError() ? t()('producteurs.index.loadError') : t()('producteurs.index.empty')"
          >
            @if (loadError()) {
              <button type="button" class="btn btn-primary" (click)="retry()">{{ t()("rapports.api.retry") }}</button>
            } @else if (activeCount() > 0) {
              <button type="button" class="btn btn-ghost" (click)="resetFilters()">{{ t()("producteurs.index.reset") }}</button>
            }
          </ui-empty-state>
        }
      </section>

      <!-- ───── Détail ───── -->
      <ui-detail-modal [view]="detail()" (closed)="detailId.set(null)">
        @if (canTransfer() && detailId(); as openedId) {
          <button detail-actions type="button" class="btn btn-ghost" (click)="detailId.set(null); openTransfer([openedId])">
            <ui-icon name="apartment" [size]="18" />{{ t()("transfert.single") }}
          </button>
        }
      </ui-detail-modal>

      <!-- ───── Actions groupées : transfert vers une coopérative ───── -->
      @if (canSelect() && selected().length) {
        <div class="bulk mt-4" role="region" [attr.aria-label]="t()('transfert.bar.selected', { count: selected().length })">
          <span class="flex-1 text-[14px] font-extrabold">{{ t()("transfert.bar.selected", { count: selected().length }) }}</span>
          @if (selected().length < rows().length) {
            <button type="button" class="b" style="color: var(--v2-blanc)" (click)="selectAllRows()">
              {{ t()("transfert.bar.selectAll", { count: rows().length }) }}
            </button>
          }
          <button type="button" class="b" style="color: var(--v2-blanc)" (click)="selected.set([])">
            {{ t()("transfert.bar.clear") }}
          </button>
          @if (canMove()) {
            <button type="button" class="b" style="background: var(--v2-blanc); color: var(--v2-foret)" (click)="openMove(selected())">
              <ui-icon name="arrow_forward" [size]="16" />{{ t()("deplacer.action") }}
            </button>
          }
          @if (canTransfer()) {
            <button type="button" class="b" style="background: var(--v2-citron); color: var(--v2-foret)" (click)="openTransfer(selected())">
              <ui-icon name="apartment" [size]="16" />{{ t()("transfert.bar.action") }}
            </button>
          }
        </div>
      }
      <app-transfer-scoop-modal
        [request]="transferRequest()"
        (closed)="transferRequest.set(null)"
        (done)="selected.set([])"
      />
      <app-move-to-organisation-modal
        [request]="moveRequest()"
        (closed)="moveRequest.set(null)"
        (done)="selected.set([])"
      />

      <!-- ───── Export ───── -->
      <ui-modal
        [open]="exportOpen()"
        [title]="
          nominatif()
            ? t()('producteurs.index.exportNominatif')
            : t()('producteurs.index.exportAnonymise')
        "
        [description]="exportDesc()"
        icon="download"
        [width]="520"
        [closeLabel]="t()('common.close')"
        (closed)="exportOpen.set(false)"
      >
        <button modal-footer type="button" class="btn btn-ghost" (click)="exportOpen.set(false)">
          {{ t()("producteurs.index.cancel") }}
        </button>
        <button modal-footer type="button" class="btn btn-primary" (click)="doExport()">
          {{ t()("producteurs.index.export") }}
          <span class="btn-chip"><ui-icon name="download" [size]="18" /></span>
        </button>
      </ui-modal>
    </app-shell>
  `,
})
export default class ProducteursPage {
  protected readonly store = inject(StoreService);
  protected readonly locale = inject(LocaleService);
  private readonly snackbar = inject(SnackbarService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly t = this.locale.t;
  protected readonly nf = nf;
  protected readonly maskPhone = maskPhone;
  protected readonly initials = initialsOf;
  protected readonly quality = QUALITY;
  protected readonly status = STATUS;
  private readonly cniAlerts = inject(CniAlertsService);
  /** Pastille rouge « CNI proches » : la liste des fiches signalées vient du serveur, pour qui a le droit de la voir. */
  private readonly _loadCniAlerts = effect(() => {
    if (this.cniAlerts.canView()) untracked(() => void this.cniAlerts.refresh());
  });

  /** Paramètres d'URL de `/dashboard/producteurs/`. */
  private readonly queryState = toSignal(
    this.route.queryParamMap.pipe(map(parseProducteursQuery)),
    { initialValue: parseProducteursQuery(this.route.snapshot.queryParamMap) },
  );

  protected readonly q = signal(this.queryState().q);

  protected readonly exportOpen = signal(false);

  /** Un producteur entre par un dossier : le formulaire de la page Dossiers s'ouvre directement. */
  protected newProducer(): void {
    void this.router.navigate(["/dashboard/dossiers"], { queryParams: { nouveau: 1 } });
  }
  protected readonly filters = signal({
    village: this.queryState().village,
    sexe: this.queryState().sexe,
    handicap: this.queryState().handicap,
    age: this.queryState().age,
    qualite: this.queryState().qualite,
    culture: this.queryState().culture,
    source: this.queryState().source,
  });

  private readonly _syncFromUrl = effect(() => {
    const s = this.queryState();
    this.q.set(s.q);
    this.filters.set({
      village: s.village,
      sexe: s.sexe,
      handicap: s.handicap,
      age: s.age,
      qualite: s.qualite,
      culture: s.culture,
      source: s.source,
    });
  });

  protected readonly nominatif = computed(() => {
    const session = this.store.state().session;
    return session ? can(session, "producer.export_nominatif") : false;
  });

  protected readonly exportDesc = computed(() =>
    this.t()(
      this.nominatif()
        ? "producteurs.index.exportNominatifDesc"
        : "producteurs.index.exportAnonymiseDesc",
      { total: nf.format(this.total()) },
    ),
  );

  /** Filtres secondaires (la qualité est dans la barre à compteurs). */
  protected readonly filterDefs = computed(() => {
    const t = this.t();
    const def = (
      key: Exclude<FilterKey, "qualite">,
      label: string,
      icon: IconName,
      opts: [string, string][],
    ) => ({
      key,
      label,
      icon,
      options: [
        { value: ALL, label: t("producteurs.index.filterAll", { label }) },
        ...opts.map(([value, l]) => ({ value, label: l })),
      ] as SelectOption[],
    });
    // Compteurs par base d'origine (Kobo / Consolidé / Saisie) à côté de chaque choix du filtre « Source ».
    const serverSources = this.serverSources();
    const sourceCounts = this.serverMode
      ? ({
          kobo: serverSources.KOBO,
          consolidee: serverSources.CONSOLIDE,
          application: serverSources.autre,
          cradesc: 0,
        } as Record<DataSourceId, number>)
      : countBySource(
          inScope(
            this.store.state().producers.filter((p) => !p.mergedInto),
            this.store.state().session,
          ),
        );
    const total = Object.values(sourceCounts).reduce((sum, n) => sum + n, 0);
    const withCounts = <T extends { options: SelectOption[] }>(entry: T): T => ({
      ...entry,
      options: entry.options.map((option) => ({
        ...option,
        hint: nf.format(option.value === ALL ? total : (sourceCounts[option.value as DataSourceId] ?? 0)),
      })),
    });
    return [
      def(
        "village",
        t("producteurs.col.village"),
        "location_on",
        VILLAGES.map((v) => [v, v]),
      ),
      def("sexe", t("producteurs.col.sex"), "person", [
        ["F", t("producteurs.sex.F")],
        ["H", t("producteurs.sex.H")],
      ]),
      def("handicap", t("producteurs.col.handicap"), "accessible", [
        ["oui", t("producteurs.handicap.yes")],
        ["non", t("producteurs.handicap.no")],
      ]),
      def(
        "age",
        t("producteurs.col.age"),
        "calendar_today",
        AGE_BANDS.map((a) => [a, t("producteurs.index.ageBand", { band: a })]),
      ),
      def(
        "culture",
        t("producteurs.col.crop"),
        "grass",
        CROPS.map((c) => [c, c]),
      ),
      // Base d'origine enregistrée par le serveur (Kobo, consolidée, saisie dans l'application).
      ...(this.store.canSeeSource()
        ? [
            withCounts(
              def(
                "source",
                t("qualite.source.filter.label"),
                "database",
                SOURCE_FILTER_IDS.map((id) => [id, t(SOURCE_LABEL[id])]),
              ),
            ),
          ]
        : []),
    ];
  });

  /** Base avant le filtre qualité : les compteurs de la barre restent justes quand on change de qualité. */
  private readonly beforeQuality = computed(() => this.filterRows(true));

  protected readonly qualityButtons = computed(() => {
    const t = this.t();
    const serverStats = this.serverMode ? this.serverStats() : null;
    const base = this.serverMode ? [] : this.beforeQuality();
    return [
      { id: ALL, label: t("producteurs.index.qualityAll"), count: serverStats ? serverStats.qualityTotal : base.length },
      ...QUALITIES.map((q) => ({
        id: q,
        label: t(QUALITY[q].label),
        count: serverStats ? (serverStats.byQuality[q] ?? 0) : base.filter((p) => p.quality === q).length,
      })),
    ];
  });

  protected readonly stats = computed<StatCard[]>(() => {
    const t = this.t();
    // Mode API : les totaux viennent du serveur (un seul appel), la page affichée n'en contient qu'une partie.
    const serverStats = this.serverMode ? this.serverStats() : null;
    const rows = this.serverMode ? [] : this.rows();
    const total = serverStats ? serverStats.total : rows.length;
    const n = total || 1;
    const pct = (k: number) => Math.round((k / n) * 100);
    const youthAge = this.store.state().youthMaxAge;
    const members = serverStats ? serverStats.members : rows.filter((p) => p.status === "membre").length;
    const women = serverStats ? serverStats.women : rows.filter((p) => p.sex === "F").length;
    const men = serverStats ? serverStats.men : rows.filter((p) => p.sex === "H").length;
    const youth = serverStats ? serverStats.youth : rows.filter((p) => ageAtMost(p.age, youthAge)).length;
    const validated = serverStats ? serverStats.validated : rows.filter((p) => p.quality === "validé").length;
    const toCheck = serverStats ? serverStats.toCheck : rows.filter((p) => p.quality === "à vérifier").length;
    const handicap = serverStats ? serverStats.handicap : rows.filter((p) => p.handicap).length;
    return [
      {
        label: t("producteurs.index.stat.total"),
        value: nf.format(total),
        sub: t("producteurs.index.stat.totalSub", {
          members: nf.format(members),
          census: nf.format(total - members),
        }),
        icon: "agriculture",
        bg: "",
        fg: "",
      },
      // Hommes et femmes : deux statistiques distinctes (indicateurs de genre demandés par les partenaires).
      {
        label: t("producteurs.index.stat.men"),
        value: nf.format(men),
        sub: t("producteurs.index.stat.shareSub", { pct: pct(men) }),
        icon: "person",
        ...TONE.info,
      },
      {
        label: t("producteurs.index.stat.women"),
        value: nf.format(women),
        sub: t("producteurs.index.stat.shareSub", { pct: pct(women) }),
        icon: "female",
        ...TONE.culture,
      },
      {
        label: t("producteurs.index.stat.youth"),
        value: nf.format(youth),
        sub: t("producteurs.index.stat.youthSub", { age: youthAge, pct: pct(youth) }),
        icon: "grass",
        ...TONE.attente,
      },
      {
        label: t("producteurs.index.stat.handicap"),
        value: nf.format(handicap),
        sub: t("producteurs.index.stat.shareSub", { pct: pct(handicap) }),
        icon: "accessible",
        ...(handicap ? TONE.info : TONE.neutre),
      },
      {
        label: t("producteurs.index.stat.validated"),
        value: `${pct(validated)} %`,
        sub: t("producteurs.index.stat.validatedSub", { count: nf.format(toCheck) }),
        icon: "task_alt",
        ...TONE.succes,
      },
    ];
  });

  /**
   * Handicap d'une fiche : « oui », « non », ou inconnu. La base consolidée n'enregistre pas cette information : « — »
   * plutôt qu'un faux « non ».
   */
  protected handicapState(producer: Producer): "yes" | "no" | "unknown" {
    if (producer.handicap) return "yes";
    return sourceOfRecord(producer).id === "consolidee" ? "unknown" : "no";
  }

  /** Ton d'un bouton de qualité : « à vérifier » en rouge, « doublon » en ambre, « invalide » en rouge clair. */
  protected qualityTone(id: string): string {
    switch (id) {
      case "validé":
        return "ok";
      case "à vérifier":
        return "danger";
      case "doublon":
        return "warn";
      case "invalide":
        return "alert";
      default:
        return "";
    }
  }

  /** Vrai quand ce filtre est actif : son champ change de couleur. */
  protected isFiltered(key: FilterKey): boolean {
    return this.filters()[key] !== ALL;
  }

  protected readonly activeCount = computed(
    () => Object.values(this.filters()).filter((v) => v !== ALL).length,
  );

  // ── Mode API : une page à la fois, filtres et totaux faits par le serveur ──
  protected readonly serverMode = isApiMode();
  private readonly workflow = inject(ProducerWorkflow);
  private readonly serverItems = signal<Producer[]>([]);
  private readonly serverMeta = signal<PageMeta>({ total: 0, page: 1, limit: DEFAULT_PAGE_SIZE, pages: 1 });
  private readonly serverStats = signal<ProducerStats | null>(null);
  private readonly serverSources = signal<ProducerSourceCounts>({ KOBO: 0, CONSOLIDE: 0, autre: 0 });
  protected readonly loading = signal(false);
  /** Échec de lecture (serveur qui redémarre, réseau) : message + « Réessayer », jamais une liste vide muette. */
  protected readonly loadError = signal(false);
  private readonly retryTick = signal(0);
  private retries = 0;
  protected retry(): void {
    this.retries = 0;
    this.retryTick.update((n) => n + 1);
  }
  private requestId = 0;
  private statsRequestId = 0;

  /** Filtres envoyés au serveur (tout ce que la page savait filtrer en mémoire). */
  private readonly serverQuery = computed<ProducerListFilters>(() => {
    const f = this.filters();
    const url = this.queryState();
    const q = this.q().trim();
    const sourceBase = ({ kobo: "KOBO", consolidee: "CONSOLIDE", application: "APPLICATION" } as const)[
      f.source as "kobo" | "consolidee" | "application"
    ];
    return {
      hideMerged: "true",
      youthMaxAge: this.store.state().youthMaxAge,
      ...(q && { q }),
      ...(url.scoop && { scoopId: url.scoop }),
      ...(url.campagne && { campaign: url.campagne }),
      ...(f.village !== ALL && { village: f.village }),
      ...(f.sexe !== ALL && { sex: f.sexe as "F" | "H" }),
      ...(f.handicap !== ALL && { handicap: f.handicap as "oui" | "non" }),
      ...(f.age !== ALL && { ageBand: f.age }),
      ...(f.culture !== ALL && { crop: f.culture }),
      ...(f.qualite !== ALL && { quality: f.qualite }),
      ...(sourceBase && { sourceBase }),
    };
    // Même contenu = même requête : on ne relance pas l'appel quand les filtres sont réécrits à l'identique.
  }, { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) });
  /** Retour en page 1 à chaque changement de filtre ; le clic sur la pagination change la page et relance l'appel. */
  private readonly serverPage = linkedSignal({ source: this.serverQuery, computation: () => 1 });
  private readonly serverLimit = signal(DEFAULT_PAGE_SIZE);

  private readonly _loadServerPage = effect(() => {
    if (!this.serverMode) return;
    const query = this.serverQuery();
    const page = this.serverPage();
    const limit = this.serverLimit();
    this.workflow.refreshTick();
    this.retryTick();
    untracked(() => void this.loadServerPage(query, page, limit));
  });

  private readonly _loadServerStats = effect(() => {
    if (!this.serverMode) return;
    const query = this.serverQuery();
    this.workflow.refreshTick();
    untracked(() => void this.loadServerStats(query));
  });

  private async loadServerPage(query: ProducerListFilters, page: number, limit: number): Promise<void> {
    const request = ++this.requestId;
    this.loading.set(true);
    try {
      const result = await fetchProducersPage({ ...query, page, limit });
      if (request !== this.requestId) return;
      this.loadError.set(false);
      this.retries = 0;
      this.serverItems.set(result.items);
      this.serverMeta.set({ total: result.total, page: result.page, limit: result.limit, pages: result.pages });
      this.serverSources.set(result.sourceCounts);
      // Les fiches de la page rejoignent le store : transfert, déplacement et fiche détaillée les retrouvent.
      actions.upsertProducersFromApi(result.items);
    } catch (error: unknown) {
      console.error("[ERROR][Producteurs.loadServerPage]", error);
      if (request === this.requestId) {
        this.serverItems.set([]);
        this.loadError.set(true);
        // Serveur qui redémarre : trois nouvelles tentatives automatiques, espacées de 3 secondes.
        if (this.retries < 3) {
          this.retries += 1;
          setTimeout(() => this.retryTick.update((n) => n + 1), 3000);
        }
      }
    } finally {
      if (request === this.requestId) this.loading.set(false);
    }
  }

  private async loadServerStats(query: ProducerListFilters): Promise<void> {
    const request = ++this.statsRequestId;
    try {
      const stats = await getProducerStats(query);
      if (request === this.statsRequestId) this.serverStats.set(stats);
    } catch {
      if (request === this.statsRequestId) this.serverStats.set(null);
    }
  }

  /** Lignes de la page affichée (mode API) ou liste filtrée en mémoire (démonstration). */
  protected readonly rows = computed(() => (this.serverMode ? this.serverItems() : this.filterRows(false)));
  protected readonly total = computed(() => (this.serverMode ? this.serverMeta().total : this.rows().length));

  /** Applique recherche, périmètre, en-tête (SCOOP / campagne) et filtres ; `skipQuality` pour les compteurs. */
  private filterRows(skipQuality: boolean) {
    const s = this.store.state();
    const q = this.q().trim().toLowerCase();
    const f = this.filters();
    const url = this.queryState();
    return inScope(
      s.producers.filter((p) => !p.mergedInto),
      s.session,
    ).filter(
      (p) =>
        (!q || `${p.firstName} ${p.lastName} ${p.code}`.toLowerCase().includes(q)) &&
        (!url.scoop || p.scoopId === url.scoop) &&
        (!url.campagne || p.crops.some((c) => c.campaign === url.campagne)) &&
        (f.village === ALL || p.village === f.village) &&
        (f.sexe === ALL || p.sex === f.sexe) &&
        (f.handicap === ALL || (f.handicap === "oui" ? p.handicap : !p.handicap)) &&
        (f.age === ALL || ageBand(p.age) === f.age) &&
        (skipQuality || f.qualite === ALL || p.quality === f.qualite) &&
        (f.culture === ALL || p.crops.some((c) => c.crop === f.culture)) &&
        (f.source === ALL || sourceOfRecord(p).id === f.source),
    );
  }

  /** Pagination : mêmes règles que l'API (`GET /v1/producers?page=&limit=`). */
  protected readonly pager = this.serverMode
    ? createServerPager({ items: this.serverItems, meta: this.serverMeta, page: this.serverPage, limit: this.serverLimit })
    : createPager(() => this.rows());

  // ── Transfert vers une coopérative (mode API, droit `scoop.transfer`) ──
  protected readonly canTransfer = computed(() => isApiMode() && this.store.can("scoop.transfer"));
  // ── Déplacement vers une organisation (mode API, droit `org.manage` ou `scoop.transfer`) ──
  protected readonly canMove = computed(() => isApiMode() && (this.store.can("org.manage") || this.store.can("scoop.transfer")));
  protected readonly canSelect = computed(() => this.canTransfer() || this.canMove());
  protected readonly moveRequest = signal<MoveRequest | null>(null);
  protected readonly selected = signal<string[]>([]);
  protected readonly transferRequest = signal<TransferRequest | null>(null);

  protected readonly allPageSelected = computed(() => {
    const ids = this.pager.items().map((producer) => producer.id);
    return ids.length > 0 && ids.every((id) => this.selected().includes(id));
  });

  protected toggle(id: string): void {
    this.selected.update((list) => (list.includes(id) ? list.filter((item) => item !== id) : [...list, id]));
  }

  protected togglePage(on: boolean): void {
    const ids = this.pager.items().map((producer) => producer.id);
    this.selected.update((list) => (on ? [...new Set([...list, ...ids])] : list.filter((id) => !ids.includes(id))));
  }

  protected selectAllRows(): void {
    this.selected.set(this.rows().map((producer) => producer.id));
  }

  protected openTransfer(ids: string[]): void {
    const chosen = this.store.state().producers.filter((producer) => ids.includes(producer.id));
    if (!chosen.length) return;
    this.transferRequest.set({
      kind: "producers",
      ids: chosen.map((producer) => producer.id),
      labels: chosen.map((producer) => `${producer.firstName} ${producer.lastName} (${producer.code})`),
      fromScoopIds: [...new Set(chosen.map((producer) => producer.scoopId))],
    });
  }

  protected openMove(ids: string[]): void {
    const chosen = this.store.state().producers.filter((producer) => ids.includes(producer.id));
    if (!chosen.length) return;
    this.moveRequest.set({
      kind: "producers",
      ids: chosen.map((producer) => producer.id),
      labels: chosen.map((producer) => `${producer.firstName} ${producer.lastName} (${producer.code})`),
      scoopIds: chosen.map((producer) => producer.scoopId),
      orgIds: chosen.map((producer) => producer.orgId),
    });
  }

  protected ageLabel(age: number | null): string {
    return age === null ? "—" : this.t()("cooperatives.fiche.detail.ageValue", { count: age });
  }

  // ── Détail en modale : la liste reste en place ──
  protected readonly detailId = signal<string | null>(null);

  protected openDetail(id: string): void {
    this.detailId.set(id);
  }

  protected readonly detail = computed<DetailView | null>(() => {
    const id = this.detailId();
    if (!id) return null;
    const s = this.store.state();
    const p = s.producers.find((x) => x.id === id);
    if (!p) return null;
    const t = this.t();
    const plots = s.plots.filter((pl) => pl.producerId === p.id);
    const area = plots.reduce((sum, pl) => sum + (pl.measured || pl.declared || 0), 0);
    const scoop = [...s.scoops, ...s.technicalScoops].find((c) => c.id === p.scoopId);
    const org = this.orgName(p.orgId);
    const crops = [...p.crops].sort((a, b) => b.campaign.localeCompare(a.campaign));
    const q = QUALITY[p.quality];
    const st = STATUS[p.status];
    return {
      title: `${p.firstName} ${p.lastName}`,
      subtitle: [p.code, p.village].filter(Boolean).join(" · "),
      icon: "agriculture",
      image: p.photoUrl ?? null,
      badges: [
        { label: t(st.label), bg: st.bg, fg: st.fg },
        { label: t(q.label), bg: q.bg, fg: q.fg },
      ],
      kpis: [
        detailKpi(t("producteurs.quick.plots"), plots.length, "landscape", TONE.info),
        detailKpi(
          t("producteurs.quick.area"),
          area,
          "square_foot",
          TONE.succes,
          t("producteurs.quick.areaValue", {
            area: area.toLocaleString(this.locale.locale() === "wo" ? "fr-SN" : "fr-FR", {
              maximumFractionDigits: 2,
            }),
          }),
        ),
        detailKpi(t("producteurs.quick.crops"), p.crops.length, "grass", TONE.culture),
      ],
      facts: [
        detailFact(
          t("producteurs.col.sex"),
          t(p.sex === "F" ? "producteurs.sex.F" : "producteurs.sex.H"),
          "person",
        ),
        detailFact(
          t("producteurs.col.age"),
          p.age === null ? null : this.ageLabel(p.age),
          "calendar_today",
        ),
        detailFact(t("producteurs.col.phone"), this.store.phone(p.phone) || null, "call"),
        detailFact(t("producteurs.col.village"), p.village, "location_on"),
        detailFact(t("producteurs.col.organisation"), org || null, "hub"),
        detailFact(t("producteurs.quick.cooperative"), scoop?.name, "apartment"),
        detailFact(t("qualite.source.col"), describeSourceFact(p, t), "database", { wide: true }),
        ...(p.placementAConfirmer
          ? [
              detailFact(
                t("placement.fact"),
                `${t("placement.badge")} · ${p.placementNote || t("placement.noteDefault")}`,
                "help",
                { wide: true, tone: TONE.attente },
              ),
            ]
          : []),
        detailFact(t("producteurs.quick.enumerator"), p.enumerator, "badge"),
        detailFact(
          t("producteurs.quick.createdAt"),
          p.createdAt ? fmtDate(p.createdAt) : null,
          "event_note",
        ),
      ],
      sections: [
        {
          title: t("producteurs.quick.crops"),
          icon: "grass",
          count: crops.length,
          empty: t("producteurs.quick.cropsEmpty"),
          items: crops.slice(0, 8).map((c) => ({
            label: c.crop,
            sub: t("producteurs.quick.cropSub", {
              campaign: c.campaign,
              area: c.area.toLocaleString("fr-FR", { maximumFractionDigits: 2 }),
            }),
            initials: c.crop.slice(0, 2).toUpperCase(),
          })),
          more: Math.max(0, crops.length - 8),
        },
      ],
      link: ["/dashboard/producteurs", p.id],
    };
  });

  protected orgName(orgId: string | null | undefined): string {
    if (!orgId) return "";
    return this.store.state().orgs.find((o) => o.id === orgId)?.name ?? "";
  }

  private patchQuery(patch: Partial<Record<string, string | null>>): void {
    this.pager.setPage(1);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: patch,
      queryParamsHandling: "merge",
      replaceUrl: true,
    });
  }

  protected onSearch(value: string) {
    this.patchQuery({ q: value.trim() ? value : null });
  }

  protected setFilter(key: FilterKey, value: string) {
    this.patchQuery({ [key]: value === ALL ? null : value });
  }

  protected resetFilters() {
    this.patchQuery({
      village: null,
      sexe: null,
      handicap: null,
      age: null,
      qualite: null,
      culture: null,
      source: null,
    });
  }

  /** Export : seul moment où l'on lit toutes les fiches du filtre, et seulement quand on le demande. */
  private async rowsForExport(): Promise<Producer[]> {
    if (!this.serverMode) return this.rows();
    const all: Producer[] = [];
    for (let page = 1; ; page++) {
      const result = await fetchProducersPage({ ...this.serverQuery(), page, limit: MAX_PAGE_SIZE });
      all.push(...result.items);
      if (result.page >= result.pages) return all;
    }
  }

  protected async doExport() {
    let rows: Producer[];
    try {
      rows = await this.rowsForExport();
    } catch {
      this.snackbar.error(`${this.t()("common.exportError")} · ${this.t()("common.exportErrorDesc")}`);
      return;
    }
    const scoops = this.store.state().scoops;
    const nominatif = this.nominatif();
    const head = nominatif
      ? ["Code", "Prénom", "Nom", "Sexe", "Âge", "Village", "SCOOP", "Statut", "Qualité"]
      : ["Code", "Sexe", "Tranche d'âge", "Village", "SCOOP", "Statut", "Qualité"];
    const body = rows.map((p) => {
      const sc = scoops.find((s) => s.id === p.scoopId)?.name ?? "";
      return nominatif
        ? [p.code, p.firstName, p.lastName, p.sex, p.age ?? "", p.village, sc, p.status, p.quality]
        : [p.code, p.sex, ageBand(p.age), p.village, sc, p.status, p.quality];
    });
    try {
      downloadCsv(`producteurs${nominatif ? "_nominatif" : ""}.csv`, [head, ...body]);
    } catch {
      this.snackbar.error(
        `${this.t()("common.exportError")} · ${this.t()("common.exportErrorDesc")}`,
      );
      return;
    }
    actions.audit(
      nominatif ? "Export nominatif" : "Export anonymisé",
      "Producteurs",
      `${rows.length} lignes (CSV)`,
    );
    this.snackbar.success(
      `${this.t()("producteurs.index.exportReady")} · ${this.t()("producteurs.index.exportReadyDesc", { total: this.nf.format(rows.length) })}`,
    );
    this.exportOpen.set(false);
  }
}
