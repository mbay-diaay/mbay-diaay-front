import { Component, computed, effect, inject, signal } from "@angular/core";

import { isApiMode } from "@/lib/api/config";
import {
  cancelMovement,
  createStockLot,
  getCommercialStats,
  listStockLots,
  listStockMovements,
  recordStockMovement,
  type CommercialStatsDto,
  type StockLotDto,
  type StockMovementDto,
} from "@/lib/api/commercial";
import { listOrganisations, type ApiOrganisation } from "@/lib/api/organisations";
import { fetchAllPages, type PageMeta } from "@/lib/api/pagination";
import { expiryState } from "@/lib/commerce";
import { fmtDate, nf } from "@/lib/format";
import { AppShellComponent } from "@shared/app-shell.component";
import { LocaleService } from "@shared/locale.service";
import { createServerPager } from "@shared/pager";
import { StoreService } from "@shared/store.service";
import {
  IconComponent,
  ModalComponent,
  PaginationComponent,
  SelectComponent,
  SnackbarService,
  StatCardsComponent,
  TextFieldComponent,
  TONE,
  UiEmptyComponent,
  UiEmptyStateComponent,
  UiPageHeaderComponent,
  V2_PAGE_STYLES,
  type SelectOption,
  type StatCard,
} from "@shared/ui";

const fcfa = (value: number) => `${nf.format(value)} FCFA`;

type StockRow = {
  id: string;
  item: string;
  unit: string;
  lot: string;
  scoop: string;
  org: string;
  received: number;
  balance: number;
  unitPrice: number;
  value: number;
  supplier: string;
  receivedAt: string;
  expiresAt: string | null;
  expiry: string;
  low: boolean;
};

