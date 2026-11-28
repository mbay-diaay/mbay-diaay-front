import { Component, computed, effect, inject, signal } from "@angular/core";

import { isApiMode } from "@/lib/api/config";
import {
  cancelRepayment,
  createCredit,
  getCommercialStats,
  listCreditRepayments,
  listCredits,
  recordRepayment,
  type CommercialStatsDto,
  type CreditDto,
  type CreditRepaymentDto,
  type CreditScheduleItemDto,
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

type CreditRow = {
  id: string;
  member: string;
  scoop: string;
  purpose: string;
  amount: number;
  ratePct: number;
  grantedAt: string;
  due: number;
  repaid: number;
  balance: number;
  next: string | null;
  state: string;
  schedule: CreditScheduleItemDto[];
};

@Component({
  selector: "app-credits-page",
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
    <app-shell [perm]="perms" [area]="t()('nav.item.credits')">
      <ui-page-header [title]="t()('nav.item.credits')" [description]="t()('commercial.credits.description')">
        @if (store.can("credit.manage")) {
          <button actions type="button" class="btn btn-primary" (click)="openCreate()">
            <span>Nouveau crédit</span>
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
              placeholder="Rechercher un membre ou un objet de crédit…"
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
            label="État"
            [options]="stateFilterOptions"
            [value]="stateFilter()"
            [highlight]="!!stateFilter()"
            (valueChange)="onFilterChange('state', $event)"
          />
          <input
            type="date"
            class="btn btn-ghost"
            style="height: 40px; padding: 0 10px; font-size: 13px; border: 1px solid var(--border)"
            [style.border-color]="fromDateFilter() ? 'var(--brand)' : 'var(--border)'"
            title="Date d’octroi (du)"
            [value]="fromDateFilter()"
            (change)="onFilterChange('fromDate', $any($event.target).value)"
          />
          <input
            type="date"
            class="btn btn-ghost"
            style="height: 40px; padding: 0 10px; font-size: 13px; border: 1px solid var(--border)"
            [style.border-color]="toDateFilter() ? 'var(--brand)' : 'var(--border)'"
            title="Date d’octroi (au)"
            [value]="toDateFilter()"
            (change)="onFilterChange('toDate', $any($event.target).value)"
          />
          @if (q() || scoopFilter() || stateFilter() || fromDateFilter() || toDateFilter()) {
            <button type="button" class="btn btn-ghost" style="height: 40px; padding: 0 14px; font-size: 13px" (click)="resetFilters()">
              Réinitialiser
            </button>
          }
        </div>

        <section class="card mt-4 overflow-x-auto">
          <table class="tbl">
            <thead>
              <tr>
                <th>{{ t()("apercu.col.member") }}</th>
                <th>{{ t()("apercu.col.scoop") }}</th>
                <th>{{ t()("apercu.col.purpose") }}</th>
                <th class="num">{{ t()("apercu.col.amount") }}</th>
                <th class="num">{{ t()("apercu.col.rate") }}</th>
                <th>{{ t()("apercu.col.grantedAt") }}</th>
                <th class="num">{{ t()("apercu.col.due") }}</th>
                <th class="num">{{ t()("apercu.col.repaid") }}</th>
                <th class="num">{{ t()("apercu.col.balanceDue") }}</th>
                <th>{{ t()("apercu.col.nextDue") }}</th>
                <th>{{ t()("apercu.col.state") }}</th>
                @if (store.can("credit.manage")) {
                  <th class="num">Actions</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (row of pager().items(); track row.id) {
                <tr class="cursor-pointer" (click)="openDetail(row)">
                  <td class="font-bold">{{ row.member }}</td>
                  <td>{{ row.scoop }}</td>
                  <td>{{ row.purpose }}</td>
                  <td class="num">{{ fcfa(row.amount) }}</td>
                  <td class="num">{{ row.ratePct }} %</td>
                  <td>{{ fmtDate(row.grantedAt) }}</td>
                  <td class="num">{{ fcfa(row.due) }}</td>
                  <td class="num">{{ fcfa(row.repaid) }}</td>
                  <td class="num">{{ fcfa(row.balance) }}</td>
                  <td>@if (row.next) { {{ fmtDate(row.next) }} } @else { — }</td>
                  <td>
                    <span class="badge" [style.background]="stateTone(row.state).bg" [style.color]="stateTone(row.state).fg">{{
                      row.state
                    }}</span>
                  </td>
                  @if (store.can("credit.manage")) {
                    <td class="num">
                      <button
                        type="button"
                        class="btn btn-ghost"
                        style="height: 36px; padding: 0 12px; font-size: 13px"
                        [disabled]="row.balance <= 0"
                        (click)="openRepay(row); $event.stopPropagation()"
                      >
                        Rembourser
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
              [title]="q() ? t()('emptyState.filtered.title') : 'Aucun crédit accordé'"
              [description]="q() ? t()('emptyState.filtered.description') : 'Les crédits octroyés aux membres apparaîtront ici, avec leur échéancier de remboursement.'"
            >
              @if (!(q()) && store.can("credit.manage")) {
                <button type="button" class="btn btn-primary" (click)="openCreate()">
                  <span>Nouveau crédit</span>
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
      <ui-modal [open]="createOpen()" title="Octroyer un crédit" description="Choisissez le membre, le montant et l'échéancier de remboursement." icon="payments" tone="brand" (closed)="createOpen.set(false)">
        <div class="grid gap-4">
          <ui-producer-select
            label="Producteur / Membre"
            [scoopId]="scoopFilter() || undefined"
            [selected]="selectedProducer()"
            (selectedChange)="selectedProducer.set($event)"
          />
          <ui-text-field label="Objet du crédit" placeholder="Ex. : Intrants campagne hivernage" [value]="formPurpose()" (valueChange)="formPurpose.set($event)" />
          <div class="grid items-start gap-4 sm:grid-cols-2">
            <ui-text-field label="Montant (FCFA)" type="number" [value]="formAmount()" (valueChange)="formAmount.set($event)" />
            <ui-text-field label="Taux (%)" type="number" [value]="formRate()" (valueChange)="formRate.set($event)" />
          </div>
          <div class="grid items-start gap-4 sm:grid-cols-2">
            <ui-text-field label="Nombre d’échéances" type="number" [value]="formInstallments()" (valueChange)="formInstallments.set($event)" />
            <ui-text-field label="Périodicité (mois)" type="number" [value]="formEveryMonths()" (valueChange)="formEveryMonths.set($event)" />
          </div>
          <ui-text-field label="Date d'échéance" type="date" optional="facultatif" [value]="formDueAt()" (valueChange)="formDueAt.set($event)" />
        </div>
        <div modal-footer class="flex justify-end gap-3">
          <button type="button" class="btn btn-ghost" (click)="createOpen.set(false)">Annuler</button>
          <button type="button" class="btn btn-primary" [disabled]="saving() || !formPurpose().trim() || !(+formAmount() > 0)" (click)="submitCreate()">
            <span>Accorder le crédit</span>
            <span class="btn-chip" aria-hidden="true"><ui-icon name="arrow_forward" [size]="16" /></span>
          </button>
        </div>
      </ui-modal>
    }

    @if (repayTarget(); as target) {
      <ui-modal [open]="!!target" [title]="'Remboursement · ' + target.member" description="Enregistrez un versement : il vient en déduction du reste dû." icon="payments" tone="brand" (closed)="repayTarget.set(null)">
        <div class="grid gap-4">
          <p class="sub">Reste dû : <strong>{{ fcfa(target.balance) }}</strong></p>
          <ui-text-field label="Montant versé (FCFA)" type="number" [value]="repayAmount()" (valueChange)="repayAmount.set($event)" />
          <ui-text-field label="Note" optional="facultatif" [value]="repayNote()" (valueChange)="repayNote.set($event)" />
        </div>
        <div modal-footer class="flex justify-end gap-3">
          <button type="button" class="btn btn-ghost" (click)="repayTarget.set(null)">Annuler</button>
          <button type="button" class="btn btn-primary" [disabled]="saving() || !(+repayAmount() > 0)" (click)="submitRepay()">
            <span>Enregistrer</span>
            <span class="btn-chip" aria-hidden="true"><ui-icon name="arrow_forward" [size]="16" /></span>
          </button>
        </div>
      </ui-modal>
    }

    @if (detailTarget(); as credit) {
      <ui-modal
        [open]="!!detailTarget()"
        [title]="'Crédit · ' + credit.member"
        [description]="credit.purpose + ' · Reste dû : ' + fcfa(credit.balance)"
        icon="payments"
        tone="brand"
        (closed)="detailTarget.set(null)"
      >
        <div class="grid gap-4">
          @if (credit.schedule.length > 0) {
            <div class="grid gap-2">
              <p class="lbl">Échéancier ({{ credit.schedule.length }})</p>
              <div class="grid gap-1 text-[13px]">
                @for (part of credit.schedule; track $index) {
                  <div class="flex items-center justify-between rounded border px-3 py-2" style="border-color: var(--border)">
                    <span>Échéance {{ $index + 1 }} · {{ fmtDate(part.dueDate) }}</span>
                    <span class="font-semibold">{{ fcfa(part.amountFcfa) }}</span>
                  </div>
                }
              </div>
            </div>
          }

          <div class="grid gap-2">
            <p class="lbl">Historique des remboursements</p>
            @if (detailLoading()) {
              <p class="text-[13px]" style="color: var(--ink-2)">Chargement…</p>
            } @else if (detailRepayments().length === 0) {
              <p class="text-[13px]" style="color: var(--ink-2)">Aucun remboursement enregistré.</p>
            } @else {
              <div class="grid gap-2">
                @for (repayment of detailRepayments(); track repayment.id) {
                  <div class="flex items-start justify-between gap-3 rounded-lg border p-3" style="border-color: var(--border)">
                    <div class="grid gap-1 text-[13px]">
                      <div class="flex items-center gap-2 font-semibold">
                        <span>{{ fcfa(repayment.amountFcfa) }}</span>
                        @if (repayment.cancelledAt) {
                          <span class="badge" [style.background]="'var(--v2-erreur-bg)'" [style.color]="'var(--v2-erreur-fg)'">Annulé</span>
                        }
                      </div>
                      <div class="text-[12px]" style="color: var(--ink-2)">
                        {{ fmtDate(repayment.paidAt) }} · {{ repayment.recordedBy }}
                      </div>
                      @if (repayment.note) {
                        <div class="text-[12px]">{{ repayment.note }}</div>
                      }
                      @if (repayment.cancelledAt && repayment.cancelReason) {
                        <div class="text-[12px]" style="color: var(--v2-erreur-fg)">Motif : {{ repayment.cancelReason }}</div>
                      }
                    </div>
                    @if (!repayment.cancelledAt && store.can("credit.manage")) {
                      <button
                        type="button"
                        class="btn btn-ghost"
                        style="height: 32px; padding: 0 10px; font-size: 12px"
                        (click)="openCancelRepayment(repayment)"
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
                    (click)="loadCreditRepayments(credit.id, detailMeta().page - 1)"
                  >
                    Précédent
                  </button>
                  <span>Page {{ detailMeta().page }} / {{ detailMeta().pages }}</span>
                  <button
                    type="button"
                    class="btn btn-ghost"
                    style="height: 32px; padding: 0 10px"
                    [disabled]="detailMeta().page >= detailMeta().pages"
                    (click)="loadCreditRepayments(credit.id, detailMeta().page + 1)"
                  >
                    Suivant
                  </button>
                </div>
              }
            }
          </div>
        </div>
        <div modal-footer class="flex justify-end">
          <button type="button" class="btn btn-ghost" (click)="detailTarget.set(null)">Fermer</button>
        </div>
      </ui-modal>
    }

    @if (cancelRepaymentTarget()) {
      <ui-modal
        [open]="!!cancelRepaymentTarget()"
        title="Annuler le remboursement"
        description="Le montant sera réintégré au reste dû par contre-écriture."
        icon="undo"
        tone="danger"
        (closed)="cancelRepaymentTarget.set(null)"
      >
        <ui-text-field
          label="Motif obligatoire"
          placeholder="Ex. : Erreur de saisie montant"
          [value]="cancelRepaymentReason()"
          (valueChange)="cancelRepaymentReason.set($event)"
        />
        <div modal-footer class="flex justify-end gap-3">
          <button type="button" class="btn btn-ghost" (click)="cancelRepaymentTarget.set(null)">Retour</button>
          <button
            type="button"
            class="btn btn-primary"
            [disabled]="saving() || !cancelRepaymentReason().trim()"
            (click)="submitCancelRepayment()"
          >
            {{ saving() ? "Annulation…" : "Confirmer l’annulation" }}
          </button>
        </div>
      </ui-modal>
    }
  `,
})
export default class CreditsPage {
  protected readonly store = inject(StoreService);
  private readonly snackbar = inject(SnackbarService);
  protected readonly t = inject(LocaleService).t;
  protected readonly apiMode = isApiMode();
  protected readonly perms = ["credit.read"] as const;
  protected readonly fmtDate = fmtDate;
  protected readonly fcfa = fcfa;
  protected readonly nf = nf;
  private readonly scoopName = computed(() => new Map(this.store.state().scoops.map((scoop) => [scoop.id, scoop.name])));

  protected readonly q = signal("");
  protected readonly scoopFilter = signal("");
  protected readonly stateFilter = signal("");
  protected readonly fromDateFilter = signal("");
  protected readonly toDateFilter = signal("");
  protected readonly page = signal(1);
  protected readonly limit = signal(20);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  private readonly apiRows = signal<CreditRow[]>([]);
  private readonly apiStats = signal<CommercialStatsDto["credits"]>(null);
  private readonly apiMeta = signal<PageMeta>({ total: 0, page: 1, limit: 20, pages: 1 });
  private readonly reloadTick = signal(0);

  protected readonly createOpen = signal(false);
  protected readonly selectedProducer = signal<ProducerSelection | null>(null);
  protected readonly formPurpose = signal("");
  protected readonly formAmount = signal("50000");
  protected readonly formRate = signal("0");
  protected readonly formInstallments = signal("1");
  protected readonly formEveryMonths = signal("1");
  protected readonly formDueAt = signal("");

  protected readonly repayTarget = signal<CreditRow | null>(null);
  protected readonly repayAmount = signal("");
  protected readonly repayNote = signal("");

  protected readonly detailTarget = signal<CreditRow | null>(null);
  protected readonly detailRepayments = signal<CreditRepaymentDto[]>([]);
  protected readonly detailMeta = signal<PageMeta>({ total: 0, page: 1, limit: 10, pages: 1 });
  protected readonly detailLoading = signal(false);
  protected readonly cancelRepaymentTarget = signal<CreditRepaymentDto | null>(null);
  protected readonly cancelRepaymentReason = signal("");

  protected readonly scoopFilterOptions = computed<SelectOption[]>(() => [
    { value: "", label: "Toutes les coopératives" },
    ...this.store.state().scoops.map((s) => ({ value: s.id, label: s.name })),
  ]);
  protected readonly stateFilterOptions: SelectOption[] = [
    { value: "", label: "Tous les états" },
    { value: "en cours", label: "En cours" },
    { value: "soldé", label: "Soldé" },
    { value: "en retard", label: "En retard" },
  ];

  constructor() {
    effect(() => {
      if (!this.apiMode) return;
      const page = this.page();
      const limit = this.limit();
      const q = this.q();
      const scoopId = this.scoopFilter();
      const status = this.stateFilter();
      const fromDate = this.fromDateFilter();
      const toDate = this.toDateFilter();
      this.reloadTick();
      void this.loadApi(page, limit, q, scoopId, status, fromDate, toDate);
    });
    effect(() => {
      if (!this.apiMode) return;
      const q = this.q();
      const scoopId = this.scoopFilter();
      const status = this.stateFilter();
      const fromDate = this.fromDateFilter();
      const toDate = this.toDateFilter();
      this.reloadTick();
      void getCommercialStats({
        q: q || undefined,
        scoopId: scoopId || undefined,
        status: status || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      })
        .then((res) => this.apiStats.set(res.credits))
        .catch(() => this.apiStats.set(null));
    });
  }

  private async loadApi(
    page: number,
    limit: number,
    q: string,
    scoopId: string,
    status: string,
    fromDate: string,
    toDate: string,
  ) {
    this.loading.set(true);
    try {
      const res = await listCredits({
        page,
        limit,
        q,
        scoopId: scoopId || undefined,
        status: status || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      });
      this.apiMeta.set({ total: res.total, page: res.page, limit: res.limit, pages: res.pages });
      this.apiRows.set(res.items.map((c) => this.mapApiCredit(c)));
    } finally {
      this.loading.set(false);
    }
  }

  private mapApiCredit(c: CreditDto): CreditRow {
    return {
      id: c.id,
      member: c.memberName,
      scoop: this.scoopName().get(c.scoopId) ?? c.scoopId,
      purpose: c.purpose,
      amount: c.amountFcfa,
      ratePct: c.ratePct,
      grantedAt: c.grantedAt,
      due: c.totalDueFcfa,
      repaid: c.repaidFcfa,
      balance: Math.max(0, c.totalDueFcfa - c.repaidFcfa),
      next: c.nextDueAt,
      state: c.status,
      schedule: c.schedule ?? [],
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
    const overdueCount = summary?.overdueCount ?? 0;
    return [
      { label: t("apercu.credits.granted"), value: fcfa(summary?.grantedFcfa ?? 0), sub: "", icon: "payments", bg: "", fg: "" },
      { label: t("apercu.credits.repaid"), value: fcfa(summary?.repaidFcfa ?? 0), sub: "", icon: "task_alt", ...TONE.succes },
      { label: t("apercu.credits.outstanding"), value: fcfa(summary?.remainingFcfa ?? 0), sub: "", icon: "account_balance", ...TONE.info },
      { label: t("apercu.credits.overdue"), value: fcfa(summary?.overdueFcfa ?? 0), sub: String(overdueCount), icon: "warning", ...(overdueCount ? TONE.erreur : TONE.neutre) },
    ];
  });

  protected onSearch(value: string) {
    this.q.set(value);
    this.page.set(1);
  }

  protected onFilterChange(kind: "scoop" | "state" | "fromDate" | "toDate", value: string) {
    if (kind === "scoop") this.scoopFilter.set(value);
    else if (kind === "state") this.stateFilter.set(value);
    else if (kind === "fromDate") this.fromDateFilter.set(value);
    else this.toDateFilter.set(value);
    this.page.set(1);
  }

  protected resetFilters() {
    this.q.set("");
    this.scoopFilter.set("");
    this.stateFilter.set("");
    this.fromDateFilter.set("");
    this.toDateFilter.set("");
    this.page.set(1);
  }

  protected openCreate() {
    this.selectedProducer.set(null);
    this.formPurpose.set("");
    this.createOpen.set(true);
  }

  protected async submitCreate() {
    const selected = this.selectedProducer();
    if (!selected || this.saving()) return;
    this.saving.set(true);
    try {
      await createCredit({
        scoopId: selected.scoopId,
        memberId: selected.id,
        memberName: selected.name,
        purpose: this.formPurpose().trim(),
        amountFcfa: Math.round(Number(this.formAmount())),
        ratePct: Number(this.formRate()) || 0,
        grantedAt: new Date().toISOString().slice(0, 10),
        nextDueAt: this.formDueAt().trim() || undefined,
        installments: Math.max(1, Math.round(Number(this.formInstallments()) || 1)),
        everyMonths: Math.max(1, Math.round(Number(this.formEveryMonths()) || 1)),
      });
      this.createOpen.set(false);
      this.reloadTick.update((v) => v + 1);
      this.snackbar.success("Crédit accordé.");
    } finally {
      this.saving.set(false);
    }
  }

  protected openRepay(row: CreditRow) {
    this.repayAmount.set(String(row.balance));
    this.repayNote.set("");
    this.repayTarget.set(row);
  }

  protected async submitRepay() {
    const target = this.repayTarget();
    if (!target || this.saving()) return;
    this.saving.set(true);
    try {
      await recordRepayment(target.id, {
        amountFcfa: Math.round(Number(this.repayAmount())),
        paidAt: new Date().toISOString().slice(0, 10),
        note: this.repayNote().trim() || undefined,
      });
      this.repayTarget.set(null);
      this.reloadTick.update((v) => v + 1);
      this.snackbar.success("Remboursement enregistré.");
    } finally {
      this.saving.set(false);
    }
  }

  protected stateTone(state: string) {
    return state === "en retard" ? TONE.erreur : state === "soldé" ? TONE.succes : TONE.info;
  }

  protected openDetail(row: CreditRow) {
    this.detailTarget.set(row);
    void this.loadCreditRepayments(row.id, 1);
  }

  protected async loadCreditRepayments(creditId: string, page: number) {
    this.detailLoading.set(true);
    try {
      const res = await listCreditRepayments(creditId, { page, limit: 10 });
      this.detailRepayments.set(res.items);
      this.detailMeta.set({ total: res.total, page: res.page, limit: res.limit, pages: res.pages });
    } finally {
      this.detailLoading.set(false);
    }
  }

  protected openCancelRepayment(repayment: CreditRepaymentDto) {
    this.cancelRepaymentReason.set("");
    this.cancelRepaymentTarget.set(repayment);
  }

  protected async submitCancelRepayment() {
    const target = this.cancelRepaymentTarget();
    const credit = this.detailTarget();
    if (!target || !this.cancelRepaymentReason().trim() || this.saving()) return;
    this.saving.set(true);
    try {
      await cancelRepayment(target.id, this.cancelRepaymentReason().trim());
      this.cancelRepaymentTarget.set(null);
      this.reloadTick.update((v) => v + 1);
      if (credit) await this.loadCreditRepayments(credit.id, this.detailMeta().page);
      this.snackbar.info("Remboursement annulé par contre-écriture.");
    } finally {
      this.saving.set(false);
    }
  }
}
