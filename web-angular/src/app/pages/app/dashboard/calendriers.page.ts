import { Component, computed, effect, inject, signal } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router } from "@angular/router";
import { map, startWith } from "rxjs";

import { isApiMode } from "@/lib/api/config";
import type { CalendarEvent } from "@/lib/calendar";
import {
  createCalendar,
  listCalendars,
  OPERATION_KINDS,
  updateCalendar,
  validateCalendar,
  type CalendarDto,
  type OperationKindDto,
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
  UiEventCalendarComponent,
  UiPageHeaderComponent,
  V2_PAGE_STYLES,
  type SelectOption,
  type StatCard,
} from "@shared/ui";

type DraftStep = { id: string; kind: OperationKindDto; offsetDays: string; durationDays: string; note: string };

@Component({
  selector: "app-calendriers-page",
  imports: [
    AppShellComponent,
    UiPageHeaderComponent,
    UiEmptyComponent,
    UiEmptyStateComponent,
    UiEventCalendarComponent,
    StatCardsComponent,
    PaginationComponent,
    IconComponent,
    ModalComponent,
    SelectComponent,
    TextFieldComponent,
  ],
  styles: [V2_PAGE_STYLES],
  template: `
    <app-shell [perm]="perms" [area]="t()('nav.item.calendriers')">
      <ui-page-header [title]="t()('nav.item.calendriers')" [description]="t()('agronomique.calendriers.description')">
        @if (apiMode && store.can("calendar.write")) {
          <button actions type="button" class="btn btn-primary" (click)="openCreate()">
            <span>Nouveau calendrier</span>
            <span class="btn-chip" aria-hidden="true"><ui-icon name="add" [size]="16" /></span>
          </button>
        }
      </ui-page-header>

      @if (apiMode) {
        <ui-stat-cards class="rise mt-6" [stats]="stats()" />

        <div class="toolbar card mt-6">
          <div class="search">
            <ui-icon name="search" [size]="18" />
            <input type="search" placeholder="Rechercher une culture…" [value]="q()" (input)="onSearch($any($event.target).value)" />
          </div>
          <ui-select variant="compact" label="Statut" [options]="statusOptions" [value]="status()" [highlight]="!!status()" (valueChange)="onStatus($event)" />
          @if (q() || status()) {
            <button type="button" class="btn btn-ghost" style="height: 40px; padding: 0 14px; font-size: 13px" (click)="resetFilters()">
              Réinitialiser
            </button>
          }
          <div class="seg ml-auto" role="radiogroup" aria-label="Affichage">
            <button
              type="button"
              role="radio"
              [class.on]="vueMode() === 'liste'"
              [attr.aria-checked]="vueMode() === 'liste'"
              (click)="setVueMode('liste')"
            >
              <ui-icon name="view_list" [size]="18" />Liste
            </button>
            <button
              type="button"
              role="radio"
              [class.on]="vueMode() === 'calendrier'"
              [attr.aria-checked]="vueMode() === 'calendrier'"
              (click)="setVueMode('calendrier')"
            >
              <ui-icon name="calendar_month" [size]="18" />Calendrier
            </button>
          </div>
        </div>

        @if (vueMode() === "calendrier") {
          <section class="card mt-4 p-4 sm:p-5">
            <ui-event-calendar
              [events]="calendarEvents()"
              [categories]="calendarCategories"
              [dayCreateEnabled]="store.can('calendar.write')"
              (dayCreate)="openCreate()"
            />
          </section>
        } @else {
          <section class="card mt-4 overflow-x-auto">
            <table class="tbl">
              <thead>
                <tr>
                  <th>Culture</th>
                  <th>Version</th>
                  <th>Étapes (jours depuis le semis)</th>
                  <th>Statut</th>
                  <th>Validé par</th>
                  <th class="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (row of pager().items(); track row.id) {
                  <tr class="row-link" (click)="detailTarget.set(row)">
                    <td class="font-bold">{{ row.crop }}</td>
                    <td>v{{ row.version }}</td>
                    <td>{{ summary(row) }}</td>
                    <td><span class="badge" [style]="tone(row.status)">{{ row.status }}</span></td>
                    <td>{{ row.validatedBy || "—" }}</td>
                    <td (click)="$event.stopPropagation()">
                      <span class="flex justify-end gap-2">
                        <button type="button" class="act" title="Voir l’itinéraire technique" aria-label="Voir le détail" (click)="detailTarget.set(row)">
                          <ui-icon name="visibility" [size]="18" />
                        </button>
                        @if (row.status === "brouillon" && store.can("calendar.write")) {
                          <button type="button" class="act" title="Modifier le brouillon" aria-label="Modifier le brouillon" (click)="openEdit(row)">
                            <ui-icon name="edit" [size]="18" />
                          </button>
                        }
                        @if (row.status === "brouillon" && store.can("calendar.validate")) {
                          <button type="button" class="act" title="Valider ce calendrier" aria-label="Valider ce calendrier" (click)="validate(row)">
                            <ui-icon name="task_alt" [size]="18" />
                          </button>
                        }
                        @if (row.status !== "brouillon" && store.can("calendar.write")) {
                          <button type="button" class="act" title="Dupliquer en nouveau brouillon" aria-label="Dupliquer en nouveau brouillon" (click)="duplicateAsDraft(row)">
                            <ui-icon name="content_copy" [size]="18" />
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
                [icon]="q() || status() ? 'search' : 'calendar_today'"
                [title]="q() || status() ? t()('emptyState.filtered.title') : 'Aucun calendrier cultural'"
                [description]="q() || status() ? t()('emptyState.filtered.description') : 'Les itinéraires techniques par culture apparaîtront ici.'"
              >
                @if (!(q() || status()) && apiMode && store.can("calendar.write")) {
                  <button type="button" class="btn btn-primary" (click)="openCreate()">
                    <span>Nouveau calendrier</span>
                    <span class="btn-chip" aria-hidden="true"><ui-icon name="add" [size]="16" /></span>
                  </button>
                }
              </ui-empty-state>
            }
            <ui-pagination class="px-5 pb-5" [pager]="pager()" />
          </section>
        }
      } @else {
        <div class="surface"><ui-empty>{{ t()("commercial.empty") }}</ui-empty></div>
      }
    </app-shell>

    @if (formOpen()) {
      <ui-modal
        [open]="formOpen()"
        [title]="editing() ? 'Modifier le brouillon · ' + editing()!.crop : 'Nouveau calendrier cultural'"
        icon="calendar_today"
        tone="brand"
        [width]="680"
        (closed)="formOpen.set(false)"
      >
        <div class="grid gap-4">
          <ui-text-field label="Culture" placeholder="Ex. : Oignon" [value]="formCrop()" (valueChange)="formCrop.set($event)" />
          <div class="flex items-center justify-between">
            <p class="lbl">Étapes culturales ({{ formSteps().length }})</p>
            <button type="button" class="btn btn-ghost" style="height: 34px; padding: 0 12px; font-size: 13px" (click)="addStep()">
              <ui-icon name="add" [size]="16" /> Ajouter une étape
            </button>
          </div>
          <div class="grid max-h-72 gap-3 overflow-y-auto pr-1">
            @for (step of formSteps(); track $index) {
              <div class="grid items-end gap-3 rounded-xl border p-3 sm:grid-cols-[1.3fr_0.7fr_0.7fr_auto]" style="border-color: var(--border)">
                <ui-select label="Opération" [options]="kindOptions" [value]="step.kind" (valueChange)="patchStep($index, 'kind', $event)" />
                <ui-text-field label="J+" type="number" [value]="step.offsetDays" (valueChange)="patchStep($index, 'offsetDays', $event)" />
                <ui-text-field label="Durée (j)" type="number" [value]="step.durationDays" (valueChange)="patchStep($index, 'durationDays', $event)" />
                <button
                  type="button"
                  class="act act-danger"
                  title="Retirer l’étape"
                  [disabled]="formSteps().length <= 1"
                  (click)="removeStep($index)"
                >
                  <ui-icon name="delete" [size]="18" />
                </button>
                <div class="sm:col-span-4">
                  <ui-text-field label="Consigne / Note" optional="facultatif" [value]="step.note" (valueChange)="patchStep($index, 'note', $event)" />
                </div>
              </div>
            }
          </div>
        </div>
        <div modal-footer class="flex justify-end gap-3">
          <button type="button" class="btn btn-ghost" (click)="formOpen.set(false)">Annuler</button>
          <button type="button" class="btn btn-primary" [disabled]="saving() || !formCrop().trim() || !formSteps().length" (click)="submitForm()">
            <span>{{ editing() ? "Enregistrer le brouillon" : "Créer le brouillon" }}</span>
            <span class="btn-chip" aria-hidden="true"><ui-icon name="check" [size]="16" /></span>
          </button>
        </div>
      </ui-modal>
    }

    @if (detailTarget(); as cal) {
      <ui-modal
        [open]="!!detailTarget()"
        [title]="cal.crop + ' · v' + cal.version"
        [description]="cal.validatedBy ? 'Validé par ' + cal.validatedBy + (cal.validatedAt ? ' le ' + fmtDate(cal.validatedAt) : '') : 'En attente de validation'"
        icon="calendar_today"
        tone="brand"
        [width]="640"
        (closed)="detailTarget.set(null)"
      >
        <div class="grid gap-4">
          <div class="flex items-center justify-between rounded-xl border p-3.5" style="border-color: var(--border)">
            <span class="text-[13px] font-semibold" style="color: var(--ink-2)">Statut de cette version</span>
            <span class="badge" [style]="tone(cal.status)">{{ cal.status }}</span>
          </div>
          <div class="grid gap-2">
            <p class="lbl">Frise des étapes ({{ cal.steps.length }})</p>
            <div class="grid gap-2">
              @for (step of cal.steps; track $index) {
                <div class="flex items-start justify-between gap-3 rounded-xl border p-3" style="border-color: var(--border)">
                  <div class="grid gap-1">
                    <div class="flex items-center gap-2">
                      <span class="badge" style="background: var(--v2-sauge); color: var(--v2-foret)">{{ step.kind }}</span>
                      <span class="text-[13px] font-bold">Jour +{{ step.offsetDays }}</span>
                    </div>
                    @if (step.note) {
                      <p class="text-[13px]" style="color: var(--ink-2)">{{ step.note }}</p>
                    }
                  </div>
                  <span class="text-[12px] font-semibold" style="color: var(--ink-2)">{{ step.durationDays }} j</span>
                </div>
              }
            </div>
          </div>
        </div>
        <div modal-footer class="flex justify-end gap-3">
          @if (cal.status === "brouillon" && store.can("calendar.write")) {
            <button type="button" class="btn btn-ghost" (click)="detailTarget.set(null); openEdit(cal)">Modifier</button>
          }
          @if (cal.status === "brouillon" && store.can("calendar.validate")) {
            <button type="button" class="btn btn-primary" (click)="validate(cal); detailTarget.set(null)">Valider</button>
          } @else {
            <button type="button" class="btn btn-primary" (click)="detailTarget.set(null)">Fermer</button>
          }
        </div>
      </ui-modal>
    }
  `,
})
export default class CalendriersPage {
  protected readonly store = inject(StoreService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackbar = inject(SnackbarService);

  private readonly vueFromUrl = toSignal(
    this.route.queryParamMap.pipe(
      map((p) => (p.get("vue") === "calendrier" ? "calendrier" : "liste")),
      startWith(
        this.route.snapshot.queryParamMap.get("vue") === "calendrier" ? "calendrier" : "liste",
      ),
    ),
    { requireSync: true },
  );
  protected readonly vueMode = computed(() => this.vueFromUrl() ?? "liste");

  protected readonly calendarCategories = OPERATION_KINDS.map((kind) => [kind, kind] as const);

  protected readonly calendarEvents = computed((): CalendarEvent[] => {
    const base = new Date();
    base.setHours(8, 0, 0, 0);
    const events: CalendarEvent[] = [];
    for (const calendar of this.rows()) {
      for (let index = 0; index < calendar.steps.length; index++) {
        const step = calendar.steps[index];
        const start = new Date(base.getTime() + step.offsetDays * 86_400_000);
        const end = new Date(start.getTime() + Math.max(1, step.durationDays) * 86_400_000);
        events.push({
          id: `${calendar.id}-${index}`,
          title: `${calendar.crop} · ${step.kind}`,
          start,
          end,
          tone: calendar.status === "validé" ? "success" : "warning",
          category: step.kind,
          subtitle: `v${calendar.version} · J+${step.offsetDays} (${step.durationDays} j)`,
        });
      }
    }
    return events;
  });
  protected readonly t = inject(LocaleService).t;
  protected readonly apiMode = isApiMode();
  protected readonly perms = ["calendar.read"] as const;
  protected readonly fmtDate = fmtDate;

  protected readonly q = signal("");
  protected readonly status = signal("");
  protected readonly page = signal(1);
  protected readonly limit = signal(20);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  private readonly rows = signal<CalendarDto[]>([]);
  private readonly meta = signal<PageMeta>({ total: 0, page: 1, limit: 20, pages: 1 });
  private readonly reloadTick = signal(0);

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<CalendarDto | null>(null);
  protected readonly formCrop = signal("");
  protected readonly formSteps = signal<DraftStep[]>([
    { id: "etape-1", kind: "semis", offsetDays: "0", durationDays: "2", note: "" },
    { id: "etape-2", kind: "fertilisation", offsetDays: "21", durationDays: "1", note: "" },
    { id: "etape-3", kind: "récolte", offsetDays: "75", durationDays: "5", note: "" },
  ]);
  protected readonly detailTarget = signal<CalendarDto | null>(null);

  protected readonly statusOptions: SelectOption[] = [
    { value: "", label: "Tous les statuts" },
    { value: "brouillon", label: "Brouillon" },
    { value: "validé", label: "Validé" },
    { value: "remplacé", label: "Remplacé" },
  ];
  protected readonly kindOptions: SelectOption[] = OPERATION_KINDS.map((k) => ({ value: k, label: k }));

  private readonly serverPager = createServerPager({ items: this.rows, meta: this.meta, page: this.page, limit: this.limit });
  protected readonly pager = computed(() => this.serverPager);

  protected readonly stats = computed<StatCard[]>(() => {
    const items = this.rows();
    return [
      { label: "Calendriers", value: nf.format(this.meta().total), sub: "", icon: "calendar_today", bg: "", fg: "" },
      { label: "Validés", value: nf.format(items.filter((c) => c.status === "validé").length), sub: "", icon: "verified", ...TONE.succes },
      { label: "Brouillons", value: nf.format(items.filter((c) => c.status === "brouillon").length), sub: "", icon: "edit", ...TONE.attente },
      { label: "Remplacés", value: nf.format(items.filter((c) => c.status === "remplacé").length), sub: "", icon: "info", ...TONE.neutre },
    ];
  });

  constructor() {
    effect(() => {
      if (!this.apiMode) return;
      const page = this.page();
      const limit = this.limit();
      const q = this.q();
      const status = this.status();
      this.reloadTick();
      void this.load(page, limit, q, status);
    });
  }

  private async load(page: number, limit: number, q: string, status: string) {
    this.loading.set(true);
    try {
      const res = await listCalendars({ page, limit, crop: q.trim() || undefined, status: status || undefined });
      this.meta.set({ total: res.total, page: res.page, limit: res.limit, pages: res.pages });
      this.rows.set(res.items);
    } finally {
      this.loading.set(false);
    }
  }

  protected summary(c: CalendarDto) {
    return c.steps.map((s) => `${s.kind} (J+${s.offsetDays})`).join(" · ") || "—";
  }

  protected onSearch(v: string) {
    this.q.set(v);
    this.page.set(1);
  }
  protected onStatus(v: string) {
    this.status.set(v);
    this.page.set(1);
  }
  protected resetFilters() {
    this.q.set("");
    this.status.set("");
    this.page.set(1);
  }

  protected patchStep(index: number, field: keyof DraftStep, value: string) {
    this.formSteps.update((list) =>
      list.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
    );
  }

  protected addStep() {
    this.formSteps.update((list) => [
      ...list,
      { id: `etape-${list.length + 1}`, kind: "irrigation", offsetDays: "14", durationDays: "1", note: "" },
    ]);
  }

  protected removeStep(index: number) {
    this.formSteps.update((list) => (list.length > 1 ? list.filter((_, i) => i !== index) : list));
  }

  protected setVueMode(mode: "liste" | "calendrier") {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { vue: mode === "calendrier" ? "calendrier" : null },
      queryParamsHandling: "merge",
      replaceUrl: true,
    });
  }

  protected openCreate() {
    this.editing.set(null);
    this.formCrop.set("");
    this.formSteps.set([
      { id: "etape-1", kind: "semis", offsetDays: "0", durationDays: "2", note: "" },
      { id: "etape-2", kind: "fertilisation", offsetDays: "21", durationDays: "1", note: "" },
      { id: "etape-3", kind: "récolte", offsetDays: "75", durationDays: "5", note: "" },
    ]);
    this.formOpen.set(true);
  }

  protected openEdit(row: CalendarDto) {
    this.editing.set(row);
    this.formCrop.set(row.crop);
    this.formSteps.set(
      row.steps.map((s, i) => ({
        id: s.id || `etape-${i + 1}`,
        kind: s.kind,
        offsetDays: String(s.offsetDays),
        durationDays: String(s.durationDays),
        note: s.note ?? "",
      })),
    );
    this.formOpen.set(true);
  }

  protected duplicateAsDraft(row: CalendarDto) {
    this.editing.set(null);
    this.formCrop.set(row.crop);
    this.formSteps.set(
      row.steps.map((s, i) => ({
        id: s.id || `etape-${i + 1}`,
        kind: s.kind,
        offsetDays: String(s.offsetDays),
        durationDays: String(s.durationDays),
        note: s.note ?? "",
      })),
    );
    this.formOpen.set(true);
  }

  protected async submitForm() {
    if (this.saving()) return;
    this.saving.set(true);
    try {
      const steps = this.formSteps().map((s, i) => ({
        id: s.id || `etape-${i + 1}`,
        kind: s.kind,
        offsetDays: Math.max(0, Math.round(Number(s.offsetDays) || 0)),
        durationDays: Math.max(1, Math.round(Number(s.durationDays) || 1)),
        note: s.note.trim(),
      }));
      const target = this.editing();
      if (target) {
        await updateCalendar(target.id, { crop: this.formCrop().trim(), steps });
        this.snackbar.success("Brouillon mis à jour.");
      } else {
        await createCalendar({ crop: this.formCrop().trim(), steps });
        this.snackbar.success("Brouillon de calendrier créé.");
      }
      this.formOpen.set(false);
      this.reloadTick.update((v) => v + 1);
    } catch {
      this.snackbar.error("Impossible d’enregistrer (un brouillon existe peut-être déjà pour cette culture).");
    } finally {
      this.saving.set(false);
    }
  }

  protected async validate(row: CalendarDto) {
    try {
      await validateCalendar(row.id);
      this.reloadTick.update((v) => v + 1);
      this.snackbar.success(`Calendrier « ${row.crop} v${row.version} » validé.`);
    } catch {
      this.snackbar.error("Impossible de valider ce calendrier.");
    }
  }

  protected tone(s: string) {
    const t = s === "validé" ? TONE.succes : s === "brouillon" ? TONE.attente : TONE.neutre;
    return `background:${t.bg};color:${t.fg}`;
  }
}