@Component({
  selector: "app-stocks-page",
  imports: [
    AppShellComponent,
    UiPageHeaderComponent,
    UiEmptyComponent,
    UiEmptyStateComponent,
    StatCardsComponent,
    PaginationComponent,
    IconComponent,
    ModalComponent,
    SelectComponent,
    TextFieldComponent,
  ],
  styles: [V2_PAGE_STYLES],
  template: `
    <app-shell [perm]="perms" [area]="t()('nav.item.stocks')">
      <ui-page-header [title]="t()('nav.item.stocks')" [description]="t()('commercial.stocks.description')">
        @if (store.can("stock.manage")) {
          <button actions type="button" class="btn btn-primary" (click)="openCreate()">
            <span>Nouveau lot</span>
            <span class="btn-chip" aria-hidden="true"><ui-icon name="add" [size]="16" /></span>
          </button>
        }
      </ui-page-header>

      @if (apiMode) {
        <ui-stat-cards class="rise mt-6" [stats]="stats()" />

        <div class="toolbar card mt-6">
          <div class="search">
            <ui-icon name="search" [size]="18" />
            <input
              type="search"
              placeholder="Rechercher un intrant, un lot ou un fournisseur…"
              [value]="q()"
              (input)="onSearch($any($event.target).value)"
            />
          </div>
          @if (scoopFilterOptions().length > 2) {
            <ui-select
              variant="compact"
              leadingIcon="apartment"
              label="Coopérative"
              [options]="scoopFilterOptions()"
              [value]="scoopFilter()"
              [highlight]="!!scoopFilter()"
              (valueChange)="onFilterChange('scoop', $event)"
            />
          }
          <ui-select
            variant="compact"
            label="Catégorie"
            [options]="categoryFilterOptions"
            [value]="categoryFilter()"
            [highlight]="!!categoryFilter()"
            (valueChange)="onFilterChange('category', $event)"
          />
          <ui-select
            variant="compact"
            label="État"
            [options]="alertFilterOptions"
            [value]="alertFilter()"
            [highlight]="!!alertFilter()"
            (valueChange)="onFilterChange('alert', $event)"
          />
          <input
            type="date"
            class="btn btn-ghost"
            style="height: 40px; padding: 0 10px; font-size: 13px; border: 1px solid var(--border)"
            [style.border-color]="fromDateFilter() ? 'var(--brand)' : 'var(--border)'"
            title="Date de réception (du)"
            [value]="fromDateFilter()"
            (change)="onFilterChange('fromDate', $any($event.target).value)"
          />
          <input
            type="date"
            class="btn btn-ghost"
            style="height: 40px; padding: 0 10px; font-size: 13px; border: 1px solid var(--border)"
            [style.border-color]="toDateFilter() ? 'var(--brand)' : 'var(--border)'"
            title="Date de réception (au)"
            [value]="toDateFilter()"
            (change)="onFilterChange('toDate', $any($event.target).value)"
          />
          @if (q() || scoopFilter() || categoryFilter() || alertFilter() || fromDateFilter() || toDateFilter()) {
            <button type="button" class="btn btn-ghost" style="height: 40px; padding: 0 14px; font-size: 13px" (click)="resetFilters()">
              Réinitialiser
            </button>
          }
        </div>

        <section class="card mt-4 overflow-x-auto">
          <table class="tbl">
            <thead>
              <tr>
                <th>{{ t()("apercu.col.item") }}</th>
                <th>{{ t()("apercu.col.lot") }}</th>
                <th>{{ t()("apercu.col.scoop") }}</th>
                <th class="num">{{ t()("apercu.col.received") }}</th>
                <th class="num">{{ t()("apercu.col.balance") }}</th>
                <th class="num">{{ t()("apercu.col.unitPrice") }}</th>
                <th class="num">{{ t()("apercu.col.value") }}</th>
                <th>{{ t()("apercu.col.supplier") }}</th>
                <th>{{ t()("apercu.col.receivedAt") }}</th>
                <th>{{ t()("apercu.col.expires") }}</th>
                @if (store.can("stock.manage")) {
                  <th class="num">Actions</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (row of pager().items(); track row.id) {
                <tr class="cursor-pointer" (click)="openDetail(row)">
                  <td class="font-bold">
                    {{ row.item }}
                    @if (row.low) {
                      <span class="badge" [style.background]="'var(--v2-erreur-bg)'" [style.color]="'var(--v2-erreur-fg)'">{{
                        t()("apercu.low")
                      }}</span>
                    }
                  </td>
                  <td>{{ row.lot }}</td>
                  <td>
                    <span>{{ row.scoop }}</span>
                    @if (row.org) {
                      <span class="sub block text-[12px]">{{ row.org }}</span>
                    }
                  </td>
                  <td class="num">{{ nf.format(row.received) }} {{ row.unit }}</td>
                  <td class="num">{{ nf.format(row.balance) }} {{ row.unit }}</td>
                  <td class="num">{{ fcfa(row.unitPrice) }}</td>
                  <td class="num">{{ fcfa(row.value) }}</td>
                  <td>{{ row.supplier || "—" }}</td>
                  <td>{{ fmtDate(row.receivedAt) }}</td>
                  <td>
                    @if (row.expiresAt) {
                      {{ fmtDate(row.expiresAt) }}
                    }
                    <span class="badge" [style.background]="expiryTone(row.expiry).bg" [style.color]="expiryTone(row.expiry).fg">{{
                      expiryLabel(row.expiry)
                    }}</span>
                  </td>
                  @if (store.can("stock.manage")) {
                    <td class="num">
                      <button
                        type="button"
                        class="btn btn-ghost"
                        style="height: 36px; padding: 0 12px; font-size: 13px"
                        [disabled]="row.balance <= 0"
                        (click)="openMovement(row); $event.stopPropagation()"
                      >
                        Sortie
                      </button>
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
          @if (!pager().items().length && !loading()) {
            <ui-empty-state
              [icon]="q() || scoopFilter() || categoryFilter() || alertFilter() || fromDateFilter() ? 'search' : 'inventory_2'"
              [title]="q() || scoopFilter() || categoryFilter() || alertFilter() || fromDateFilter() ? t()('emptyState.filtered.title') : 'Aucun lot en stock'"
              [description]="q() || scoopFilter() || categoryFilter() || alertFilter() || fromDateFilter() ? t()('emptyState.filtered.description') : 'Enregistrez le premier lot d\u2019intrants reçu : semences, engrais ou pesticides.'"
            >
              @if (!(q() || scoopFilter() || categoryFilter() || alertFilter() || fromDateFilter()) && store.can("stock.manage")) {
                <button type="button" class="btn btn-primary" (click)="openCreate()">
                  <span>Nouveau lot</span>
                  <span class="btn-chip" aria-hidden="true"><ui-icon name="add" [size]="16" /></span>
                </button>
              }
            </ui-empty-state>
          }
          <ui-pagination class="px-5 pb-5" [pager]="pager()" />
        </section>
      } @else {
        <div class="surface">
          <ui-empty>{{ t()("commercial.empty") }}</ui-empty>
        </div>
      }
    </app-shell>

    @if (createOpen()) {
      <ui-modal [open]="createOpen()" title="Enregistrer un lot d'intrant" description="Un lot reçu : semences, engrais ou pesticides, avec son numéro et son seuil d'alerte." icon="inventory_2" tone="brand" (closed)="createOpen.set(false)">
        <div class="grid gap-4">
          <div>
            <p class="lbl mb-2">Coopérative</p>
            <ui-select
              label="Coopérative"
              leadingIcon="apartment"
              [options]="scoopOptions()"
              [value]="formScoopId()"
              (valueChange)="onScoopChange($event)"
            />
          </div>
          <div>
            <p class="lbl mb-2">GIE / Association / Individuel</p>
            <ui-select
              label="GIE / Association / Individuel"
              leadingIcon="group"
              [options]="orgOptions()"
              [value]="formOrgId()"
              (valueChange)="formOrgId.set($event)"
            />
          </div>
          <ui-text-field label="Intrant (semence, engrais…)" placeholder="Ex. : Urée 46%" [value]="formItem()" (valueChange)="formItem.set($event)" />
          <div class="grid items-start gap-4 sm:grid-cols-2">
            <ui-text-field label="Numéro de lot" placeholder="Ex. : LOT-2026-01" [value]="formLot()" (valueChange)="formLot.set($event)" />
            <div>
              <p class="lbl mb-2">Unité</p>
              <ui-select
                label="Unité"
                [options]="unitOptions"
                [value]="formUnit()"
                (valueChange)="formUnit.set($event)"
              />
            </div>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <ui-text-field label="Quantité reçue" type="number" [value]="formQty()" (valueChange)="formQty.set($event)" />
            <ui-text-field label="Prix unitaire (FCFA)" type="number" [value]="formPrice()" (valueChange)="formPrice.set($event)" />
          </div>
          <ui-text-field label="Fournisseur" optional="facultatif" [value]="formSupplier()" (valueChange)="formSupplier.set($event)" />
        </div>
        <div modal-footer class="flex justify-end gap-3">
          <button type="button" class="btn btn-ghost" (click)="createOpen.set(false)">Annuler</button>
          <button type="button" class="btn btn-primary" [disabled]="saving() || !formItem().trim() || !formLot().trim()" (click)="submitCreate()">
            <span>Enregistrer</span>
            <span class="btn-chip" aria-hidden="true"><ui-icon name="arrow_forward" [size]="16" /></span>
          </button>
        </div>
      </ui-modal>
    }

    @if (moveTarget(); as target) {
      <ui-modal [open]="!!target" [title]="'Sortie de stock · ' + target.item" description="Distribution, consommation ou perte : le solde du lot diminue." icon="inventory_2" tone="brand" (closed)="moveTarget.set(null)">
        <div class="grid gap-4">
          <p class="sub">Solde disponible sur le lot {{ target.lot }} : <strong>{{ nf.format(target.balance) }} {{ target.unit }}</strong></p>
          <div>
            <p class="lbl mb-2">Motif de sortie</p>
            <ui-select
              label="Motif de sortie"
              [options]="moveKindOptions"
              [value]="moveKind()"
              (valueChange)="moveKind.set($any($event))"
            />
          </div>
          <ui-text-field label="Quantité" type="number" [value]="moveQty()" (valueChange)="moveQty.set($event)" />
          <ui-text-field label="Note" optional="facultatif" [value]="moveNote()" (valueChange)="moveNote.set($event)" />
        </div>
        <div modal-footer class="flex justify-end gap-3">
          <button type="button" class="btn btn-ghost" (click)="moveTarget.set(null)">Annuler</button>
          <button type="button" class="btn btn-primary" [disabled]="saving() || !(+moveQty() > 0)" (click)="submitMovement()">
            <span>Valider la sortie</span>
            <span class="btn-chip" aria-hidden="true"><ui-icon name="arrow_forward" [size]="16" /></span>
          </button>
        </div>
      </ui-modal>
    }

    @if (detailTarget(); as lot) {
      <ui-modal
        [open]="!!detailTarget()"
        [title]="lot.item + ' · ' + lot.lot"
        [description]="lot.scoop + ' · Solde : ' + nf.format(lot.balance) + ' / ' + nf.format(lot.received) + ' ' + lot.unit"
        icon="inventory_2"
        tone="brand"
        (closed)="detailTarget.set(null)"
      >
        <div class="grid gap-3">
          <p class="lbl">Historique des mouvements</p>
          @if (detailLoading()) {
            <p class="text-[13px]" style="color: var(--ink-2)">Chargement…</p>
          } @else if (detailMovements().length === 0) {
            <p class="text-[13px]" style="color: var(--ink-2)">Aucun mouvement enregistré sur ce lot.</p>
          } @else {
            <div class="grid gap-2">
              @for (movement of detailMovements(); track movement.id) {
                <div class="flex items-start justify-between gap-3 rounded-lg border p-3" style="border-color: var(--border)">
                  <div class="grid gap-1 text-[13px]">
                    <div class="flex items-center gap-2 font-semibold">
                      <span>{{ movement.kind }} · -{{ nf.format(movement.quantity) }} {{ lot.unit }}</span>
                      @if (movement.cancelledAt) {
                        <span class="badge" [style.background]="'var(--v2-erreur-bg)'" [style.color]="'var(--v2-erreur-fg)'">Annulé</span>
                      }
                    </div>
                    <div class="text-[12px]" style="color: var(--ink-2)">
                      {{ fmtDate(movement.createdAt) }} · {{ movement.recordedBy }}
                      @if (movement.memberId) { · Membre : {{ movement.memberId }} }
                    </div>
                    @if (movement.note) {
                      <div class="text-[12px]">{{ movement.note }}</div>
                    }
                    @if (movement.cancelledAt && movement.cancelReason) {
                      <div class="text-[12px]" style="color: var(--v2-erreur-fg)">Motif : {{ movement.cancelReason }}</div>
                    }
                  </div>
                  @if (!movement.cancelledAt && store.can("stock.manage")) {
                    <button
                      type="button"
                      class="btn btn-ghost"
                      style="height: 32px; padding: 0 10px; font-size: 12px"
                      (click)="openCancelMovement(movement)"
                    >
                      Annuler
                    </button>
                  }
                </div>
              }
            </div>
            @if (detailMeta().pages > 1) {
              <div class="flex items-center justify-between pt-2 text-[12px]">
                <button
                  type="button"
                  class="btn btn-ghost"
                  style="height: 32px; padding: 0 10px"
                  [disabled]="detailMeta().page <= 1"
                  (click)="loadLotMovements(lot.id, detailMeta().page - 1)"
                >
                  Précédent
                </button>
                <span>Page {{ detailMeta().page }} / {{ detailMeta().pages }}</span>
                <button
                  type="button"
                  class="btn btn-ghost"
                  style="height: 32px; padding: 0 10px"
                  [disabled]="detailMeta().page >= detailMeta().pages"
                  (click)="loadLotMovements(lot.id, detailMeta().page + 1)"
                >
                  Suivant
                </button>
              </div>
            }
          }
        </div>
        <div modal-footer class="flex justify-end">
          <button type="button" class="btn btn-ghost" (click)="detailTarget.set(null)">Fermer</button>
        </div>
      </ui-modal>
    }

    @if (cancelMovementTarget()) {
      <ui-modal
        [open]="!!cancelMovementTarget()"
        title="Annuler la sortie de stock"
        description="La quantité sera remise dans le solde du lot."
        icon="undo"
        tone="danger"
        (closed)="cancelMovementTarget.set(null)"
      >
        <ui-text-field
          label="Motif obligatoire"
          placeholder="Ex. : Erreur de saisie quantité"
          [value]="cancelMovementReason()"
          (valueChange)="cancelMovementReason.set($event)"
        />
        <div modal-footer class="flex justify-end gap-3">
          <button type="button" class="btn btn-ghost" (click)="cancelMovementTarget.set(null)">Retour</button>
          <button
            type="button"
            class="btn btn-primary"
            [disabled]="saving() || !cancelMovementReason().trim()"
            (click)="submitCancelMovement()"
          >
            {{ saving() ? "Annulation…" : "Confirmer l’annulation" }}
          </button>
        </div>
      </ui-modal>
    }
  `,
})
export default class StocksPage {
  protected readonly store = inject(StoreService);
  private readonly snackbar = inject(SnackbarService);
  protected readonly t = inject(LocaleService).t;
  protected readonly apiMode = isApiMode();
  protected readonly perms = ["stock.read"] as const;
  protected readonly fmtDate = fmtDate;
  protected readonly fcfa = fcfa;
  protected readonly nf = nf;
  private readonly today = new Date().toISOString();
  private readonly scoopName = computed(() => new Map(this.store.state().scoops.map((scoop) => [scoop.id, scoop.name])));

