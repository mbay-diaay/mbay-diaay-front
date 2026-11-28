import { Component, computed, effect, inject, signal } from "@angular/core";

import { isApiMode } from "@/lib/api/config";
import {
  cancelSale,
  createSale,
  getCommercialStats,
  listSalePayments,
  listSales,
  recordSalePayment,
  type CommercialStatsDto,
  type SaleDto,
  type SalePaymentDto,
} from "@/lib/api/commercial";
import type { PageMeta } from "@/lib/api/pagination";
import { fmtDate, nf } from "@/lib/format";
import { AppShellComponent } from "@shared/app-shell.component";
import { LocaleService } from "@shared/locale.service";
import { createServerPager } from "@shared/pager";
import { StoreService } from "@shared/store.service";
import {
  IconComponent,
  ModalComponent,
  PaginationComponent,
  ProducerSelectComponent,
  SelectComponent,
  SnackbarService,
  StatCardsComponent,
  TextFieldComponent,
  TONE,
  UiEmptyComponent,
  UiEmptyStateComponent,
  UiPageHeaderComponent,
  V2_PAGE_STYLES,
  type ProducerSelection,
  type SelectOption,
  type StatCard,
} from "@shared/ui";

const fcfa = (value: number) => `${nf.format(value)} FCFA`;

type SaleRow = {
  id: string;
  date: string;
  producer: string;
  scoop: string;
  crop: string;
  quantityKg: number;
  pricePerKg: number;
  total: number;
  paid: number;
  payment: string;
  buyer: string;
  campaign: string;
  cancelledAt: string | null;
  cancelReason: string | null;
};

