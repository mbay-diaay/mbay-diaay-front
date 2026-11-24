import { Component, computed, inject, signal } from "@angular/core";
import { RouterLink } from "@angular/router";

import {
  cancelCoopRequest,
  COOP_REQUEST_KINDS,
  COOP_REQUEST_STATUSES,
  coopRequestErrorKey,
  listCoopRequests,
  resolveCoopRequest,
  type CoopRequestDto,
  type CoopRequestItem,
  type CoopRequestKind,
  type CoopRequestStatus,
} from "@/lib/api/coop-requests";
import { isApiMode } from "@/lib/api/config";
import { fetchAllPages } from "@/lib/api/pagination";
import { describeSource, sourceOfCoopRequest } from "@/lib/data-source";
import { KIND_LABEL_KEY, isDashboardLink } from "@/lib/coop-request-templates";
import { fmtDate, fmtDateTime, nf } from "@/lib/format";
import type { MessageKey } from "@/lib/i18n";
import { AppShellComponent } from "@shared/app-shell.component";
import { CoopRequestsService } from "@shared/coop-requests.service";
import { LocaleService } from "@shared/locale.service";
import { createPager } from "@shared/pager";
import { StoreService } from "@shared/store.service";
import {
  IconComponent,
  ModalComponent,
  PaginationComponent,
  SelectComponent,
  SnackbarService,
  StatCardsComponent,
  TONE,
  V2_PAGE_STYLES,
  type SelectOption,
  type StatCard,
} from "@shared/ui";

const STATUS_TONE: Record<CoopRequestStatus, { bg: string; fg: string }> = {
  ouverte: TONE.attente,
  réglée: TONE.succes,
  annulée: TONE.neutre,
};

const STATUS_LABEL: Record<CoopRequestStatus, MessageKey> = {
  ouverte: "demandes.status.ouverte",
  réglée: "demandes.status.réglée",
  annulée: "demandes.status.annulée",
};

const KIND_TONE: Record<CoopRequestKind, { bg: string; fg: string }> = {
  doublon: TONE.info,
  alerte: TONE.attente,
  organisation: TONE.culture,
  fiche: TONE.erreur,
  autre: TONE.neutre,
};

/**
 * « Demandes du CRADESC » : l'administrateur suit les demandes envoyées aux coopératives, le gestionnaire
 * lit celles qu'il reçoit et les marque comme réglées (mode API uniquement, chargées depuis `/coop-requests`).
 */