  protected readonly q = signal("");
  protected readonly scoopFilter = signal("");
  protected readonly categoryFilter = signal("");
  protected readonly alertFilter = signal("");
  protected readonly fromDateFilter = signal("");
  protected readonly toDateFilter = signal("");
  protected readonly page = signal(1);
  protected readonly limit = signal(20);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  private readonly apiRows = signal<StockRow[]>([]);
  private readonly apiStats = signal<CommercialStatsDto["stocks"]>(null);
  private readonly apiMeta = signal<PageMeta>({ total: 0, page: 1, limit: 20, pages: 1 });
  private readonly reloadTick = signal(0);

  protected readonly createOpen = signal(false);
  protected readonly formScoopId = signal("");
  protected readonly formOrgId = signal("");
  protected readonly scoopOrgs = signal<ApiOrganisation[]>([]);
  protected readonly loadingOrgs = signal(false);
  protected readonly formItem = signal("");
  protected readonly formLot = signal("");
  protected readonly formUnit = signal("sac");
  protected readonly formQty = signal("10");
  protected readonly formPrice = signal("15000");
  protected readonly formSupplier = signal("");

  protected readonly moveTarget = signal<StockRow | null>(null);
  protected readonly moveKind = signal<"distribution" | "consommation" | "perte">("distribution");
  protected readonly moveQty = signal("1");
  protected readonly moveNote = signal("");