@Component({
  selector: "app-ventes-page",
  imports: [
    AppShellComponent,
    UiPageHeaderComponent,
    UiEmptyComponent,
    UiEmptyStateComponent,
    StatCardsComponent,
    PaginationComponent,
    IconComponent,
    ModalComponent,
    ProducerSelectComponent,
    SelectComponent,
    TextFieldComponent,
  ],
  styles: [V2_PAGE_STYLES],
  template: `
    <app-shell [perm]="perms" [area]="t()('nav.item.ventes')">
      <ui-page-header [title]="t()('nav.item.ventes')" [description]="t()('commercial.ventes.description')">
        @if (store.can("sales.manage")) {
          <button actions type="button" class="btn btn-primary" (click)="openCreate()">
            <span>Nouvelle vente</span>
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
              placeholder="Rechercher un producteur, une culture ou un acheteur…"
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
            label="Paiement"
            [options]="paymentFilterOptions"
            [value]="paymentFilter()"
            [highlight]="!!paymentFilter()"
            (valueChange)="onFilterChange('payment', $event)"
          />
          <ui-select
            variant="compact"
            label="Canal"
            [options]="channelFilterOptions"
            [value]="channelFilter()"
            [highlight]="!!channelFilter()"
            (valueChange)="onFilterChange('channel', $event)"
          />
          <input
            type="text"
            class="btn btn-ghost"
            style="height: 40px; width: 130px; padding: 0 10px; font-size: 13px; border: 1px solid var(--border); text-align: left"
            [style.border-color]="cropFilter() ? 'var(--brand)' : 'var(--border)'"
            placeholder="Culture…"
            [value]="cropFilter()"
            (input)="onFilterChange('crop', $any($event.target).value)"
          />
          <input
            type="text"
            class="btn btn-ghost"
            style="height: 40px; width: 130px; padding: 0 10px; font-size: 13px; border: 1px solid var(--border); text-align: left"
            [style.border-color]="campaignFilter() ? 'var(--brand)' : 'var(--border)'"
            placeholder="Campagne…"
            [value]="campaignFilter()"
            (input)="onFilterChange('campaign', $any($event.target).value)"
          />
          <input
            type="date"
            class="btn btn-ghost"
            style="height: 40px; padding: 0 10px; font-size: 13px; border: 1px solid var(--border)"
            [style.border-color]="fromDateFilter() ? 'var(--brand)' : 'var(--border)'"
            title="Date de vente (du)"
            [value]="fromDateFilter()"
            (change)="onFilterChange('fromDate', $any($event.target).value)"
          />
          <input
            type="date"
            class="btn btn-ghost"
            style="height: 40px; padding: 0 10px; font-size: 13px; border: 1px solid var(--border)"
            [style.border-color]="toDateFilter() ? 'var(--brand)' : 'var(--border)'"
            title="Date de vente (au)"
            [value]="toDateFilter()"
            (change)="onFilterChange('toDate', $any($event.target).value)"
          />
          @if (q() || scoopFilter() || paymentFilter() || channelFilter() || cropFilter() || campaignFilter() || fromDateFilter() || toDateFilter()) {
            <button type="button" class="btn btn-ghost" style="height: 40px; padding: 0 14px; font-size: 13px" (click)="resetFilters()">
              Réinitialiser
            </button>
          }
        </div>

        <section class="card mt-4 overflow-x-auto">
          <table class="tbl">
            <thead>
              <tr>
                <th>{{ t()("apercu.col.date") }}</th>
                <th>{{ t()("apercu.col.producer") }}</th>
                <th>{{ t()("apercu.col.scoop") }}</th>
                <th>{{ t()("apercu.col.crop") }}</th>
                <th class="num">{{ t()("apercu.col.quantity") }}</th>
                <th class="num">{{ t()("apercu.col.pricePerKg") }}</th>
                <th class="num">{{ t()("apercu.col.total") }}</th>
                <th class="num">{{ t()("apercu.col.paid") }}</th>
                <th>{{ t()("apercu.col.payment") }}</th>
                <th>{{ t()("apercu.col.buyer") }}</th>
                <th>{{ t()("apercu.col.campaign") }}</th>
                @if (store.can("sales.manage")) {
                  <th class="num">Actions</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (row of pager().items(); track row.id) {
                <tr class="cursor-pointer" (click)="openDetail(row)">
                  <td>{{ fmtDate(row.date) }}</td>
                  <td class="font-bold">{{ row.producer }}</td>
                  <td>{{ row.scoop }}</td>
                  <td>{{ row.crop }}</td>
                  <td class="num">{{ nf.format(row.quantityKg) }}</td>
                  <td class="num">{{ fcfa(row.pricePerKg) }}</td>
                  <td class="num">{{ fcfa(row.total) }}</td>
                  <td class="num">{{ fcfa(row.paid) }}</td>
                  <td>
                    @if (row.cancelledAt) {
                      <span class="badge" [style.background]="'var(--v2-erreur-bg)'" [style.color]="'var(--v2-erreur-fg)'">Annulée</span>
                    } @else {
                      <span class="badge" [style.background]="paymentTone(row.payment).bg" [style.color]="paymentTone(row.payment).fg">{{
                        row.payment
                      }}</span>
                    }
                  </td>
                  <td>{{ row.buyer || "—" }}</td>
                  <td>{{ row.campaign || "—" }}</td>
                  @if (store.can("sales.manage")) {
                    <td class="num">
                      <div class="inline-flex items-center gap-2">
                        <button
                          type="button"
                          class="btn btn-ghost"
                          style="height: 36px; padding: 0 12px; font-size: 13px"
                          [disabled]="!!row.cancelledAt || row.paid >= row.total"
                          (click)="openPay(row); $event.stopPropagation()"
                        >
                          Encaisser
                        </button>
                        <button
                          type="button"
                          class="btn btn-ghost"
                          style="height: 36px; padding: 0 12px; font-size: 13px"
                          [disabled]="!!row.cancelledAt"
                          (click)="openCancel(row); $event.stopPropagation()"
                        >
                          Annuler
                        </button>
                      </div>
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
          @if (!pager().items().length && !loading()) {
            <ui-empty-state
              [icon]="q() ? 'search' : 'storefront'"
              [title]="q() ? t()('emptyState.filtered.title') : 'Aucune vente enregistrée'"
              [description]="q() ? t()('emptyState.filtered.description') : 'Enregistrez la première vente d\u2019un producteur pour suivre les encaissements.'"
            >
              @if (!(q()) && store.can("sales.manage")) {
                <button type="button" class="btn btn-primary" (click)="openCreate()">
                  <span>Nouvelle vente</span>
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
      <ui-modal [open]="createOpen()" title="Enregistrer une vente" description="Producteur, produit, quantité et prix : le total et le paiement se calculent." icon="storefront" tone="brand" (closed)="createOpen.set(false)">
        <div class="grid gap-4">
          <ui-producer-select
            label="Producteur"
            [scoopId]="scoopFilter() || undefined"
            [selected]="selectedProducer()"
            (selectedChange)="selectedProducer.set($event)"
          />
          <div class="grid gap-4 sm:grid-cols-2">
            <ui-text-field label="Culture" placeholder="Ex. : Oignon" [value]="formCrop()" (valueChange)="formCrop.set($event)" />
            <ui-text-field label="Campagne" placeholder="Ex. : 2026-2027" optional="facultatif" [value]="formCampaign()" (valueChange)="formCampaign.set($event)" />
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <ui-text-field label="Quantité (kg)" type="number" [value]="formQty()" (valueChange)="formQty.set($event)" />
            <ui-text-field label="Prix au kg (FCFA)" type="number" [value]="formPrice()" (valueChange)="formPrice.set($event)" />
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <ui-text-field label="Montant encaissé (FCFA)" type="number" [value]="formPaid()" (valueChange)="formPaid.set($event)" />
            <ui-text-field label="Acheteur" optional="facultatif" [value]="formBuyer()" (valueChange)="formBuyer.set($event)" />
          </div>
        </div>
        <div modal-footer class="flex justify-end gap-3">
          <button type="button" class="btn btn-ghost" (click)="createOpen.set(false)">Annuler</button>
          <button type="button" class="btn btn-primary" [disabled]="saving() || !formCrop().trim() || !(+formQty() > 0)" (click)="submitCreate()">
            <span>Enregistrer la vente</span>
            <span class="btn-chip" aria-hidden="true"><ui-icon name="arrow_forward" [size]="16" /></span>
          </button>
        </div>
      </ui-modal>
    }

    @if (payTarget(); as target) {
      <ui-modal
        [open]="!!target"
        [title]="'Encaisser · ' + target.producer"
        [description]="target.crop + ' · Reste à encaisser : ' + fcfa(Math.max(0, target.total - target.paid))"
        icon="payments"
        tone="brand"
        (closed)="payTarget.set(null)"
      >
        <div class="grid gap-4">
          <ui-text-field label="Montant encaissé (FCFA)" type="number" [value]="payAmount()" (valueChange)="payAmount.set($event)" />
          <ui-text-field label="Date d’encaissement" type="date" [value]="payDate()" (valueChange)="payDate.set($event)" />
          <ui-text-field label="Note" optional="facultatif" [value]="payNote()" (valueChange)="payNote.set($event)" />
        </div>
        <div modal-footer class="flex justify-end gap-3">
          <button type="button" class="btn btn-ghost" (click)="payTarget.set(null)">Annuler</button>
          <button type="button" class="btn btn-primary" [disabled]="saving() || !(+payAmount() > 0)" (click)="submitPay()">
            <span>Valider l’encaissement</span>
            <span class="btn-chip" aria-hidden="true"><ui-icon name="arrow_forward" [size]="16" /></span>
          </button>
        </div>
      </ui-modal>
    }

    @if (cancelTarget(); as target) {
      <ui-modal
        [open]="!!target"
        [title]="'Annuler la vente · ' + target.producer"
        description="La vente reste visible en historique avec son motif d’annulation."
        icon="undo"
        tone="danger"
        (closed)="cancelTarget.set(null)"
      >
        <ui-text-field
          label="Motif obligatoire"
          placeholder="Ex. : Erreur de saisie ou doublon"
          [value]="cancelReason()"
          (valueChange)="cancelReason.set($event)"
        />
        <div modal-footer class="flex justify-end gap-3">
          <button type="button" class="btn btn-ghost" (click)="cancelTarget.set(null)">Retour</button>
          <button
            type="button"
            class="btn btn-primary"
            [disabled]="saving() || !cancelReason().trim()"
            (click)="submitCancel()"
          >
            {{ saving() ? "Annulation…" : "Confirmer l’annulation" }}
          </button>
        </div>
      </ui-modal>
    }

    @if (detailTarget(); as sale) {
      <ui-modal
        [open]="!!detailTarget()"
        [title]="'Vente · ' + sale.producer"
        [description]="sale.crop + ' · ' + nf.format(sale.quantityKg) + ' kg · ' + fcfa(sale.total)"
        icon="storefront"
        tone="brand"
        (closed)="detailTarget.set(null)"
      >
        <div class="grid gap-3">
          @if (sale.cancelledAt && sale.cancelReason) {
            <div class="rounded-lg border p-3 text-[13px]" style="border-color: var(--border); color: var(--v2-erreur-fg)">
              Vente annulée · Motif : {{ sale.cancelReason }}
            </div>
          }
          <p class="lbl">Historique des encaissements</p>
          @if (detailLoading()) {
            <p class="text-[13px]" style="color: var(--ink-2)">Chargement…</p>
          } @else if (detailPayments().length === 0) {
            <p class="text-[13px]" style="color: var(--ink-2)">Aucun encaissement complémentaire enregistré.</p>
          } @else {
            <div class="grid gap-2">
              @for (payment of detailPayments(); track payment.id) {
                <div class="grid gap-1 rounded-lg border p-3 text-[13px]" style="border-color: var(--border)">
                  <div class="font-semibold">{{ fcfa(payment.amountFcfa) }}</div>
                  <div class="text-[12px]" style="color: var(--ink-2)">
                    {{ fmtDate(payment.paidAt) }} · {{ payment.recordedBy }}
                  </div>
                  @if (payment.note) {
                    <div class="text-[12px]">{{ payment.note }}</div>
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
                  (click)="loadSalePayments(sale.id, detailMeta().page - 1)"
                >
                  Précédent
                </button>
                <span>Page {{ detailMeta().page }} / {{ detailMeta().pages }}</span>
                <button
                  type="button"
                  class="btn btn-ghost"
                  style="height: 32px; padding: 0 10px"
                  [disabled]="detailMeta().page >= detailMeta().pages"
                  (click)="loadSalePayments(sale.id, detailMeta().page + 1)"
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
  `,
})
export default class VentesPage {
  protected readonly store = inject(StoreService);
  private readonly snackbar = inject(SnackbarService);
  protected readonly t = inject(LocaleService).t;
  protected readonly apiMode = isApiMode();
  protected readonly perms = ["sales.read"] as const;
  protected readonly fmtDate = fmtDate;
  protected readonly fcfa = fcfa;
  protected readonly nf = nf;
  private readonly scoopName = computed(() => new Map(this.store.state().scoops.map((scoop) => [scoop.id, scoop.name])));