@Component({
  selector: "app-qualite-demandes-page",
  imports: [
    AppShellComponent,
    IconComponent,
    ModalComponent,
    PaginationComponent,
    RouterLink,
    SelectComponent,
    StatCardsComponent,
  ],
  styles: [
    V2_PAGE_STYLES,
    `
      .filters {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        padding: 12px;
        border-radius: 20px;
      }
      .filters .seg-wrap {
        grid-column: 1 / -1;
      }
      .row-link:focus-visible td:first-child {
        box-shadow: inset 3px 0 0 var(--v2-foret);
      }
      .subject {
        max-width: 340px;
      }
      .box {
        border-radius: 18px;
        background: var(--v2-creme);
        padding: 14px 16px;
        font-size: 15px;
        font-weight: 500;
        line-height: 1.55;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      .pills {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .pill-item {
        display: inline-flex;
        max-width: 100%;
        align-items: center;
        gap: 6px;
        border-radius: 999px;
        padding: 4px 12px;
        font-size: 13px;
        font-weight: 700;
        background: var(--v2-creme);
        color: var(--v2-ardoise);
      }
      a.pill-item:hover {
        background: var(--v2-sauge);
        color: var(--v2-foret);
      }
      .alerte {
        display: flex;
        gap: 12px;
        align-items: flex-start;
        border-radius: 18px;
        padding: 14px 18px;
        background: var(--v2-attente-bg);
        color: var(--v2-attente-fg);
      }
      .alerte-ico {
        display: grid;
        flex: none;
        place-items: center;
        width: 36px;
        height: 36px;
        border-radius: 12px;
        background: color-mix(in oklab, var(--v2-attente-fg) 14%, transparent);
      }
      .alerte-texte {
        margin: 0;
        font-size: 15px;
        font-weight: 600;
        line-height: 1.45;
      }
      .result {
        border-radius: 18px;
        padding: 14px 16px;
        background: var(--v2-sauge);
        color: var(--v2-foret);
      }
      .history {
        display: grid;
        gap: 0;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .history li {
        position: relative;
        padding: 0 0 14px 22px;
        border-left: 2px solid var(--v2-separateur);
        margin-left: 6px;
      }
      .history li:last-child {
        padding-bottom: 0;
        border-left-color: transparent;
      }
      .history li::before {
        content: "";
        position: absolute;
        left: -6px;
        top: 3px;
        height: 10px;
        width: 10px;
        border-radius: 999px;
        background: var(--v2-foret);
      }
      .btn-link {
        text-decoration: none;
      }
    `,
  ],
  template: `
    <app-shell perm="coop_request.read" [area]="t()('demandes.area')">
      <header class="rise">
        <p class="mono" style="color: var(--v2-gris-texte)">{{ t()("qualite.header.title") }}</p>
        <h1
          class="mt-2 text-[30px] font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-[38px]"
        >
          {{ t()("demandes.title") }}
        </h1>
        <p class="mt-2 max-w-2xl text-[16px] font-medium" style="color: var(--v2-gris-texte)">
          {{ t()(isAdmin() ? "demandes.subtitle.admin" : "demandes.subtitle.manager") }}
        </p>
      </header>

      @if (!apiMode) {
        <p class="card sub mt-8 p-10 text-center">{{ t()("demandes.demoOnly") }}</p>
      } @else {
        <ui-stat-cards class="rise mt-8" [stats]="stats()" />

        <div class="filters card mt-6">
          <div class="seg-wrap">
            <p class="lbl mb-2">{{ t()("demandes.filter.status") }}</p>
            <div class="seg" role="radiogroup" [attr.aria-label]="t()('demandes.filter.status')">
              @for (option of statusButtons(); track option.id) {
                <button
                  type="button"
                  role="radio"
                  [class.on]="statusFilter() === option.id"
                  [attr.aria-checked]="statusFilter() === option.id"
                  (click)="statusFilter.set(option.id)"
                >
                  {{ option.label }}<span class="n" [class.zero]="!option.count">{{ option.count }}</span>
                </button>
              }
            </div>
          </div>
          @if (isAdmin()) {
            <div>
              <p class="lbl mb-2">{{ t()("demandes.filter.scoop") }}</p>
              <ui-select
                [options]="scoopOptions()"
                [value]="scoopFilter()"
                [label]="t()('demandes.filter.scoop')"
                leadingIcon="apartment"
                (valueChange)="scoopFilter.set($event)"
              />
            </div>
          }
          <div>
            <p class="lbl mb-2">{{ t()("demandes.filter.kind") }}</p>
            <ui-select
              [options]="kindOptions()"
              [value]="kindFilter()"
              [label]="t()('demandes.filter.kind')"
              leadingIcon="tune"
              (valueChange)="kindFilter.set($event)"
            />
          </div>
        </div>

        @if (loading()) {
          <p class="card sub mt-4 p-10 text-center" role="status">{{ t()("demandes.loading") }}</p>
        } @else if (loadFailed()) {
          <div class="card mt-4 grid justify-items-center gap-3 p-10 text-center" role="alert">
            <p class="sub">{{ t()("demandes.loadFailed") }}</p>
            <button type="button" class="btn btn-ghost" (click)="load()">{{ t()("demandes.retry") }}</button>
          </div>
        } @else {
          <p class="sub mt-4" aria-live="polite">
            {{ t()("demandes.count", { shown: nf.format(filtered().length), total: nf.format(requests().length) }) }}
          </p>
          @if (filtered().length) {
            <section class="card mt-3 overflow-hidden">
              <div class="overflow-x-auto">
                <table class="tbl" [style.min-width.px]="isAdmin() ? 1040 : 860">
                  <thead>
                    <tr>
                      <th>{{ t()("demandes.col.subject") }}</th>
                      @if (isAdmin()) {
                        <th>{{ t()("demandes.col.scoop") }}</th>
                      }
                      <th>{{ t()("demandes.col.kind") }}</th>
                      <th>{{ t()("qualite.source.col") }}</th>
                      <th>{{ t()("demandes.col.date") }}</th>
                      <th>{{ t()("demandes.col.status") }}</th>
                      @if (isAdmin()) {
                        <th>{{ t()("demandes.col.recipient") }}</th>
                      }
                    </tr>
                  </thead>
                  <tbody>
                    @for (request of pager.items(); track request.id) {
                      <tr
                        class="row-link"
                        tabindex="0"
                        role="button"
                        [attr.aria-label]="t()('demandes.open', { subject: request.subject })"
                        (click)="openDetail(request)"
                        (keydown.enter)="openDetail(request)"
                        (keydown.space)="openDetail(request); $event.preventDefault()"
                      >
                        <td>
                          <span class="subject block truncate font-bold">{{ request.subject }}</span>
                          @if (request.items.length) {
                            <span class="sub block">{{ request.items.length }} · {{ t()("demandes.detail.items") }}</span>
                          }
                        </td>
                        @if (isAdmin()) {
                          <td class="font-semibold">{{ request.scoopName }}</td>
                        }
                        <td>
                          <span class="badge" [style.background]="kindTone[request.kind].bg" [style.color]="kindTone[request.kind].fg">{{
                            t()(kindLabel[request.kind])
                          }}</span>
                        </td>
                        <td>
                          <span
                            class="badge"
                            [style.background]="source.bg"
                            [style.color]="source.fg"
                            [title]="sourceDetail()"
                            ><ui-icon [name]="source.icon" [size]="14" />{{ t()(source.labelKey) }}</span
                          >
                          @if (request.items.length) {
                            <span class="sub mt-1 block max-w-[220px] truncate" [title]="itemsText(request)">{{
                              itemsText(request)
                            }}</span>
                          }
                        </td>
                        <td class="sub whitespace-nowrap">{{ date(request.createdAt) }}</td>
                        <td>
                          <span class="badge" [style.background]="statusTone[request.status].bg" [style.color]="statusTone[request.status].fg">{{
                            t()(statusLabel[request.status])
                          }}</span>
                        </td>
                        @if (isAdmin()) {
                          <td>
                            @if (request.recipientEmail) {
                              <span class="block truncate text-[13px] font-semibold">{{ request.recipientEmail }}</span>
                            } @else {
                              <span class="sub block">{{ t()("demandes.recipient.none") }}</span>
                            }
                            <span
                              class="badge mt-1"
                              [style.background]="request.mailStatus === 'envoyé' ? 'var(--v2-sauge)' : 'var(--v2-attente-bg)'"
                              [style.color]="request.mailStatus === 'envoyé' ? 'var(--v2-vert-pousse)' : 'var(--v2-attente-fg)'"
                              >{{ t()(mailLabel[request.mailStatus]) }}</span
                            >
                          </td>
                        }
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </section>
            <ui-pagination class="mt-2 block" [pager]="pager" />
          } @else {
            <div class="card mt-3 grid justify-items-center gap-2 p-10 text-center">
              <span class="sec-ico" aria-hidden="true"><ui-icon name="mail" [size]="18" /></span>
              @if (requests().length) {
                <p class="sub">{{ t()("demandes.empty.filtered") }}</p>
              } @else {
                <p class="font-extrabold">{{ t()("demandes.empty.title") }}</p>
                <p class="sub max-w-md">{{ t()(isAdmin() ? "demandes.empty.admin" : "demandes.empty.manager") }}</p>
              }
            </div>
          }
        }
      }

      <!-- Détail d'une demande -->
      <ui-modal
        [open]="!!detail()"
        [title]="detail()?.subject ?? ''"
        [description]="detail() ? detail()!.scoopName : ''"
        icon="mail"
        [width]="680"
        [closeLabel]="t()('common.close')"
        (closed)="closeDetail()"
      >
        @if (detail(); as current) {
          <div class="grid gap-5">
            <div class="flex flex-wrap items-center gap-2">
              <span class="badge" [style.background]="statusTone[current.status].bg" [style.color]="statusTone[current.status].fg">{{
                t()(statusLabel[current.status])
              }}</span>
              <span class="badge" [style.background]="kindTone[current.kind].bg" [style.color]="kindTone[current.kind].fg">{{
                t()(kindLabel[current.kind])
              }}</span>
              <span class="sub">{{ t()("demandes.detail.from", { name: current.createdBy, date: dateTime(current.createdAt) }) }}</span>
            </div>

            @if (isAdmin()) {
              <div>
                <p class="lbl mb-2">{{ t()("demandes.detail.recipient") }}</p>
                <p class="font-bold">{{ current.recipientEmail ?? t()("demandes.recipient.none") }}</p>
                @if (current.mailStatus === "non envoyé") {
                  <div class="alerte mt-2" role="alert">
                    <span class="alerte-ico" aria-hidden="true"><ui-icon name="warning" [size]="20" /></span>
                    <p class="alerte-texte">{{ t()("demandes.detail.mailWarning") }}</p>
                  </div>
                }
              </div>
            }

            <div>
              <p class="lbl mb-2">{{ t()("demandes.detail.message") }}</p>
              <div class="box">{{ current.message }}</div>
            </div>

            @if (current.items.length) {
              <div>
                <p class="lbl mb-2">{{ t()("demandes.detail.items") }}</p>
                <div class="pills">
                  @for (item of current.items; track item.type + item.id) {
                    @if (itemLink(item); as target) {
                      <a
                        class="pill-item"
                        [routerLink]="target"
                        [attr.aria-label]="t()('demandes.detail.itemOpen', { label: item.label })"
                        ><span class="truncate">{{ item.label }}</span
                        ><ui-icon name="arrow_outward" [size]="14"
                      /></a>
                    } @else {
                      <span class="pill-item"><span class="truncate">{{ item.label }}</span></span>
                    }
                  }
                </div>
              </div>
            }

            @if (safeLink(current); as link) {
              <div>
                <a class="btn btn-ghost btn-link" [routerLink]="link"
                  ><ui-icon name="open_in_new" [size]="18" />{{ t()("demandes.detail.link") }}</a
                >
              </div>
            }

            @if (current.status === "réglée") {
              <div class="result">
                <p class="lbl" style="color: inherit">{{ t()("demandes.detail.resolution") }}</p>
                <p class="mt-1 font-bold">
                  {{ t()("demandes.detail.resolvedBy", { name: current.resolvedBy ?? "—", date: current.resolvedAt ? dateTime(current.resolvedAt) : "—" }) }}
                </p>
                <p class="mt-1 text-[14px] font-medium" style="white-space: pre-wrap">
                  {{ current.resolutionNote || t()("demandes.detail.noNote") }}
                </p>
              </div>
            }

            @if (current.history.length) {
              <div>
                <p class="lbl mb-3">{{ t()("demandes.detail.history") }}</p>
                <ul class="history">
                  @for (entry of current.history; track $index) {
                    <li>
                      <p class="text-[14px] font-bold">
                        {{ t()("demandes.detail.historyBy", { action: entry.action, name: entry.by }) }}
                      </p>
                      <p class="sub">{{ dateTime(entry.at) }}</p>
                      @if (entry.comment) {
                        <p class="mt-1 text-[14px] font-medium" style="white-space: pre-wrap">{{ entry.comment }}</p>
                      }
                    </li>
                  }
                </ul>
              </div>
            }

            @if (current.status === "ouverte" && canResolve()) {
              <div>
                <label class="lbl" for="demande-note">{{ t()("demandes.detail.note") }}</label>
                <textarea
                  id="demande-note"
                  class="area mt-2"
                  [placeholder]="t()('demandes.detail.notePlaceholder')"
                  [value]="note()"
                  (input)="note.set($any($event.target).value)"
                ></textarea>
              </div>
            }
            @if (confirmCancel()) {
              <div class="alerte" role="alert">
                <span class="alerte-ico" aria-hidden="true"><ui-icon name="warning" [size]="20" /></span>
                <p class="alerte-texte">{{ t()("demandes.detail.cancelAsk") }}</p>
              </div>
            }
          </div>
          @if (current.status === "ouverte") {
            @if (confirmCancel()) {
              <button modal-footer type="button" class="btn btn-ghost" [disabled]="busy()" (click)="confirmCancel.set(false)">
                {{ t()("demandes.detail.cancelKeep") }}
              </button>
              <button modal-footer type="button" class="btn btn-danger" [disabled]="busy()" (click)="cancel()">
                {{ busy() ? t()("demandes.detail.resolving") : t()("demandes.detail.cancelConfirm") }}
              </button>
            } @else {
              <button modal-footer type="button" class="btn btn-ghost" [disabled]="busy()" (click)="closeDetail()">
                {{ t()("demandes.detail.close") }}
              </button>
              @if (isAdmin()) {
                <button modal-footer type="button" class="btn btn-ghost" [disabled]="busy()" (click)="confirmCancel.set(true)">
                  {{ t()("demandes.detail.cancel") }}
                </button>
              }
              @if (canResolve()) {
                <button modal-footer type="button" class="btn btn-primary" [disabled]="busy()" (click)="resolve()">
                  {{ busy() ? t()("demandes.detail.resolving") : t()("demandes.detail.resolve")
                  }}<span class="btn-chip"><ui-icon name="check" [size]="18" /></span>
                </button>
              }
            }
          } @else {
            <button modal-footer type="button" class="btn btn-ghost" (click)="closeDetail()">
              {{ t()("demandes.detail.close") }}
            </button>
          }
        }
      </ui-modal>
    </app-shell>
  `,
})
export default class QualiteDemandesPage {
  private readonly store = inject(StoreService);
  private readonly locale = inject(LocaleService);
  private readonly snackbar = inject(SnackbarService);
  private readonly counter = inject(CoopRequestsService);
  protected readonly t = this.locale.t;
  protected readonly nf = nf;
  protected readonly apiMode = isApiMode();