  protected readonly detailTarget = signal<StockRow | null>(null);
  protected readonly detailMovements = signal<StockMovementDto[]>([]);
  protected readonly detailMeta = signal<PageMeta>({ total: 0, page: 1, limit: 10, pages: 1 });
  protected readonly detailLoading = signal(false);
  protected readonly cancelMovementTarget = signal<StockMovementDto | null>(null);
  protected readonly cancelMovementReason = signal("");

  protected readonly scoopOptions = computed<SelectOption[]>(() =>
    this.store.state().scoops.map((s) => ({ value: s.id, label: s.name })),
  );
  protected readonly scoopFilterOptions = computed<SelectOption[]>(() => [
    { value: "", label: "Toutes les coopératives" },
    ...this.scoopOptions(),
  ]);
  protected readonly categoryFilterOptions: SelectOption[] = [
    { value: "", label: "Toutes catégories" },
    { value: "semences", label: "Semences" },
    { value: "engrais", label: "Engrais" },
    { value: "pesticides", label: "Pesticides" },
    { value: "autre", label: "Autre" },
  ];
  protected readonly alertFilterOptions: SelectOption[] = [
    { value: "", label: "Tous les états" },
    { value: "low", label: "Stock bas" },
    { value: "expiring", label: "Péremption proche" },
  ];
  protected readonly orgOptions = computed<SelectOption[]>(() => [
    { value: "", label: this.loadingOrgs() ? "Chargement des groupements…" : "Toute la coopérative (tous groupes)" },
    ...this.scoopOrgs().map((o) => ({
      value: o.id,
      label: o.type ? `${o.name} (${o.type})` : o.name,
    })),
  ]);
  protected readonly unitOptions: SelectOption[] = [
    { value: "sac", label: "Sac" },
    { value: "kg", label: "kg" },
    { value: "litre", label: "Litre" },
    { value: "unite", label: "Unité" },
  ];
  protected readonly moveKindOptions: SelectOption[] = [
    { value: "distribution", label: "Distribution à un membre" },
    { value: "consommation", label: "Consommation interne" },
    { value: "perte", label: "Perte / avarie" },
  ];