  protected readonly q = signal("");
  protected readonly scoopFilter = signal("");
  protected readonly paymentFilter = signal("");
  protected readonly channelFilter = signal("");
  protected readonly cropFilter = signal("");
  protected readonly campaignFilter = signal("");
  protected readonly fromDateFilter = signal("");
  protected readonly toDateFilter = signal("");
  protected readonly page = signal(1);
  protected readonly limit = signal(20);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  private readonly apiRows = signal<SaleRow[]>([]);
  private readonly apiStats = signal<CommercialStatsDto["sales"]>(null);
  private readonly apiMeta = signal<PageMeta>({ total: 0, page: 1, limit: 20, pages: 1 });
  private readonly reloadTick = signal(0);

  protected readonly createOpen = signal(false);
  protected readonly selectedProducer = signal<ProducerSelection | null>(null);
  protected readonly formCrop = signal("");
  protected readonly formCampaign = signal("");
  protected readonly formQty = signal("100");
  protected readonly formPrice = signal("350");
  protected readonly formPaid = signal("35000");
  protected readonly formBuyer = signal("");
  protected readonly Math = Math;

  protected readonly payTarget = signal<SaleRow | null>(null);
  protected readonly payAmount = signal("");
  protected readonly payDate = signal(new Date().toISOString().slice(0, 10));
  protected readonly payNote = signal("");

