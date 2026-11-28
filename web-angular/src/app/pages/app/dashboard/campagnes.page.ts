import { Component, computed, effect, inject, signal } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router } from "@angular/router";
import { map, startWith } from "rxjs";

import { isApiMode } from "@/lib/api/config";
import type { CalendarEvent } from "@/lib/calendar";
import {
  createCampaign,
  listCampaigns,
  setCampaignStatus,
  updateCampaign,
  type CampaignDto,
  type CampaignStatusDto,
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

@Component({
  selector: "app-campagnes-page",
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
    <app-shell [perm]="perms" [area]="t()('nav.item.campagnes')">
      <ui-page-header [title]="t()('nav.item.campagnes')" [description]="t()('agronomique.campagnes.description')">
        @if (apiMode && store.can("campaign.manage")) {
          <button actions type="button" class="btn btn-primary" (click)="openCreate()">
            <span>Nouvelle campagne</span>
            <span class="btn-chip" aria-hidden="true"><ui-icon name="add" [size]="16" /></span>
          </button>
        }
      </ui-page-header>

      @if (apiMode) {
        <ui-stat-cards class="rise mt-6" [stats]="stats()" />

        <div class="toolbar card mt-6">
          <div class="search">
            <ui-icon name="search" [size]="18" />
            <input type="search" placeholder="Rechercher une campagne…" [value]="q()" (input)="onSearch($any($event.target).value)" />
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
              [categories]="campaignCategories"
              [dayCreateEnabled]="store.can('campaign.manage')"
              (eventClick)="openDetailById($event.id)"
              (dayCreate)="onCalendarDayCreate($event)"
            />
          </section>
        } @else {
          <section class="card mt-4 overflow-x-auto">
            <table class="tbl">
              <thead>
                <tr>
                  <th>Campagne</th>
                  <th>Début</th>
                  <th>Fin</th>
                  <th>Durée</th>
                  <th>Statut</th>
                  <th class="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (row of pager().items(); track row.id) {
                  <tr class="row-link" (click)="detailTarget.set(row)">
                    <td class="font-bold">{{ row.name }}</td>
                    <td>{{ fmtDate(row.startDate) }}</td>
                    <td>{{ fmtDate(row.endDate) }}</td>
                    <td class="sub">{{ durationDays(row) }} j</td>
                    <td><span class="badge" [style]="tone(row.status)">{{ row.status }}</span></td>
                    <td (click)="$event.stopPropagation()">
                      <span class="flex justify-end gap-2">
                        <button type="button" class="act" title="Voir le détail" aria-label="Voir le détail" (click)="detailTarget.set(row)">
                          <ui-icon name="visibility" [size]="18" />
                        </button>
                        @if (store.can("campaign.manage")) {
                          <button type="button" class="act" title="Modifier la campagne" aria-label="Modifier la campagne" (click)="openEdit(row)">
                            <ui-icon name="edit" [size]="18" />
                          </button>
                          @if (row.status === "planifiée") {
                            <button type="button" class="act" title="Démarrer la campagne" aria-label="Démarrer la campagne" (click)="advance(row, 'en cours')">
                              <ui-icon name="arrow_forward" [size]="18" />
                            </button>
                          } @else if (row.status === "en cours") {
                            <button type="button" class="act" title="Clôturer la campagne" aria-label="Clôturer la campagne" (click)="advance(row, 'clôturée')">
                              <ui-icon name="task_alt" [size]="18" />
                            </button>
                          }
                        }
                      </span>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
            @if (!pager().items().length && !loading()) {
              <ui-empty-state
                [icon]="q() || status() ? 'search' : 'calendar_month'"
                [title]="q() || status() ? t()('emptyState.filtered.title') : 'Aucune campagne enregistrée'"
                [description]="q() || status() ? t()('emptyState.filtered.description') : 'Les campagnes agricoles de la coopérative apparaîtront ici.'"
              >
                @if (!(q() || status()) && apiMode && store.can("campaign.manage")) {
                  <button type="button" class="btn btn-primary" (click)="openCreate()">
                    <span>Nouvelle campagne</span>
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
        [title]="editing() ? 'Modifier la campagne' : 'Nouvelle campagne agricole'"
        icon="calendar_month"
        tone="brand"
        (closed)="formOpen.set(false)"
      >
        <div class="grid gap-4">
          <ui-text-field label="Nom de la campagne" placeholder="Ex. : Hivernage 2026-2027" [value]="formName()" (valueChange)="formName.set($event)" />
          <div class="grid gap-4 sm:grid-cols-2">
            <ui-text-field label="Début" type="date" [value]="formStart()" (valueChange)="formStart.set($event)" />
            <ui-text-field label="Fin" type="date" [value]="formEnd()" (valueChange)="formEnd.set($event)" />
          </div>
        </div>
        <div modal-footer class="flex justify-end gap-3">
          <button type="button" class="btn btn-ghost" (click)="formOpen.set(false)">Annuler</button>
          <button type="button" class="btn btn-primary" [disabled]="saving() || !formName().trim() || !formStart() || !formEnd()" (click)="submitForm()">
            <span>{{ editing() ? "Enregistrer" : "Créer" }}</span>
            <span class="btn-chip" aria-hidden="true"><ui-icon name="check" [size]="16" /></span>
          </button>
        </div>
      </ui-modal>
    }

    @if (detailTarget(); as camp) {
      <ui-modal
        [open]="!!detailTarget()"
        [title]="camp.name"
        [description]="fmtDate(camp.startDate) + ' → ' + fmtDate(camp.endDate) + ' (' + durationDays(camp) + ' jours)'"
        icon="calendar_month"
        tone="brand"
        (closed)="detailTarget.set(null)"
      >
        <div class="grid gap-4">
          <div class="flex items-center justify-between rounded-xl border p-3.5" style="border-color: var(--border)">
            <span class="text-[13px] font-semibold" style="color: var(--ink-2)">Statut actuel</span>
            <span class="badge" [style]="tone(camp.status)">{{ camp.status }}</span>
          </div>
          <div class="grid gap-2">
            <p class="lbl">Historique des actions</p>
            @if (!camp.history.length) {
              <p class="text-[13px]" style="color: var(--ink-2)">Aucun événement enregistré.</p>
            } @else {
              <div class="grid gap-2">
                @for (entry of camp.history; track $index) {
                  <div class="flex items-center justify-between rounded-lg border px-3 py-2 text-[13px]" style="border-color: var(--border)">
                    <span class="font-semibold">{{ entry.action }}</span>
                    <span class="text-[12px]" style="color: var(--ink-2)">{{ fmtDate(entry.at) }} · {{ entry.by }}</span>
                  </div>
                }
              </div>
            }
          </div>
        </div>
        <div modal-footer class="flex justify-end gap-3">
          @if (store.can("campaign.manage")) {
            <button type="button" class="btn btn-ghost" (click)="detailTarget.set(null); openEdit(camp)">Modifier</button>
          }
          <button type="button" class="btn btn-primary" (click)="detailTarget.set(null)">Fermer</button>
        </div>
      </ui-modal>
    }
  `,
})
export default class CampagnesPage {
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

  protected readonly campaignCategories = [
    ["planifiée", "Planifiée"],
    ["en cours", "En cours"],
    ["clôturée", "Clôturée"],
  ] as const;

  protected readonly calendarEvents = computed((): CalendarEvent[] =>
    this.rows().map((campaign) => ({
      id: campaign.id,
      title: campaign.name,
      start: new Date(`${campaign.startDate.slice(0, 10)}T08:00:00`),
      end: new Date(`${campaign.endDate.slice(0, 10)}T18:00:00`),
      tone: campaign.status === "en cours" ? "success" : campaign.status === "planifiée" ? "info" : "neutral",
      category: campaign.status,
      subtitle: `${fmtDate(campaign.startDate)} → ${fmtDate(campaign.endDate)}`,
    })),
  );
  protected readonly t = inject(LocaleService).t;
  protected readonly apiMode = isApiMode();
  protected readonly perms = ["campaign.read"] as const;
  protected readonly fmtDate = fmtDate;

  protected readonly q = signal("");
  protected readonly status = signal("");
  protected readonly page = signal(1);
  protected readonly limit = signal(20);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  private readonly rows = signal<CampaignDto[]>([]);
  private readonly meta = signal<PageMeta>({ total: 0, page: 1, limit: 20, pages: 1 });
  private readonly reloadTick = signal(0);

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<CampaignDto | null>(null);
  protected readonly formName = signal("");
  protected readonly formStart = signal("");
  protected readonly formEnd = signal("");
  protected readonly detailTarget = signal<CampaignDto | null>(null);

  protected readonly statusOptions: SelectOption[] = [
    { value: "", label: "Tous les statuts" },
    { value: "planifiée", label: "Planifiée" },
    { value: "en cours", label: "En cours" },
    { value: "clôturée", label: "Clôturée" },
  ];

  private readonly serverPager = createServerPager({ items: this.rows, meta: this.meta, page: this.page, limit: this.limit });
  protected readonly pager = computed(() => this.serverPager);

  protected readonly stats = computed<StatCard[]>(() => {
    const items = this.rows();
    const running = items.find((c) => c.status === "en cours")?.name ?? "—";
    return [
      { label: "Campagnes", value: nf.format(this.meta().total), sub: "", icon: "calendar_month", bg: "", fg: "" },
      { label: "En cours", value: running, sub: "", icon: "task_alt", ...TONE.succes },
      { label: "Planifiées", value: nf.format(items.filter((c) => c.status === "planifiée").length), sub: "", icon: "info", ...TONE.info },
      { label: "Clôturées", value: nf.format(items.filter((c) => c.status === "clôturée").length), sub: "", icon: "verified", ...TONE.neutre },
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
      const res = await listCampaigns({ page, limit, q, status: status || undefined });
      this.meta.set({ total: res.total, page: res.page, limit: res.limit, pages: res.pages });
      this.rows.set(res.items);
    } finally {
      this.loading.set(false);
    }
  }

  protected durationDays(c: CampaignDto): number {
    const diff = new Date(c.endDate).getTime() - new Date(c.startDate).getTime();
    return Math.max(1, Math.round(diff / 86_400_000));
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

  protected openCreate() {
    this.editing.set(null);
    this.formName.set("");
    this.formStart.set("");
    this.formEnd.set("");
    this.formOpen.set(true);
  }

  protected openEdit(row: CampaignDto) {
    this.editing.set(row);
    this.formName.set(row.name);
    this.formStart.set(row.startDate.slice(0, 10));
    this.formEnd.set(row.endDate.slice(0, 10));
    this.formOpen.set(true);
  }

  protected openDetailById(id: string) {
    const found = this.rows().find((c) => c.id === id);
    if (found) this.detailTarget.set(found);
  }

  protected setVueMode(mode: "liste" | "calendrier") {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { vue: mode === "calendrier" ? "calendrier" : null },
      queryParamsHandling: "merge",
      replaceUrl: true,
    });
  }

  protected onCalendarDayCreate(date: Date) {
    this.editing.set(null);
    this.formName.set("");
    this.formStart.set(date.toISOString().slice(0, 10));
    this.formEnd.set("");
    this.formOpen.set(true);
  }

  protected async submitForm() {
    if (this.saving()) return;
    this.saving.set(true);
    try {
      const target = this.editing();
      if (target) {
        await updateCampaign(target.id, {
          name: this.formName().trim(),
          startDate: this.formStart(),
          endDate: this.formEnd(),
        });
        this.snackbar.success("Campagne mise à jour.");
      } else {
        await createCampaign({
          name: this.formName().trim(),
          startDate: this.formStart(),
          endDate: this.formEnd(),
        });
        this.snackbar.success("Campagne créée.");
      }
      this.formOpen.set(false);
      this.reloadTick.update((v) => v + 1);
    } catch {
      this.snackbar.error("Impossible d’enregistrer la campagne (vérifiez le nom et les dates).");
    } finally {
      this.saving.set(false);
    }
  }

  protected async advance(row: CampaignDto, next: CampaignStatusDto) {
    try {
      await setCampaignStatus(row.id, next);
      this.reloadTick.update((v) => v + 1);
      this.snackbar.success(`Campagne « ${row.name} » passée à « ${next} ».`);
    } catch {
      this.snackbar.error("Transition impossible (une campagne est peut-être déjà en cours).");
    }
  }

  protected tone(s: CampaignStatusDto): string {
    const t = s === "en cours" ? TONE.succes : s === "planifiée" ? TONE.info : TONE.neutre;
    return `background:${t.bg};color:${t.fg}`;
  }
}