  constructor() {
    effect(() => {
      if (!this.apiMode) return;
      const page = this.page();
      const limit = this.limit();
      const q = this.q();
      const scoopId = this.scoopFilter();
      const category = this.categoryFilter();
      const alert = this.alertFilter();
      const fromDate = this.fromDateFilter();
      const toDate = this.toDateFilter();
      this.reloadTick();
      void this.loadApi(page, limit, q, scoopId, category, alert, fromDate, toDate);
    });
    effect(() => {
      if (!this.apiMode) return;
      const q = this.q();
      const scoopId = this.scoopFilter();
      const category = this.categoryFilter();
      const alert = this.alertFilter();
      const fromDate = this.fromDateFilter();
      const toDate = this.toDateFilter();
      this.reloadTick();
      void getCommercialStats({
        q: q || undefined,
        scoopId: scoopId || undefined,
        category: category || undefined,
        alert: alert || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      })
        .then((res) => this.apiStats.set(res.stocks))
        .catch(() => this.apiStats.set(null));
    });
  }

  private async loadApi(
    page: number,
    limit: number,
    q: string,
    scoopId: string,
    category: string,
    alert: string,
    fromDate: string,
    toDate: string,
  ) {
    this.loading.set(true);
    try {
      const res = await listStockLots({
        page,
        limit,
        q,
        scoopId: scoopId || undefined,
        category: category || undefined,
        alert: alert || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      });
      this.apiMeta.set({ total: res.total, page: res.page, limit: res.limit, pages: res.pages });
      this.apiRows.set(res.items.map((lot) => this.mapApiLot(lot)));
    } finally {
      this.loading.set(false);
    }
  }