  protected readonly cancelTarget = signal<SaleRow | null>(null);
  protected readonly cancelReason = signal("");

  protected readonly detailTarget = signal<SaleRow | null>(null);
  protected readonly detailPayments = signal<SalePaymentDto[]>([]);
  protected readonly detailMeta = signal<PageMeta>({ total: 0, page: 1, limit: 10, pages: 1 });
  protected readonly detailLoading = signal(false);

  protected readonly scoopFilterOptions = computed<SelectOption[]>(() => [
    { value: "", label: "Toutes les coopératives" },
    ...this.store.state().scoops.map((s) => ({ value: s.id, label: s.name })),
  ]);
  protected readonly paymentFilterOptions: SelectOption[] = [
    { value: "", label: "Tous les paiements" },
    { value: "payé", label: "Payé" },
    { value: "partiel", label: "Partiel" },
    { value: "impayé", label: "Impayé" },
  ];

  protected readonly channelFilterOptions: SelectOption[] = [
    { value: "", label: "Tous les canaux" },
    { value: "local", label: "Local" },
    { value: "dakar", label: "Dakar" },
    { value: "export", label: "Export" },
    { value: "autre", label: "Autre" },
  ];

  constructor() {
    effect(() => {
      if (!this.apiMode) return;
      const page = this.page();
      const limit = this.limit();
      const q = this.q();
      const scoopId = this.scoopFilter();
      const paymentStatus = this.paymentFilter();
      const channel = this.channelFilter();
      const crop = this.cropFilter();
      const campaign = this.campaignFilter();
      const fromDate = this.fromDateFilter();
      const toDate = this.toDateFilter();
      this.reloadTick();
      void this.loadApi(page, limit, q, scoopId, paymentStatus, channel, crop, campaign, fromDate, toDate);
    });
    effect(() => {
      if (!this.apiMode) return;
      const q = this.q();
      const scoopId = this.scoopFilter();
      const paymentStatus = this.paymentFilter();
      const channel = this.channelFilter();
      const crop = this.cropFilter();
      const campaign = this.campaignFilter();
      const fromDate = this.fromDateFilter();
      const toDate = this.toDateFilter();
      this.reloadTick();
      void getCommercialStats({
        q: q || undefined,
        scoopId: scoopId || undefined,
        paymentStatus: paymentStatus || undefined,
        channel: channel || undefined,
        crop: crop || undefined,
        campaign: campaign || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      })
        .then((res) => this.apiStats.set(res.sales))
        .catch(() => this.apiStats.set(null));
    });
  }

