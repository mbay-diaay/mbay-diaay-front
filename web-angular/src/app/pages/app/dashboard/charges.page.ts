import { Component, computed, effect, inject, signal } from "@angular/core";

import { isApiMode } from "@/lib/api/config";
import {
  cancelExpense,
  createExpense,
  listExpenses,
  type ExpenseCategoryDto,
  type ExpenseDto,
} from "@/lib/api/exploitation";
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

type ChargeRow = {
  id: string;
  date: string;
  producer: string;
  scoop: string;
  crop: string;
  campaign: string;
  category: string;
  label: string;
  amount: number;
};

@Component({
  selector: "app-charges-page",
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
    <app-shell [perm]="perms" [area]="t()('nav.item.charges')">
      <ui-page-header [title]="t()('nav.item.charges')" [description]="t()('exploitation.charges.description')">
        @if (apiMode && store.can("expense.write")) {
          <button actions type="button" class="btn btn-primary" (click)="openCreate()">
            <span>Nouvelle charge</span>
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
              placeholder="Rechercher un producteur, une culture ou un libellé…"
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
          @if (q() || scoopFilter() || categoryFilter()) {
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
                <th>{{ t()("apercu.col.campaign") }}</th>
                <th>{{ t()("apercu.col.category") }}</th>
                <th>{{ t()("apercu.col.label") }}</th>
                <th class="num">{{ t()("apercu.col.amount") }}</th>
                @if (store.can("expense.write")) {
                  <th class="num">Actions</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (row of pager().items(); track row.id) {
                <tr>
                  <td>{{ fmtDate(row.date) }}</td>
                  <td class="font-bold">{{ row.producer }}</td>
                  <td>{{ row.scoop }}</td>
                  <td>{{ row.crop }}</td>
                  <td>{{ row.campaign || "—" }}</td>
                  <td><span class="badge" style="background: var(--v2-sauge); color: var(--v2-foret)">{{ row.category }}</span></td>
                  <td>{{ row.label }}</td>
                  <td class="num">{{ fcfa(row.amount) }}</td>
                  @if (store.can("expense.write")) {
                    <td class="num">
                      <button
                        type="button"
                        class="btn btn-ghost"
                        style="height: 36px; padding: 0 12px; font-size: 13px"
                        (click)="openCancel(row)"
                      >
                        Annuler
                      </button>
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
          @if (!pager().items().length && !loading()) {
            <ui-empty-state
              [icon]="q() ? 'search' : 'payments'"
              [title]="q() ? t()('emptyState.filtered.title') : 'Aucune charge saisie'"
              [description]="q() ? t()('emptyState.filtered.description') : 'Les dépenses de campagne rattachées aux producteurs apparaîtront ici.'"
            >
              @if (!(q()) && apiMode && store.can("expense.write")) {
                <button type="button" class="btn btn-primary" (click)="openCreate()">
                  <span>Nouvelle charge</span>
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
      <ui-modal [open]="createOpen()" title="Enregistrer une charge" description="Une dépense de campagne rattachée à un producteur et à une culture." icon="payments" tone="brand" (closed)="createOpen.set(false)">
        <div class="grid gap-4">
          <ui-producer-select
            label="Producteur"
            [scoopId]="scoopFilter() || undefined"
            [selected]="selectedProducer()"
            (selectedChange)="selectedProducer.set($event)"
          />
          <div class="grid items-start gap-4 sm:grid-cols-2">
            <div>
              <p class="lbl mb-2">Catégorie</p>
              <ui-select
                label="Catégorie"
                [options]="categoryOptions"
                [value]="formCategory()"
                (valueChange)="formCategory.set($any($event))"
              />
            </div>
            <ui-text-field label="Culture" placeholder="Ex. : Oignon" [value]="formCrop()" (valueChange)="formCrop.set($event)" />
          </div>
          <ui-text-field label="Libellé de la charge" placeholder="Ex. : Achat engrais NPK" [value]="formLabel()" (valueChange)="formLabel.set($event)" />
          <div class="grid items-start gap-4 sm:grid-cols-2">
            <ui-text-field label="Montant (FCFA)" type="number" [value]="formAmount()" (valueChange)="formAmount.set($event)" />
            <ui-text-field label="Campagne" placeholder="Ex. : 2026-2027" optional="facultatif" [value]="formCampaign()" (valueChange)="formCampaign.set($event)" />
          </div>
        </div>
        <div modal-footer class="flex justify-end gap-3">
          <button type="button" class="btn btn-ghost" (click)="createOpen.set(false)">Annuler</button>
          <button
            type="button"
            class="btn btn-primary"
            [disabled]="saving() || !formCrop().trim() || !formLabel().trim() || !(+formAmount() > 0)"
            (click)="submitCreate()"
          >
            <span>Enregistrer</span>
            <span class="btn-chip" aria-hidden="true"><ui-icon name="arrow_forward" [size]="16" /></span>
          </button>
        </div>
      </ui-modal>
    }

    @if (cancelTarget(); as target) {
      <ui-modal [open]="!!target" title="Annuler cette charge" icon="warning" tone="danger" (closed)="cancelTarget.set(null)">
        <div class="grid gap-4">
          <p class="sub">La charge <strong>{{ target.label }}</strong> ({{ fcfa(target.amount) }}) sera annulée par contre-écriture.</p>
          <ui-text-field label="Motif d'annulation" placeholder="Ex. : Erreur de saisie" [value]="cancelReason()" (valueChange)="cancelReason.set($event)" />
        </div>
        <div modal-footer class="flex justify-end gap-3">
          <button type="button" class="btn btn-ghost" (click)="cancelTarget.set(null)">Fermer</button>
          <button type="button" class="btn btn-danger" [disabled]="saving() || !cancelReason().trim()" (click)="submitCancel()">
            Confirmer l'annulation
          </button>
        </div>
      </ui-modal>
    }
  `,
})
export default class ChargesPage {
  protected readonly store = inject(StoreService);
  private readonly snackbar = inject(SnackbarService);
  protected readonly t = inject(LocaleService).t;
  protected readonly apiMode = isApiMode();
  protected readonly perms = ["expense.read"] as const;
  protected readonly fmtDate = fmtDate;
  protected readonly fcfa = fcfa;
  protected readonly nf = nf;
  private readonly scoopName = computed(() => new Map(this.store.state().scoops.map((scoop) => [scoop.id, scoop.name])));

  protected readonly q = signal("");
  protected readonly scoopFilter = signal("");
  protected readonly categoryFilter = signal("");
  protected readonly page = signal(1);
  protected readonly limit = signal(20);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  private readonly apiRows = signal<ChargeRow[]>([]);
  private readonly apiMeta = signal<PageMeta>({ total: 0, page: 1, limit: 20, pages: 1 });
  private readonly reloadTick = signal(0);

  protected readonly createOpen = signal(false);
  protected readonly selectedProducer = signal<ProducerSelection | null>(null);
  protected readonly formCategory = signal<ExpenseCategoryDto>("intrants");
  protected readonly formCrop = signal("");
  protected readonly formLabel = signal("");
  protected readonly formAmount = signal("15000");
  protected readonly formCampaign = signal("");

  protected readonly cancelTarget = signal<ChargeRow | null>(null);
  protected readonly cancelReason = signal("");

  protected readonly categoryOptions: SelectOption[] = [
    { value: "intrants", label: "Intrants" },
    { value: "main-d'œuvre", label: "Main-d'œuvre" },
    { value: "transport", label: "Transport" },
    { value: "irrigation", label: "Irrigation" },
    { value: "location de matériel", label: "Location de matériel" },
    { value: "autre", label: "Autre" },
  ];

  protected readonly scoopFilterOptions = computed<SelectOption[]>(() => [
    { value: "", label: "Toutes les coopératives" },
    ...this.store.state().scoops.map((s) => ({ value: s.id, label: s.name })),
  ]);
  protected readonly categoryFilterOptions: SelectOption[] = [
    { value: "", label: "Toutes catégories" },
    ...this.categoryOptions,
  ];

  constructor() {
    effect(() => {
      if (!this.apiMode) return;
      const page = this.page();
      const limit = this.limit();
      const q = this.q();
      const scoopId = this.scoopFilter();
      const category = this.categoryFilter() as ExpenseCategoryDto | "";
      this.reloadTick();
      void this.loadApi(page, limit, q, scoopId, category);
    });
  }

  private async loadApi(page: number, limit: number, q: string, scoopId: string, category: ExpenseCategoryDto | "") {
    this.loading.set(true);
    try {
      const res = await listExpenses({
        page,
        limit,
        q,
        scoopId: scoopId || undefined,
        category: category || undefined,
      });
      this.apiMeta.set({ total: res.total, page: res.page, limit: res.limit, pages: res.pages });
      this.apiRows.set(res.items.map((e) => this.mapApiExpense(e)));
    } finally {
      this.loading.set(false);
    }
  }

  private mapApiExpense(e: ExpenseDto): ChargeRow {
    return {
      id: e.id,
      date: e.expenseDate,
      producer: e.producerName,
      scoop: this.scoopName().get(e.scoopId) ?? e.scoopId,
      crop: e.crop,
      campaign: e.campaign,
      category: e.category,
      label: e.label,
      amount: e.amountFcfa,
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
    const rows = this.apiRows();
    const total = rows.reduce((s, r) => s + r.amount, 0);
    const producers = new Set(rows.map((r) => r.producer)).size;
    const byCat = new Map<string, number>();
    for (const r of rows) byCat.set(r.category, (byCat.get(r.category) ?? 0) + r.amount);
    const top = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0];
    return [
      { label: t("apercu.charges.count"), value: nf.format(this.apiMeta().total), sub: "", icon: "payments", bg: "", fg: "" },
      { label: t("apercu.charges.total"), value: fcfa(total), sub: "", icon: "account_balance", ...TONE.info },
      { label: t("apercu.charges.top"), value: top?.[0] ?? "—", sub: top ? fcfa(top[1]) : "", icon: "inventory_2", ...TONE.succes },
      { label: t("apercu.charges.producers"), value: nf.format(producers), sub: "", icon: "group", ...TONE.attente },
    ];
  });

  protected onSearch(value: string) {
    this.q.set(value);
    this.page.set(1);
  }

  protected onFilterChange(kind: "scoop" | "category", value: string) {
    if (kind === "scoop") this.scoopFilter.set(value);
    else this.categoryFilter.set(value);
    this.page.set(1);
  }

  protected resetFilters() {
    this.q.set("");
    this.scoopFilter.set("");
    this.categoryFilter.set("");
    this.page.set(1);
  }

  protected openCreate() {
    this.selectedProducer.set(null);
    this.formCrop.set("");
    this.formLabel.set("");
    this.createOpen.set(true);
  }

  protected async submitCreate() {
    const selected = this.selectedProducer();
    if (!selected || this.saving()) return;
    this.saving.set(true);
    try {
      await createExpense({
        scoopId: selected.scoopId,
        producerId: selected.id,
        producerName: selected.name,
        crop: this.formCrop().trim(),
        campaign: this.formCampaign().trim() || undefined,
        category: this.formCategory(),
        label: this.formLabel().trim(),
        amountFcfa: Math.round(Number(this.formAmount())),
        expenseDate: new Date().toISOString().slice(0, 10),
      });
      this.createOpen.set(false);
      this.reloadTick.update((v) => v + 1);
      this.snackbar.success("Charge enregistrée.");
    } finally {
      this.saving.set(false);
    }
  }

  protected openCancel(row: ChargeRow) {
    this.cancelReason.set("");
    this.cancelTarget.set(row);
  }

  protected async submitCancel() {
    const target = this.cancelTarget();
    if (!target || this.saving()) return;
    this.saving.set(true);
    try {
      await cancelExpense(target.id, this.cancelReason().trim());
      this.cancelTarget.set(null);
      this.reloadTick.update((v) => v + 1);
      this.snackbar.info("Charge annulée par contre-écriture.");
    } finally {
      this.saving.set(false);
    }
  }
}
