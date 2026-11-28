import { Component, computed, effect, inject, signal } from "@angular/core";

import { isApiMode } from "@/lib/api/config";
import {
  createOperation,
  deleteOperation,
  getAgronomyStats,
  listOperations,
  listPlans,
  OPERATION_KINDS,
  updateOperation,
  type AgronomyStatsDto,
  type OperationDto,
  type OperationKindDto,
  type PlanDto,
} from "@/lib/api/agronomy";
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

@Component({
  selector: "app-suivi-page",
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
    <app-shell [perm]="perms" [area]="t()('nav.item.suivi')">
      <ui-page-header [title]="t()('nav.item.suivi')" [description]="t()('agronomique.suivi.description')">
        @if (apiMode && store.can("operation.write")) {
          <button actions type="button" class="btn btn-primary" (click)="openCreate()">
            <span>Enregistrer une opération</span>
            <span class="btn-chip" aria-hidden="true"><ui-icon name="add" [size]="16" /></span>
          </button>
        }
      </ui-page-header>

      @if (apiMode) {
        <ui-stat-cards class="rise mt-6" [stats]="stats()" />

        <div class="toolbar card mt-6">
          <div class="search">
            <ui-icon name="search" [size]="18" />
            <input type="search" placeholder="Rechercher un producteur, une culture ou une note…" [value]="q()" (input)="onSearch($any($event.target).value)" />
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
          <ui-select variant="compact" label="Opération" [options]="kindFilterOptions" [value]="kind()" [highlight]="!!kind()" (valueChange)="onFilterChange('kind', $event)" />
          @if (q() || kind() || scoopFilter()) {
            <button type="button" class="btn btn-ghost" style="height: 40px; padding: 0 14px; font-size: 13px" (click)="resetFilters()">
              Réinitialiser
            </button>
          }
        </div>

        <section class="card mt-4 overflow-x-auto">
          <table class="tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th>Producteur</th>
                <th>Culture</th>
                <th>Opération</th>
                <th>Note</th>
                <th class="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (row of pager().items(); track row.id) {
                <tr class="row-link" (click)="detailTarget.set(row)">
                  <td>{{ fmtDate(row.doneAt) }}</td>
                  <td class="font-bold">{{ planOf(row.planId)?.producerName ?? "—" }}</td>
                  <td>{{ planOf(row.planId)?.lines?.[row.lineIndex]?.crop ?? "—" }}</td>
                  <td><span class="badge" style="background: var(--v2-sauge); color: var(--v2-foret)">{{ row.kind }}</span></td>
                  <td class="max-w-xs truncate">{{ row.note || "—" }}</td>
                  <td (click)="$event.stopPropagation()">
                    <span class="flex justify-end gap-2">
                      <button type="button" class="act" title="Voir le détail" aria-label="Voir le détail" (click)="detailTarget.set(row)">
                        <ui-icon name="visibility" [size]="18" />
                      </button>
                      @if (store.can("operation.write")) {
                        <button type="button" class="act" title="Modifier l’opération" aria-label="Modifier l’opération" (click)="openEdit(row)">
                          <ui-icon name="edit" [size]="18" />
                        </button>
                        <button type="button" class="act act-danger" title="Supprimer l’opération" aria-label="Supprimer l’opération" (click)="deleteTarget.set(row)">
                          <ui-icon name="delete" [size]="18" />
                        </button>
                      }
                    </span>
                  </td>
                </tr>
              }
            </tbody>
          </table>
          @if (!pager().items().length && !loading()) {
            <ui-empty-state
              [icon]="q() || kind() || scoopFilter() ? 'search' : 'task_alt'"
              [title]="q() || kind() || scoopFilter() ? t()('emptyState.filtered.title') : 'Aucune opération enregistrée'"
              [description]="q() || kind() || scoopFilter() ? t()('emptyState.filtered.description') : 'Les opérations culturales rattachées aux plans apparaîtront ici.'"
            >
              @if (!(q() || kind() || scoopFilter()) && apiMode && store.can("operation.write")) {
                <button type="button" class="btn btn-primary" (click)="openCreate()">
                  <span>Enregistrer une opération</span>
                  <span class="btn-chip" aria-hidden="true"><ui-icon name="add" [size]="16" /></span>
                </button>
              }
            </ui-empty-state>
          }
          <ui-pagination class="px-5 pb-5" [pager]="pager()" />
        </section>
      } @else {
        <div class="surface"><ui-empty>{{ t()("commercial.empty") }}</ui-empty></div>
      }
    </app-shell>

    @if (formOpen()) {
      <ui-modal
        [open]="formOpen()"
        [title]="editing() ? 'Modifier l’opération' : 'Enregistrer une opération'"
        icon="task_alt"
        tone="brand"
        (closed)="formOpen.set(false)"
      >
        <div class="grid gap-4">
          @if (!editing()) {
            <ui-select label="Plan (producteur · culture)" [options]="planOptions()" [value]="formPlanId()" (valueChange)="formPlanId.set($event)" />
          }
          <div class="grid items-start gap-4 sm:grid-cols-2">
            <ui-select label="Opération" [options]="kindOptions" [value]="formKind()" (valueChange)="formKind.set($any($event))" />
            <ui-text-field label="Date" type="date" [value]="formDate()" (valueChange)="formDate.set($event)" />
          </div>
          <ui-text-field label="Note" optional="facultatif" [value]="formNote()" (valueChange)="formNote.set($event)" />
        </div>
        <div modal-footer class="flex justify-end gap-3">
          <button type="button" class="btn btn-ghost" (click)="formOpen.set(false)">Annuler</button>
          <button type="button" class="btn btn-primary" [disabled]="saving() || (!editing() && !formPlanId())" (click)="submitForm()">
            <span>{{ editing() ? "Enregistrer" : "Enregistrer" }}</span>
            <span class="btn-chip" aria-hidden="true"><ui-icon name="check" [size]="16" /></span>
          </button>
        </div>
      </ui-modal>
    }

    @if (detailTarget(); as op) {
      <ui-modal
        [open]="!!detailTarget()"
        [title]="op.kind + ' · ' + (planOf(op.planId)?.producerName ?? 'Producteur')"
        [description]="(planOf(op.planId)?.lines?.[op.lineIndex]?.crop ?? 'Culture') + ' · ' + fmtDate(op.doneAt)"
        icon="task_alt"
        tone="brand"
        (closed)="detailTarget.set(null)"
      >
        <div class="grid gap-3 text-[13px]">
          <div class="flex items-center justify-between rounded-xl border p-3.5" style="border-color: var(--border)">
            <span class="font-semibold" style="color: var(--ink-2)">Campagne</span>
            <span class="font-bold">{{ planOf(op.planId)?.campaign ?? "—" }}</span>
          </div>
          <div class="rounded-xl border p-3.5" style="border-color: var(--border)">
            <p class="lbl mb-1">Note d’observation</p>
            <p>{{ op.note || "Aucune note saisie." }}</p>
          </div>
        </div>
        <div modal-footer class="flex justify-end gap-3">
          @if (store.can("operation.write")) {
            <button type="button" class="btn btn-ghost" (click)="detailTarget.set(null); openEdit(op)">Modifier</button>
          }
          <button type="button" class="btn btn-primary" (click)="detailTarget.set(null)">Fermer</button>
        </div>
      </ui-modal>
    }

    @if (deleteTarget(); as op) {
      <ui-modal
        [open]="!!deleteTarget()"
        title="Supprimer cette opération ?"
        [description]="op.kind + ' du ' + fmtDate(op.doneAt) + ' (' + (planOf(op.planId)?.producerName ?? '—') + ')'"
        icon="delete"
        tone="danger"
        (closed)="deleteTarget.set(null)"
      >
        <p class="text-[13px]" style="color: var(--ink-2)">Cette opération sera retirée du suivi et l’action sera journalisée.</p>
        <div modal-footer class="flex justify-end gap-3">
          <button type="button" class="btn btn-ghost" (click)="deleteTarget.set(null)">Annuler</button>
          <button type="button" class="btn btn-danger" [disabled]="saving()" (click)="confirmDelete(op)">Supprimer</button>
        </div>
      </ui-modal>
    }
  `,
})
export default class SuiviPage {
  protected readonly store = inject(StoreService);
  private readonly snackbar = inject(SnackbarService);
  protected readonly t = inject(LocaleService).t;
  protected readonly apiMode = isApiMode();
  protected readonly perms = ["operation.read"] as const;
  protected readonly fmtDate = fmtDate;

  protected readonly q = signal("");
  protected readonly kind = signal("");
  protected readonly scoopFilter = signal("");
  protected readonly page = signal(1);
  protected readonly limit = signal(20);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  private readonly rows = signal<OperationDto[]>([]);
  private readonly meta = signal<PageMeta>({ total: 0, page: 1, limit: 20, pages: 1 });
  private readonly overview = signal<AgronomyStatsDto | null>(null);
  private readonly plans = signal<Map<string, PlanDto>>(new Map());
  private readonly reloadTick = signal(0);

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<OperationDto | null>(null);
  protected readonly formPlanId = signal("");
  protected readonly formKind = signal<OperationKindDto>("semis");
  protected readonly formDate = signal(new Date().toISOString().slice(0, 10));
  protected readonly formNote = signal("");
  protected readonly detailTarget = signal<OperationDto | null>(null);
  protected readonly deleteTarget = signal<OperationDto | null>(null);

  protected readonly scoopFilterOptions = computed<SelectOption[]>(() => [
    { value: "", label: "Toutes les coopératives" },
    ...this.store.state().scoops.map((s) => ({ value: s.id, label: s.name })),
  ]);
  protected readonly kindFilterOptions: SelectOption[] = [{ value: "", label: "Toutes les opérations" }, ...OPERATION_KINDS.map((k) => ({ value: k, label: k }))];
  protected readonly kindOptions: SelectOption[] = OPERATION_KINDS.map((k) => ({ value: k, label: k }));
  protected readonly planOptions = computed<SelectOption[]>(() =>
    [...this.plans().values()]
      .filter((p) => p.status !== "brouillon")
      .map((p) => ({ value: p.id, label: `${p.producerName} · ${p.lines.map((l) => l.crop).join(", ")}` })),
  );

  private readonly filteredRows = computed(() => {
    const needle = this.q().trim().toLowerCase();
    if (!needle) return this.rows();
    return this.rows().filter((op) => {
      const plan = this.plans().get(op.planId);
      const crop = plan?.lines?.[op.lineIndex]?.crop ?? "";
      return (
        (plan?.producerName ?? "").toLowerCase().includes(needle) ||
        crop.toLowerCase().includes(needle) ||
        (op.note ?? "").toLowerCase().includes(needle) ||
        op.kind.toLowerCase().includes(needle)
      );
    });
  });

  private readonly serverPager = createServerPager({ items: this.filteredRows, meta: this.meta, page: this.page, limit: this.limit });
  protected readonly pager = computed(() => this.serverPager);

  protected readonly stats = computed<StatCard[]>(() => [
    { label: "Opérations saisies", value: nf.format(this.overview()?.operations ?? 0), sub: "", icon: "task_alt", ...TONE.succes },
    { label: "Campagne active", value: this.overview()?.runningCampaign ?? "—", sub: "", icon: "calendar_month", ...TONE.info },
    { label: "Calendriers validés", value: nf.format(this.overview()?.validatedCalendars ?? 0), sub: "", icon: "verified", bg: "", fg: "" },
    { label: "Plans à lancer", value: nf.format(this.overview()?.plans["validé"] ?? 0), sub: "", icon: "warning", ...TONE.attente },
  ]);

  constructor() {
    effect(() => {
      if (!this.apiMode) return;
      const page = this.page();
      const limit = this.limit();
      const kind = this.kind();
      const scoopId = this.scoopFilter();
      this.reloadTick();
      void this.load(page, limit, kind, scoopId);
    });
  }

  private async load(page: number, limit: number, kind: string, scoopId: string) {
    this.loading.set(true);
    try {
      const [res, overview, plans] = await Promise.all([
        listOperations({ page, limit, kind: kind || undefined, scoopId: scoopId || undefined }),
        getAgronomyStats(),
        listPlans({ limit: 100 }),
      ]);
      this.meta.set({ total: res.total, page: res.page, limit: res.limit, pages: res.pages });
      this.rows.set(res.items);
      this.overview.set(overview);
      this.plans.set(new Map(plans.items.map((plan) => [plan.id, plan])));
    } finally {
      this.loading.set(false);
    }
  }

  protected planOf(id: string): PlanDto | undefined {
    return this.plans().get(id);
  }

  protected onSearch(value: string) {
    this.q.set(value);
  }

  protected onFilterChange(field: "kind" | "scoop", value: string) {
    if (field === "kind") this.kind.set(value);
    else this.scoopFilter.set(value);
    this.page.set(1);
  }

  protected resetFilters() {
    this.q.set("");
    this.kind.set("");
    this.scoopFilter.set("");
    this.page.set(1);
  }

  protected openCreate() {
    this.editing.set(null);
    this.formPlanId.set(this.planOptions()[0]?.value ?? "");
    this.formKind.set("semis");
    this.formDate.set(new Date().toISOString().slice(0, 10));
    this.formNote.set("");
    this.formOpen.set(true);
  }

  protected openEdit(row: OperationDto) {
    this.editing.set(row);
    this.formKind.set(row.kind);
    this.formDate.set(row.doneAt.slice(0, 10));
    this.formNote.set(row.note ?? "");
    this.formOpen.set(true);
  }

  protected async submitForm() {
    if (this.saving()) return;
    this.saving.set(true);
    try {
      const target = this.editing();
      if (target) {
        await updateOperation(target.id, {
          kind: this.formKind(),
          doneAt: this.formDate(),
          note: this.formNote().trim(),
        });
        this.snackbar.success("Opération mise à jour.");
      } else {
        await createOperation({
          planId: this.formPlanId(),
          lineIndex: 0,
          kind: this.formKind(),
          doneAt: this.formDate(),
          note: this.formNote().trim() || undefined,
        });
        this.snackbar.success("Opération enregistrée.");
      }
      this.formOpen.set(false);
      this.reloadTick.update((v) => v + 1);
    } catch {
      this.snackbar.error("Impossible d’enregistrer l’opération.");
    } finally {
      this.saving.set(false);
    }
  }

  protected async confirmDelete(row: OperationDto) {
    if (this.saving()) return;
    this.saving.set(true);
    try {
      await deleteOperation(row.id);
      this.deleteTarget.set(null);
      this.reloadTick.update((v) => v + 1);
      this.snackbar.info("Opération supprimée.");
    } catch {
      this.snackbar.error("Impossible de supprimer cette opération.");
    } finally {
      this.saving.set(false);
    }
  }
}