  private async loadApi(
    page: number,
    limit: number,
    q: string,
    scoopId: string,
    paymentStatus: string,
    channel: string,
    crop: string,
    campaign: string,
    fromDate: string,
    toDate: string,
  ) {
    this.loading.set(true);
    try {
      const res = await listSales({
        page,
        limit,
        q,
        scoopId: scoopId || undefined,
        paymentStatus: paymentStatus || undefined,
        channel: channel || undefined,
        crop: crop || undefined,
        campaign: campaign || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      });
      this.apiMeta.set({ total: res.total, page: res.page, limit: res.limit, pages: res.pages });
      this.apiRows.set(res.items.map((s) => this.mapApiSale(s)));
    } finally {
      this.loading.set(false);
    }
  }

  private mapApiSale(s: SaleDto): SaleRow {
    return {
      id: s.id,
      date: s.saleDate,
      producer: s.producerName,
      scoop: this.scoopName().get(s.scoopId) ?? s.scoopId,
      crop: s.crop,
      quantityKg: s.quantityKg,
      pricePerKg: s.pricePerKgFcfa,
      total: s.totalFcfa,
      paid: s.paidFcfa,
      payment: s.paymentStatus,
      buyer: s.buyer,
      campaign: s.campaign,
      cancelledAt: s.cancelledAt,
      cancelReason: s.cancelReason,
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
    const t = this.t();
    const summary = this.apiStats();
    const receivable = summary?.receivableFcfa ?? 0;
    return [
      { label: t("apercu.ventes.count"), value: nf.format(summary?.totalCount ?? this.apiMeta().total), sub: `${nf.format(summary?.totalQuantityKg ?? 0)} kg`, icon: "storefront", bg: "", fg: "" },
      { label: t("apercu.ventes.revenue"), value: fcfa(summary?.totalFcfa ?? 0), sub: "", icon: "payments", ...TONE.succes },
      { label: t("apercu.ventes.collected"), value: fcfa(summary?.collectedFcfa ?? 0), sub: "", icon: "task_alt", ...TONE.info },
      { label: t("apercu.ventes.receivable"), value: fcfa(receivable), sub: "", icon: "account_balance", ...(receivable ? TONE.attente : TONE.neutre) },
    ];
  });

