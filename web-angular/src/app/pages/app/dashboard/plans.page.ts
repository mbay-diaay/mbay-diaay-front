import { Component, computed, effect, inject, signal } from "@angular/core";

import { isApiMode } from "@/lib/api/config";
import {
  createPlan,
  getAgronomyStats,
  listCampaigns,
  listOperations,
  listPlans,
  updatePlan,
  validatePlan,
  type AgronomyStatsDto,
  type CampaignDto,
  type OperationDto,
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

type DraftLine = { crop: string; areaHa: string; sowingMonth: string };

@Component({
  selector: "app-plans-page",
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
    <app-shell [perm]="perms" [area]="t()('nav.item.plans')">
      <ui-page-header [title]="t()('nav.item.plans')" [description]="t()('agronomique.plans.description')">
        @if (apiMode && store.can("plan.write")) {
          <button actions type="button" class="btn btn-primary" (click)="openCreate()">
            <span>Nouveau plan</span>
            <span class="btn-chip" aria-hidden="true"><ui-icon name="add" [size]="16" /></span>
          </button>
        }
      </ui-page-header>

      @if (apiMode) {
        <ui-stat-cards class="rise mt-6" [stats]="stats()" />

        <div class="toolbar card mt-6">
          <div class="search">
            <ui-icon name="search" [size]="18" />
            <input type="search" placeholder="Rechercher un producteur ou une culture…" [value]="q()" (input)="onSearch($any($event.target).value)" />
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
          <ui-select variant="compact" label="Statut" [options]="statusOptions" [value]="status()" [highlight]="!!status()" (valueChange)="onFilterChange('status', $event)" />
          @if (q() || status() || scoopFilter()) {
            <button type="button" class="btn btn-ghost" style="height: 40px; padding: 0 14px; font-size: 13px" (click)="resetFilters()">
              Réinitialiser
            </button>
          }
        </div>

        <section class="card mt-4 overflow-x-auto">
          <table class="tbl">
            <thead>
              <tr>
                <th>Producteur</th>
                <th>Coopérative</th>
                <th>Campagne</th>
                <th>Cultures</th>
                <th class="num">Surface (ha)</th>
                <th>Statut</th>
                <th class="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (row of pager().items(); track row.id) {
                <tr class="row-link" (click)="openDetail(row)">
                  <td class="font-bold">{{ row.producerName }}</td>
                  <td>{{ scoopLabel(row.scoopId) }}</td>
                  <td>{{ row.campaign }}</td>
                  <td>{{ crops(row) }}</td>
                  <td class="num">{{ area(row) }}</td>
                  <td><span class="badge" [style]="tone(row.status)">{{ row.status }}</span></td>
                  <td (click)="$event.stopPropagation()">
                    <span class="flex justify-end gap-2">
                      <button type="button" class="act" title="Voir le détail" aria-label="Voir le détail" (click)="openDetail(row)">
                        <ui-icon name="visibility" [size]="18" />
                      </button>
                      @if (row.status === "brouillon" && store.can("plan.write")) {
                        <button type="button" class="act" title="Modifier le plan" aria-label="Modifier le plan" (click)="openEdit(row)">
                          <ui-icon name="edit" [size]="18" />
                        </button>
                        <button type="button" class="act" title="Valider le plan" aria-label="Valider le plan" (click)="validate(row)">
                          <ui-icon name="task_alt" [size]="18" />
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
              [icon]="q() || status() || scoopFilter() ? 'search' : 'grass'"
              [title]="q() || status() || scoopFilter() ? t()('emptyState.filtered.title') : 'Aucun plan d’exploitation'"
              [description]="q() || status() || scoopFilter() ? t()('emptyState.filtered.description') : 'Les plans de campagne des producteurs apparaîtront ici.'"
            >
              @if (!(q() || status() || scoopFilter()) && apiMode && store.can("plan.write")) {
                <button type="button" class="btn btn-primary" (click)="openCreate()">
                  <span>Nouveau plan</span>
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
        [title]="editing() ? 'Modifier le plan · ' + editing()!.producerName : 'Nouveau plan d’exploitation'"
        icon="grass"
        tone="brand"
        [width]="680"
        (closed)="formOpen.set(false)"
      >
        <div class="grid gap-4">
          @if (!editing()) {
            <ui-producer-select
              label="Producteur"
              [scoopId]="scoopFilter() || undefined"
              [selected]="selectedProducer()"
              (selectedChange)="selectedProducer.set($event)"
            />
          }
          <ui-select label="Campagne" [options]="campaignOptions()" [value]="formCampaign()" (valueChange)="formCampaign.set($event)" />
          <div class="flex items-center justify-between">
            <p class="lbl">Cultures prévues ({{ formLines().length }})</p>
            <button type="button" class="btn btn-ghost" style="height: 34px; padding: 0 12px; font-size: 13px" (click)="addLine()">
              <ui-icon name="add" [size]="16" /> Ajouter une culture
            </button>
          </div>
          <div class="grid max-h-60 gap-3 overflow-y-auto pr-1">
            @for (line of formLines(); track $index) {
              <div class="grid items-end gap-3 rounded-xl border p-3 sm:grid-cols-[1.3fr_0.8fr_0.9fr_auto]" style="border-color: var(--border)">
                <ui-text-field label="Culture" placeholder="Ex. : Oignon" [value]="line.crop" (valueChange)="patchLine($index, 'crop', $event)" />
                <ui-text-field label="Surface (ha)" type="number" [value]="line.areaHa" (valueChange)="patchLine($index, 'areaHa', $event)" />
                <ui-text-field label="Mois semis" type="text" placeholder="AAAA-MM" optional="facultatif" [value]="line.sowingMonth" (valueChange)="patchLine($index, 'sowingMonth', $event)" />
                <button
                  type="button"
                  class="act act-danger"
                  title="Retirer la ligne"
                  [disabled]="formLines().length <= 1"
                  (click)="removeLine($index)"
                >
                  <ui-icon name="delete" [size]="18" />
                </button>
              </div>
            }
          </div>
          <ui-text-field label="Notes" optional="facultatif" [value]="formNotes()" (valueChange)="formNotes.set($event)" />
        </div>
        <div modal-footer class="flex justify-end gap-3">
          <button type="button" class="btn btn-ghost" (click)="formOpen.set(false)">Annuler</button>
          <button type="button" class="btn btn-primary" [disabled]="saving() || !canSubmit()" (click)="submitForm()">
            <span>{{ editing() ? "Enregistrer" : "Créer le plan" }}</span>
            <span class="btn-chip" aria-hidden="true"><ui-icon name="check" [size]="16" /></span>
          </button>
        </div>
      </ui-modal>
    }

    @if (detailTarget(); as plan) {
      <ui-modal
        [open]="!!detailTarget()"
        [title]="'Plan · ' + plan.producerName"
        [description]="scoopLabel(plan.scoopId) + ' · Campagne ' + plan.campaign + ' · ' + area(plan) + ' ha'"
        icon="grass"
        tone="brand"
        [width]="680"
        (closed)="detailTarget.set(null)"
      >
        <div class="grid gap-4">
          <div class="flex items-center justify-between rounded-xl border p-3.5" style="border-color: var(--border)">
            <span class="text-[13px] font-semibold" style="color: var(--ink-2)">Statut du plan</span>
            <span class="badge" [style]="tone(plan.status)">{{ plan.status }}</span>
          </div>
          <div class="grid gap-2">
            <p class="lbl">Cultures prévues ({{ plan.lines.length }})</p>
            <div class="grid gap-2">
              @for (line of plan.lines; track $index) {
                <div class="flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-[13px]" style="border-color: var(--border)">
                  <span class="font-bold">{{ line.crop }}</span>
                  <span class="flex items-center gap-4">
                    @if (line.sowingMonth) {
                      <span style="color: var(--ink-2)">Semis : {{ line.sowingMonth }}</span>
                    }
                    <span class="font-semibold">{{ line.areaHa }} ha</span>
                  </span>
                </div>
              }
            </div>
          </div>
          @if (plan.notes) {
            <div class="rounded-xl border p-3.5 text-[13px]" style="border-color: var(--border)">
              <p class="lbl mb-1">Notes</p>
              <p>{{ plan.notes }}</p>
            </div>
          }
          <div class="grid gap-2">
            <p class="lbl">Opérations enregistrées</p>
            @if (detailOpsLoading()) {
              <p class="text-[13px]" style="color: var(--ink-2)">Chargement…</p>
            } @else if (!detailOps().length) {
              <p class="text-[13px]" style="color: var(--ink-2)">Aucune opération enregistrée sur ce plan.</p>
            } @else {
              <div class="grid gap-2">
                @for (op of detailOps(); track op.id) {
                  <div class="flex items-center justify-between rounded-lg border px-3 py-2 text-[13px]" style="border-color: var(--border)">
                    <span class="badge" style="background: var(--v2-sauge); color: var(--v2-foret)">{{ op.kind }}</span>
                    <span style="color: var(--ink-2)">{{ fmtDate(op.doneAt) }}{{ op.note ? ' · ' + op.note : '' }}</span>
                  </div>
                }
              </div>
            }
          </div>
        </div>
        <div modal-footer class="flex justify-end gap-3">
          @if (plan.status === "brouillon" && store.can("plan.write")) {
            <button type="button" class="btn btn-ghost" (click)="detailTarget.set(null); openEdit(plan)">Modifier</button>
            <button type="button" class="btn btn-primary" (click)="validate(plan); detailTarget.set(null)">Valider</button>
          } @else {
            <button type="button" class="btn btn-primary" (click)="detailTarget.set(null)">Fermer</button>
          }
        </div>
      </ui-modal>
    }
  `,
})
export default class PlansPage {
  protected readonly store = inject(StoreService);
  private readonly snackbar = inject(SnackbarService);
  protected readonly t = inject(LocaleService).t;
  protected readonly apiMode = isApiMode();
  protected readonly perms = ["plan.read"] as const;
  protected readonly fmtDate = fmtDate;

  protected readonly q = signal("");
  protected readonly status = signal("");
  protected readonly scoopFilter = signal("");
  protected readonly page = signal(1);
  protected readonly limit = signal(20);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  private readonly rows = signal<PlanDto[]>([]);
  private readonly meta = signal<PageMeta>({ total: 0, page: 1, limit: 20, pages: 1 });
  private readonly overview = signal<AgronomyStatsDto | null>(null);
  private readonly campaigns = signal<CampaignDto[]>([]);
  private readonly reloadTick = signal(0);

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<PlanDto | null>(null);
  protected readonly selectedProducer = signal<ProducerSelection | null>(null);
  protected readonly formCampaign = signal("");
  protected readonly formLines = signal<DraftLine[]>([{ crop: "", areaHa: "1.5", sowingMonth: "" }]);
  protected readonly formNotes = signal("");

  protected readonly detailTarget = signal<PlanDto | null>(null);
  protected readonly detailOps = signal<OperationDto[]>([]);
  protected readonly detailOpsLoading = signal(false);

  private readonly scoopName = computed(() => new Map(this.store.state().scoops.map((s) => [s.id, s.name])));
  protected readonly scoopFilterOptions = computed<SelectOption[]>(() => [
    { value: "", label: "Toutes les coopératives" },
    ...this.store.state().scoops.map((s) => ({ value: s.id, label: s.name })),
  ]);
  protected readonly campaignOptions = computed<SelectOption[]>(() =>
    this.campaigns().map((c) => ({ value: c.name, label: `${c.name} (${c.status})` })),
  );
  protected readonly statusOptions: SelectOption[] = [
    { value: "", label: "Tous les statuts" },
    { value: "brouillon", label: "Brouillon" },
    { value: "validé", label: "Validé" },
    { value: "à jour", label: "À jour" },
  ];

  private readonly serverPager = createServerPager({ items: this.rows, meta: this.meta, page: this.page, limit: this.limit });
  protected readonly pager = computed(() => this.serverPager);

  protected readonly stats = computed<StatCard[]>(() => {
    const o = this.overview();
    return [
      { label: "Plans saisis", value: nf.format(o?.plans.total ?? 0), sub: "", icon: "grass", bg: "", fg: "" },
      { label: "Campagne active", value: o?.runningCampaign ?? "—", sub: "", icon: "calendar_month", ...TONE.info },
      { label: "Validés / À jour", value: nf.format((o?.plans["validé"] ?? 0) + (o?.plans["à jour"] ?? 0)), sub: "", icon: "verified", ...TONE.succes },
      { label: "Opérations", value: nf.format(o?.operations ?? 0), sub: "", icon: "task_alt", ...TONE.neutre },
    ];
  });

  constructor() {
    effect(() => {
      if (!this.apiMode) return;
      const page = this.page();
      const limit = this.limit();
      const q = this.q();
      const status = this.status();
      const scoopId = this.scoopFilter();
      this.reloadTick();
      void this.load(page, limit, q, status, scoopId);
    });
  }

  private async load(page: number, limit: number, q: string, status: string, scoopId: string) {
    this.loading.set(true);
    try {
      const [res, overview, camps] = await Promise.all([
        listPlans({ page, limit, q, status: status || undefined, scoopId: scoopId || undefined }),
        getAgronomyStats(),
        listCampaigns({ limit: 50 }),
      ]);
      this.meta.set({ total: res.total, page: res.page, limit: res.limit, pages: res.pages });
      this.rows.set(res.items);
      this.overview.set(overview);
      this.campaigns.set(camps.items);
    } finally {
      this.loading.set(false);
    }
  }

  protected scoopLabel(id: string) {
    return this.scoopName().get(id) ?? id;
  }
  protected crops(p: PlanDto) {
    return p.lines.map((l) => l.crop).join(", ") || "—";
  }
  protected area(p: PlanDto) {
    return Math.round(p.lines.reduce((s, l) => s + l.areaHa, 0) * 100) / 100;
  }

  protected onSearch(v: string) {
    this.q.set(v);
    this.page.set(1);
  }
  protected onFilterChange(kind: "scoop" | "status", v: string) {
    if (kind === "scoop") this.scoopFilter.set(v);
    else this.status.set(v);
    this.page.set(1);
  }
  protected resetFilters() {
    this.q.set("");
    this.status.set("");
    this.scoopFilter.set("");
    this.page.set(1);
  }

  protected addLine() {
    this.formLines.update((list) => [...list, { crop: "", areaHa: "1", sowingMonth: "" }]);
  }
  protected removeLine(index: number) {
    this.formLines.update((list) => (list.length > 1 ? list.filter((_, i) => i !== index) : list));
  }
  protected patchLine(index: number, field: keyof DraftLine, value: string) {
    this.formLines.update((list) => list.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  }

  protected canSubmit(): boolean {
    const hasCampaign = !!this.formCampaign();
    const hasLines = this.formLines().every((l) => l.crop.trim() && Number(l.areaHa) > 0);
    return hasCampaign && hasLines && (!!this.editing() || !!this.selectedProducer());
  }

  protected openCreate() {
    this.editing.set(null);
    this.selectedProducer.set(null);
    this.formCampaign.set(this.campaigns()[0]?.name ?? "");
    this.formLines.set([{ crop: "", areaHa: "1.5", sowingMonth: "" }]);
    this.formNotes.set("");
    this.formOpen.set(true);
  }

  protected openEdit(row: PlanDto) {
    this.editing.set(row);
    this.formCampaign.set(row.campaign);
    this.formLines.set(
      row.lines.map((l) => ({
        crop: l.crop,
        areaHa: String(l.areaHa),
        sowingMonth: l.sowingMonth ?? "",
      })),
    );
    this.formNotes.set(row.notes ?? "");
    this.formOpen.set(true);
  }

  protected async openDetail(row: PlanDto) {
    this.detailTarget.set(row);
    this.detailOpsLoading.set(true);
    try {
      const res = await listOperations({ planId: row.id, limit: 20 });
      this.detailOps.set(res.items);
    } finally {
      this.detailOpsLoading.set(false);
    }
  }

  protected async submitForm() {
    if (this.saving() || !this.canSubmit()) return;
    this.saving.set(true);
    try {
      const lines = this.formLines().map((l) => ({
        crop: l.crop.trim(),
        areaHa: Number(l.areaHa),
        sowingMonth: l.sowingMonth.trim() || undefined,
      }));
      const target = this.editing();
      if (target) {
        await updatePlan(target.id, {
          campaign: this.formCampaign(),
          lines,
          notes: this.formNotes().trim(),
        });
        this.snackbar.success("Plan d’exploitation mis à jour.");
      } else {
        const selected = this.selectedProducer()!;
        await createPlan({
          scoopId: selected.scoopId,
          producerId: selected.id,
          producerName: selected.name,
          campaign: this.formCampaign(),
          lines,
          notes: this.formNotes().trim() || undefined,
        });
        this.snackbar.success("Plan d’exploitation enregistré.");
      }
      this.formOpen.set(false);
      this.reloadTick.update((v) => v + 1);
    } catch {
      this.snackbar.error("Impossible d’enregistrer le plan d’exploitation.");
    } finally {
      this.saving.set(false);
    }
  }

  protected async validate(row: PlanDto) {
    try {
      await validatePlan(row.id);
      this.reloadTick.update((v) => v + 1);
      this.snackbar.success(`Plan de « ${row.producerName} » validé.`);
    } catch {
      this.snackbar.error("Impossible de valider ce plan.");
    }
  }

  protected tone(s: string) {
    const t = s === "à jour" || s === "validé" ? TONE.succes : TONE.attente;
    return `background:${t.bg};color:${t.fg}`;
  }
}