  private mapApiLot(lot: StockLotDto): StockRow {
    const expiry = expiryState({ expiresAt: lot.expiresAt } as never, this.today);
    return {
      id: lot.id,
      item: lot.itemName,
      unit: lot.unit,
      lot: lot.lotNumber,
      scoop: this.scoopName().get(lot.scoopId) ?? lot.scoopId,
      org: lot.organisationName || "",
      received: lot.receivedQty,
      balance: lot.remainingQty,
      unitPrice: lot.unitPriceFcfa,
      value: Math.round(lot.remainingQty * lot.unitPriceFcfa),
      supplier: lot.supplier,
      receivedAt: lot.receivedAt,
      expiresAt: lot.expiresAt,
      expiry,
      low: lot.alertThreshold > 0 && lot.remainingQty <= lot.alertThreshold,
    };
  }

  private readonly serverPager = createServerPager({
    items: this.apiRows,
    meta: this.apiMeta,
    page: this.page,
    limit: this.limit,
  });

  protected readonly pager = computed(() => this.serverPager);

  protected readonly stats = computed<StatCard[]>(() => {
    const summary = this.apiStats();
    const lowCount = summary?.lowStockCount ?? 0;
    const t = this.t();
    return [
      { label: t("apercu.stocks.items"), value: nf.format(summary?.totalLots ?? this.apiMeta().total), sub: "", icon: "inventory_2", bg: "", fg: "" },
      { label: t("apercu.stocks.lots"), value: nf.format(summary?.activeLots ?? 0), sub: "", icon: "task_alt", ...TONE.info },
      { label: t("apercu.stocks.value"), value: fcfa(summary?.totalValueFcfa ?? 0), sub: "", icon: "payments", ...TONE.succes },
      { label: t("apercu.stocks.low"), value: nf.format(lowCount), sub: summary?.expiringCount ? `${summary.expiringCount} expirent bientôt` : "", icon: "warning", ...(lowCount ? TONE.erreur : TONE.neutre) },
    ];
  });

  protected onSearch(value: string) {
    this.q.set(value);
    this.page.set(1);
  }

  protected onFilterChange(kind: "scoop" | "category" | "alert" | "fromDate" | "toDate", value: string) {
    if (kind === "scoop") this.scoopFilter.set(value);
    else if (kind === "category") this.categoryFilter.set(value);
    else if (kind === "alert") this.alertFilter.set(value);
    else if (kind === "fromDate") this.fromDateFilter.set(value);
    else this.toDateFilter.set(value);
    this.page.set(1);
  }

  protected resetFilters() {
    this.q.set("");
    this.scoopFilter.set("");
    this.categoryFilter.set("");
    this.alertFilter.set("");
    this.fromDateFilter.set("");
    this.toDateFilter.set("");
    this.page.set(1);
  }