  protected readonly statusTone = STATUS_TONE;
  protected readonly statusLabel = STATUS_LABEL;
  protected readonly kindTone = KIND_TONE;
  protected readonly kindLabel = KIND_LABEL_KEY;
  protected readonly mailLabel: Record<CoopRequestDto["mailStatus"], MessageKey> = {
    envoyé: "demandes.mail.envoyé",
    "non envoyé": "demandes.mail.non envoyé",
  };

  /** L'administrateur envoie et suit ; le gestionnaire reçoit : un seul droit les distingue. */
  protected readonly isAdmin = computed(() => this.store.can("coop_request.send"));
  protected readonly canResolve = computed(() => this.store.can("coop_request.resolve"));

  protected readonly requests = signal<CoopRequestDto[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadFailed = signal(false);

  protected readonly statusFilter = signal<CoopRequestStatus | "">("");
  protected readonly scoopFilter = signal("");
  protected readonly kindFilter = signal("");

  protected readonly detail = signal<CoopRequestDto | null>(null);
  protected readonly note = signal("");
  protected readonly busy = signal(false);
  protected readonly confirmCancel = signal(false);

  protected readonly filtered = computed(() => {
    const status = this.statusFilter();
    const scoop = this.scoopFilter();
    const kind = this.kindFilter();
    return this.requests().filter(
      (request) =>
        (!status || request.status === status) &&
        (!scoop || request.scoopId === scoop) &&
        (!kind || request.kind === kind),
    );
  });
  protected readonly pager = createPager(() => this.filtered(), 10);

  private countOf(status: CoopRequestStatus): number {
    return this.requests().filter((request) => request.status === status).length;
  }

  protected readonly stats = computed<StatCard[]>(() => {
    const t = this.t();
    return [
      {
        label: t("demandes.stats.open"),
        value: nf.format(this.countOf("ouverte")),
        sub: t("demandes.stats.openSub"),
        icon: "mail",
        bg: "",
        fg: "",
      },
      {
        label: t("demandes.stats.resolved"),
        value: nf.format(this.countOf("réglée")),
        sub: t("demandes.stats.resolvedSub"),
        icon: "task_alt",
        ...TONE.succes,
      },
      {
        label: t("demandes.stats.cancelled"),
        value: nf.format(this.countOf("annulée")),
        sub: t("demandes.stats.cancelledSub"),
        icon: "close",
        ...TONE.neutre,
      },
    ];
  });

  protected readonly statusButtons = computed(() => {
    const t = this.t();
    return [
      { id: "" as CoopRequestStatus | "", label: t("demandes.filter.all"), count: this.requests().length },
      ...COOP_REQUEST_STATUSES.map((status) => ({
        id: status as CoopRequestStatus | "",
        label: t(STATUS_LABEL[status]),
        count: this.countOf(status),
      })),
    ];
  });

  protected readonly scoopOptions = computed<SelectOption[]>(() => {
    const names = new Map<string, string>();
    for (const request of this.requests()) names.set(request.scoopId, request.scoopName);
    return [
      { value: "", label: this.t()("demandes.filter.scoopAll") },
      ...[...names.entries()]
        .sort((first, second) => first[1].localeCompare(second[1], "fr"))
        .map(([value, label]) => ({ value, label })),
    ];
  });

  protected readonly kindOptions = computed<SelectOption[]>(() => [
    { value: "", label: this.t()("demandes.filter.kindAll") },
    ...COOP_REQUEST_KINDS.map((kind) => ({ value: kind, label: this.t()(KIND_LABEL_KEY[kind]) })),
  ]);

  constructor() {
    if (this.apiMode) void this.load();
  }

  /** Les demandes viennent toujours de l'administration du CRADESC. */
  protected readonly source = sourceOfCoopRequest();

  protected sourceDetail(): string {
    return describeSource(this.source, this.t());
  }

  /** Éléments concernés par la demande (libellés, jamais de téléphone ni de CNI). */
  protected itemsText(request: CoopRequestDto): string {
    return request.items.map((item) => item.label).join(", ");
  }

  protected date(iso: string): string {
    return fmtDate(iso);
  }

  protected dateTime(iso: string): string {
    return fmtDateTime(iso);
  }

  /** Lien interne vers la fiche d'un élément concerné (les parcelles n'ont pas de page propre). */
  protected itemLink(item: CoopRequestItem): string[] | null {
    if (item.type === "producer") return ["/dashboard/producteurs", item.id];
    if (item.type === "organisation") return ["/dashboard/organisations", item.id];
    return null;
  }

  protected safeLink(request: CoopRequestDto): string | null {
    return request.link && isDashboardLink(request.link) ? request.link : null;
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadFailed.set(false);
    try {
      const all = await fetchAllPages((query) => listCoopRequests(query));
      all.sort((first, second) => second.createdAt.localeCompare(first.createdAt));
      this.requests.set(all);
      const shown = this.detail();
      if (shown) this.detail.set(all.find((request) => request.id === shown.id) ?? shown);
      this.counter.setOpenCount(all.filter((request) => request.status === "ouverte").length);
    } catch {
      this.loadFailed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected openDetail(request: CoopRequestDto): void {
    this.note.set("");
    this.confirmCancel.set(false);
    this.detail.set(request);
  }

  protected closeDetail(): void {
    if (this.busy()) return;
    this.detail.set(null);
    this.confirmCancel.set(false);
  }

  /** Remplace la demande modifiée dans la liste et dans la modale, et remet le compteur à jour. */
  private applyUpdate(updated: CoopRequestDto): void {
    const next = this.requests().map((request) => (request.id === updated.id ? updated : request));
    this.requests.set(next);
    this.detail.set(updated);
    this.counter.setOpenCount(next.filter((request) => request.status === "ouverte").length);
  }

  protected async resolve(): Promise<void> {
    const current = this.detail();
    if (!current || this.busy()) return;
    this.busy.set(true);
    try {
      this.applyUpdate(await resolveCoopRequest(current.id, this.note()));
      this.snackbar.success(this.t()("demandes.detail.resolved"));
    } catch (error) {
      this.snackbar.error(this.t()(coopRequestErrorKey(error)));
      // Une demande déjà clôturée ailleurs : on relit la liste pour afficher son état réel.
      if (coopRequestErrorKey(error) === "demandes.err.alreadyClosed") void this.load();
    } finally {
      this.busy.set(false);
    }
  }

  protected async cancel(): Promise<void> {
    const current = this.detail();
    if (!current || this.busy()) return;
    this.busy.set(true);
    try {
      this.applyUpdate(await cancelCoopRequest(current.id));
      this.confirmCancel.set(false);
      this.snackbar.success(this.t()("demandes.detail.cancelled"));
    } catch (error) {
      this.snackbar.error(this.t()(coopRequestErrorKey(error)));
      if (coopRequestErrorKey(error) === "demandes.err.alreadyClosed") void this.load();
    } finally {
      this.busy.set(false);
    }
  }
}