  protected onSearch(value: string) {
    this.q.set(value);
    this.page.set(1);
  }

  protected onFilterChange(
    kind: "scoop" | "payment" | "channel" | "crop" | "campaign" | "fromDate" | "toDate",
    value: string,
  ) {
    if (kind === "scoop") this.scoopFilter.set(value);
    else if (kind === "payment") this.paymentFilter.set(value);
    else if (kind === "channel") this.channelFilter.set(value);
    else if (kind === "crop") this.cropFilter.set(value);
    else if (kind === "campaign") this.campaignFilter.set(value);
    else if (kind === "fromDate") this.fromDateFilter.set(value);
    else this.toDateFilter.set(value);
    this.page.set(1);
  }

  protected resetFilters() {
    this.q.set("");
    this.scoopFilter.set("");
    this.paymentFilter.set("");
    this.channelFilter.set("");
    this.cropFilter.set("");
    this.campaignFilter.set("");
    this.fromDateFilter.set("");
    this.toDateFilter.set("");
    this.page.set(1);
  }

  protected openCreate() {
    this.selectedProducer.set(null);
    this.formCrop.set("");
    this.createOpen.set(true);
  }

  protected async submitCreate() {
    const selected = this.selectedProducer();
    if (!selected || this.saving()) return;
    this.saving.set(true);
    try {
      await createSale({
        scoopId: selected.scoopId,
        producerId: selected.id,
        producerName: selected.name,
        crop: this.formCrop().trim(),
        campaign: this.formCampaign().trim() || undefined,
        quantityKg: Number(this.formQty()),
        pricePerKgFcfa: Math.round(Number(this.formPrice())),
        paidFcfa: Math.round(Number(this.formPaid())) || 0,
        buyer: this.formBuyer().trim() || undefined,
        saleDate: new Date().toISOString().slice(0, 10),
      });
      this.createOpen.set(false);
      this.reloadTick.update((v) => v + 1);
      this.snackbar.success("Vente enregistrée.");
    } finally {
      this.saving.set(false);
    }
  }

  protected paymentTone(payment: string) {
    return payment === "payé" ? TONE.succes : payment === "partiel" ? TONE.attente : TONE.erreur;
  }

  protected openPay(row: SaleRow) {
    this.payAmount.set(String(Math.max(0, row.total - row.paid)));
    this.payDate.set(new Date().toISOString().slice(0, 10));
    this.payNote.set("");
    this.payTarget.set(row);
  }

  protected async submitPay() {
    const target = this.payTarget();
    if (!target || this.saving()) return;
    this.saving.set(true);
    try {
      await recordSalePayment(target.id, {
        amountFcfa: Math.round(Number(this.payAmount())),
        paidAt: this.payDate(),
        note: this.payNote().trim() || undefined,
      });
      this.payTarget.set(null);
      this.reloadTick.update((v) => v + 1);
      this.snackbar.success("Encaissement enregistré.");
    } finally {
      this.saving.set(false);
    }
  }

  protected openCancel(row: SaleRow) {
    this.cancelReason.set("");
    this.cancelTarget.set(row);
  }

  protected async submitCancel() {
    const target = this.cancelTarget();
    if (!target || !this.cancelReason().trim() || this.saving()) return;
    this.saving.set(true);
    try {
      await cancelSale(target.id, this.cancelReason().trim());
      this.cancelTarget.set(null);
      this.reloadTick.update((v) => v + 1);
      this.snackbar.info("Vente annulée.");
    } finally {
      this.saving.set(false);
    }
  }

  protected openDetail(row: SaleRow) {
    this.detailTarget.set(row);
    void this.loadSalePayments(row.id, 1);
  }

  protected async loadSalePayments(saleId: string, page: number) {
    this.detailLoading.set(true);
    try {
      const res = await listSalePayments(saleId, { page, limit: 10 });
      this.detailPayments.set(res.items);
      this.detailMeta.set({ total: res.total, page: res.page, limit: res.limit, pages: res.pages });
    } finally {
      this.detailLoading.set(false);
    }
  }
}