  protected onScoopChange(scoopId: string) {
    this.formScoopId.set(scoopId);
    this.formOrgId.set("");
    if (scoopId) void this.loadOrgsForScoop(scoopId);
  }

  private async loadOrgsForScoop(scoopId: string) {
    this.loadingOrgs.set(true);
    try {
      const items = await fetchAllPages((query) => listOrganisations({ scoopId, ...query }));
      if (this.formScoopId() === scoopId) this.scoopOrgs.set(items);
    } finally {
      this.loadingOrgs.set(false);
    }
  }

  protected openCreate() {
    const firstScoopId = this.store.state().scoops[0]?.id ?? "";
    this.formScoopId.set(firstScoopId);
    this.formOrgId.set("");
    this.scoopOrgs.set([]);
    if (firstScoopId) void this.loadOrgsForScoop(firstScoopId);
    this.formItem.set("");
    this.formLot.set("");
    this.createOpen.set(true);
  }

  protected async submitCreate() {
    if (this.saving()) return;
    this.saving.set(true);
    try {
      const org = this.scoopOrgs().find((o) => o.id === this.formOrgId());
      await createStockLot({
        scoopId: this.formScoopId(),
        organisationId: org?.id || undefined,
        organisationName: org ? (org.type ? `${org.name} (${org.type})` : org.name) : undefined,
        itemName: this.formItem().trim(),
        lotNumber: this.formLot().trim(),
        unit: this.formUnit(),
        receivedQty: Number(this.formQty()),
        unitPriceFcfa: Math.round(Number(this.formPrice())),
        supplier: this.formSupplier().trim() || undefined,
        receivedAt: new Date().toISOString().slice(0, 10),
      });
      this.createOpen.set(false);
      this.reloadTick.update((v) => v + 1);
      this.snackbar.success("Lot de stock enregistré.");
    } finally {
      this.saving.set(false);
    }
  }

  protected openMovement(row: StockRow) {
    this.moveQty.set("1");
    this.moveNote.set("");
    this.moveTarget.set(row);
  }

  protected async submitMovement() {
    const target = this.moveTarget();
    if (!target || this.saving()) return;
    this.saving.set(true);
    try {
      await recordStockMovement(target.id, {
        kind: this.moveKind(),
        quantity: Number(this.moveQty()),
        note: this.moveNote().trim() || undefined,
      });
      this.moveTarget.set(null);
      this.reloadTick.update((v) => v + 1);
      this.snackbar.success("Mouvement de stock enregistré.");
    } finally {
      this.saving.set(false);
    }
  }

  protected expiryLabel(state: string): string {
    return this.t()(`apercu.expiry.${state}` as "apercu.expiry.ok");
  }

  protected expiryTone(state: string) {
    return state === "expired" ? TONE.erreur : state === "soon" ? TONE.attente : state === "ok" ? TONE.succes : TONE.neutre;
  }

  protected openDetail(row: StockRow) {
    this.detailTarget.set(row);
    void this.loadLotMovements(row.id, 1);
  }

  protected async loadLotMovements(lotId: string, page: number) {
    this.detailLoading.set(true);
    try {
      const res = await listStockMovements(lotId, { page, limit: 10 });
      this.detailMovements.set(res.items);
      this.detailMeta.set({ total: res.total, page: res.page, limit: res.limit, pages: res.pages });
    } finally {
      this.detailLoading.set(false);
    }
  }

  protected openCancelMovement(movement: StockMovementDto) {
    this.cancelMovementReason.set("");
    this.cancelMovementTarget.set(movement);
  }

  protected async submitCancelMovement() {
    const target = this.cancelMovementTarget();
    const lot = this.detailTarget();
    if (!target || !this.cancelMovementReason().trim() || this.saving()) return;
    this.saving.set(true);
    try {
      await cancelMovement(target.id, this.cancelMovementReason().trim());
      this.cancelMovementTarget.set(null);
      this.reloadTick.update((v) => v + 1);
      if (lot) await this.loadLotMovements(lot.id, this.detailMeta().page);
      this.snackbar.info("Sortie de stock annulée.");
    } finally {
      this.saving.set(false);
    }
  }
}
