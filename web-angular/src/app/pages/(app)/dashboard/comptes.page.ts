import { Component, computed, inject, signal } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { map } from "rxjs";

import {
  accountLinkError,
  fetchAccountLinks,
  linkAccount,
  rejectAccountCandidate,
  unlinkAccount,
  type AccountLinksOverview,
} from "@/lib/api/account-links";
import { isApiMode } from "@/lib/api/config";
import { listProducers } from "@/lib/api/producers";
import { fmtDateTime, nf } from "@/lib/format";
import type { MessageKey } from "@/lib/i18n";
import { inScope } from "@/lib/scope";
import type { RoleId } from "@/lib/permissions";
import { AppShellComponent } from "@shared/app-shell.component";
import { LocaleService } from "@shared/locale.service";
import { StoreService } from "@shared/store.service";
import { createPager } from "@shared/pager";
import {
  IconComponent,
  initialsOf,
  ModalComponent,
  PaginationComponent,
  SnackbarService,
  StatCardsComponent,
  TONE,
  V2_PAGE_STYLES,
  type StatCard,
} from "@shared/ui";

type Vue = "a-rapprocher" | "candidats" | "liees";

/** Compte tel que la page l'affiche, que les données viennent de l'API ou de la démonstration. */
interface AccountRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: RoleId;
  scoopLabel: string;
  active: boolean;
}

/** Fiche producteur résumée. */
interface ProducerRef {
  id: string;
  code: string;
  name: string;
  village: string;
  scoopLabel: string;
}

interface CandidateRow {
  id: string;
  account: AccountRow;
  producer: ProducerRef;
  score: number;
  signals: string[];
}

interface LinkRow {
  id: string;
  account: AccountRow;
  producer: ProducerRef;
  linkedAt: string;
  by: string;
}

const norm = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Comptes & liaisons (charte V2) : rapproche chaque compte de sa fiche producteur. Trois vues : les comptes à rapprocher
 * à la main, les propositions du système (nom, prénom, téléphone) à confirmer ou écarter, et les liaisons confirmées.
 * Les données viennent de l'API (`/account-links`) ; en démonstration locale, du store en mémoire.
 */
@Component({
  selector: "app-comptes-page",
  imports: [AppShellComponent, IconComponent, ModalComponent, PaginationComponent, RouterLink, StatCardsComponent],
  styles: [
    V2_PAGE_STYLES,
    `
      .sm {
        height: 40px;
        padding: 0 14px;
        font-size: 14px;
      }
      .score {
        font-family: var(--v2-font-mono);
        font-variant-numeric: tabular-nums;
      }
      .hit {
        display: flex;
        width: 100%;
        align-items: center;
        gap: 12px;
        border-radius: 14px;
        border: 1.5px solid var(--v2-bord-carte);
        background: var(--v2-blanc);
        padding: 10px 12px;
        text-align: left;
        cursor: pointer;
      }
      .hit:hover {
        border-color: var(--v2-gris-texte);
      }
      .hit:focus-visible {
        outline: 2px solid var(--v2-foret);
        outline-offset: 2px;
      }
    `,
  ],
  template: `
    <app-shell perm="account.manage" [area]="t()('comptes.area')">
      <header class="rise">
        <p class="mono" style="color: var(--v2-gris-texte)">{{ t()("comptes.eyebrow") }}</p>
        <h1 class="mt-2 text-[30px] font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-[38px]">
          {{ t()("comptes.title") }}
        </h1>
        <p class="mt-2 max-w-2xl text-[16px] font-medium" style="color: var(--v2-gris-texte)">
          {{ t()("comptes.description") }}
        </p>
      </header>

      <ui-stat-cards class="rise mt-8" [stats]="stats()" />

      <div class="toolbar card mt-6">
        <label class="search">
          <ui-icon name="search" [size]="20" />
          <input
            type="search"
            [placeholder]="t()('comptes.search')"
            [attr.aria-label]="t()('comptes.search')"
            [value]="q()"
            (input)="q.set($any($event.target).value)"
          />
        </label>
        <div class="seg" role="radiogroup" [attr.aria-label]="t()('comptes.views')">
          @for (option of vueOptions(); track option.key) {
            <button
              type="button"
              role="radio"
              [class.on]="vue() === option.key"
              [attr.aria-checked]="vue() === option.key"
              (click)="setVue(option.key)"
            >
              {{ option.label }}<span class="n" [class.zero]="!option.count">{{ nf.format(option.count) }}</span>
            </button>
          }
        </div>
      </div>

      <section class="card mt-4 overflow-hidden">
        @if (loading()) {
          <div class="p-10 text-center" role="status"><p class="sub">{{ t()("shell.loading") }}</p></div>
        } @else {
          @switch (vue()) {
            @case ("a-rapprocher") {
              @if (toMatch().length) {
                <div class="overflow-x-auto">
                  <table class="tbl min-w-[760px]">
                    <thead>
                      <tr>
                        <th>{{ t()("comptes.col.account") }}</th>
                        <th>{{ t()("comptes.col.role") }}</th>
                        <th>{{ t()("comptes.col.scope") }}</th>
                        <th>{{ t()("comptes.col.state") }}</th>
                        <th class="text-right">{{ t()("comptes.col.matching") }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (account of matchPager.items(); track account.id) {
                        <tr>
                          <td class="max-w-[300px]">
                            <span class="flex items-center gap-3">
                              <span class="grid size-10 shrink-0 place-items-center rounded-full text-[13px] font-extrabold" style="background: var(--v2-sauge); color: var(--v2-foret)">{{ initials(account.name) }}</span>
                              <span class="min-w-0">
                                <span class="block truncate font-bold">{{ account.name }}</span>
                                <span class="sub block truncate">{{ account.email }}</span>
                              </span>
                            </span>
                          </td>
                          <td class="font-medium">{{ store.roleLabel(account.role) }}</td>
                          <td class="max-w-44 truncate font-medium" [title]="account.scoopLabel">{{ account.scoopLabel }}</td>
                          <td>
                            <span class="badge" [style.background]="account.active ? toneSuccess.bg : toneNeutral.bg" [style.color]="account.active ? toneSuccess.fg : toneNeutral.fg">{{ account.active ? t()("comptes.state.active") : t()("comptes.state.inactive") }}</span>
                          </td>
                          <td>
                            <span class="flex justify-end">
                              <button type="button" class="btn btn-ghost sm" (click)="openPicker(account)">
                                <ui-icon name="search" [size]="18" />{{ t()("comptes.picker.button") }}
                              </button>
                            </span>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
                <ui-pagination class="px-5 pb-5" [pager]="matchPager" />
              } @else {
                <div class="flex flex-col items-center gap-3 p-10 text-center">
                  <span class="grid size-14 place-items-center rounded-[16px]" style="background: var(--v2-sauge); color: var(--v2-foret)"><ui-icon name="check" [size]="26" /></span>
                  <p class="text-[16px] font-extrabold">{{ needle() ? t()("comptes.empty.noAccount") : t()("comptes.empty.allMatched") }}</p>
                  <p class="sub">{{ needle() ? t()("comptes.empty.editSearch") : t()("comptes.empty.allMatchedDesc") }}</p>
                </div>
              }
            }
            @case ("candidats") {
              @if (shownCandidates().length) {
                <div class="overflow-x-auto">
                  <table class="tbl min-w-[900px]">
                    <thead>
                      <tr>
                        <th>{{ t()("comptes.col.account") }}</th>
                        <th>{{ t()("comptes.col.candidate") }}</th>
                        <th>{{ t()("comptes.col.score") }}</th>
                        <th>{{ t()("comptes.col.signals") }}</th>
                        <th class="text-right">{{ t()("comptes.col.decision") }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (candidate of candPager.items(); track candidate.id) {
                        <tr>
                          <td class="max-w-[260px]">
                            <span class="block truncate font-bold">{{ candidate.account.name }}</span>
                            <span class="sub block truncate">{{ store.roleLabel(candidate.account.role) }} · {{ candidate.account.scoopLabel }}</span>
                          </td>
                          <td class="max-w-[280px]">
                            <a class="block truncate font-bold" style="color: var(--v2-foret-clair)" [routerLink]="['/dashboard/producteurs', candidate.producer.id]">{{ candidate.producer.code }} · {{ candidate.producer.name }}</a>
                            <span class="sub block truncate">{{ candidate.producer.scoopLabel }}{{ candidate.producer.village ? " · " + candidate.producer.village : "" }}</span>
                          </td>
                          <td>
                            <span class="badge score" [attr.aria-label]="t()('comptes.score.aria', { score: candidate.score })" [style.background]="scoreTone(candidate.score).bg" [style.color]="scoreTone(candidate.score).fg">{{ candidate.score }} %</span>
                          </td>
                          <td class="max-w-64 text-[13px] font-medium" style="color: var(--v2-gris-texte)">{{ candidate.signals.join(" · ") }}</td>
                          <td>
                            <span class="flex justify-end gap-2">
                              <button type="button" class="btn btn-primary sm" [disabled]="busy()" (click)="confirm(candidate)">
                                {{ t()("comptes.confirm") }}
                              </button>
                              <button type="button" class="btn btn-ghost sm" [disabled]="busy()" (click)="reject(candidate)">
                                {{ t()("comptes.action.reject") }}
                              </button>
                            </span>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
                <ui-pagination class="px-5 pb-5" [pager]="candPager" />
              } @else {
                <div class="flex flex-col items-center gap-3 p-10 text-center">
                  <span class="grid size-14 place-items-center rounded-[16px]" style="background: var(--v2-sauge); color: var(--v2-foret)"><ui-icon name="search" [size]="26" /></span>
                  <p class="text-[16px] font-extrabold">{{ needle() ? t()("comptes.empty.noProposal") : t()("comptes.empty.noCandidate") }}</p>
                  <p class="sub max-w-md">{{ needle() ? t()("comptes.empty.editSearch") : t()("comptes.empty.noCandidateDesc") }}</p>
                  @if (!needle() && unmatched().length) {
                    <button type="button" class="btn btn-ghost sm" (click)="setVue('a-rapprocher')">{{ t()("comptes.matchManually", { n: unmatched().length }) }}</button>
                  }
                </div>
              }
            }
            @case ("liees") {
              @if (shownLinks().length) {
                <div class="overflow-x-auto">
                  <table class="tbl min-w-[860px]">
                    <thead>
                      <tr>
                        <th>{{ t()("comptes.col.account") }}</th>
                        <th>{{ t()("comptes.col.linkedProducer") }}</th>
                        <th>{{ t()("comptes.col.linkedOn") }}</th>
                        <th>{{ t()("comptes.col.by") }}</th>
                        <th class="text-right">&nbsp;</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (link of linkedPager.items(); track link.id) {
                        <tr>
                          <td class="max-w-[260px]">
                            <span class="block truncate font-bold">{{ link.account.name }}</span>
                            <span class="sub block truncate">{{ store.roleLabel(link.account.role) }} · {{ link.account.scoopLabel }}</span>
                          </td>
                          <td class="max-w-[280px]">
                            <a class="block truncate font-bold" style="color: var(--v2-foret-clair)" [routerLink]="['/dashboard/producteurs', link.producer.id]">{{ link.producer.code }} · {{ link.producer.name }}</a>
                            <span class="sub block truncate">{{ link.producer.scoopLabel }}{{ link.producer.village ? " · " + link.producer.village : "" }}</span>
                          </td>
                          <td class="font-medium tabular-nums">{{ fmtDateTime(link.linkedAt) }}</td>
                          <td class="max-w-44 truncate font-medium" [title]="link.by">{{ link.by }}</td>
                          <td>
                            <span class="flex justify-end">
                              <button type="button" class="btn btn-ghost sm" [disabled]="busy()" (click)="unlinkTarget.set(link)">
                                {{ t()("comptes.action.unlink") }}
                              </button>
                            </span>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
                <ui-pagination class="px-5 pb-5" [pager]="linkedPager" />
              } @else {
                <div class="flex flex-col items-center gap-3 p-10 text-center">
                  <span class="grid size-14 place-items-center rounded-[16px]" style="background: var(--v2-sauge); color: var(--v2-foret)"><ui-icon name="link" [size]="26" /></span>
                  <p class="text-[16px] font-extrabold">{{ needle() ? t()("comptes.empty.noLink") : t()("comptes.empty.noConfirmed") }}</p>
                  <p class="sub max-w-md">{{ needle() ? t()("comptes.empty.editSearch") : t()("comptes.empty.noConfirmedDesc") }}</p>
                </div>
              }
            }
          }
        }
      </section>

      <!-- ───── Recherche manuelle de la fiche ───── -->
      @if (pickerAccount(); as account) {
        <ui-modal [open]="true" icon="search" [title]="t()('comptes.picker.title', { name: account.name })" [description]="t()('comptes.picker.description')" [width]="640" [closeLabel]="t()('common.close')" (closed)="closePicker()">
          <div class="pb-6">
            <label class="search">
              <ui-icon name="search" [size]="20" />
              <input
                type="search"
                [placeholder]="t()('comptes.picker.placeholder')"
                [attr.aria-label]="t()('comptes.picker.placeholder')"
                [value]="pickerQ()"
                (input)="onPickerInput($any($event.target).value)"
              />
            </label>
            <div class="mt-4 grid gap-2" aria-live="polite">
              @for (hit of pickerHits(); track hit.id) {
                <button type="button" class="hit" [disabled]="busy()" (click)="linkManually(account, hit)">
                  <span class="min-w-0 flex-1">
                    <span class="block truncate font-bold">{{ hit.code }} · {{ hit.name }}</span>
                    <span class="sub block truncate">{{ hit.scoopLabel }}{{ hit.village ? " · " + hit.village : "" }}</span>
                  </span>
                  <span class="badge" style="background: var(--v2-sauge); color: var(--v2-foret)">{{ t()("comptes.picker.choose") }}</span>
                </button>
              } @empty {
                <p class="sub py-4 text-center">{{ pickerLoading() ? t()("shell.loading") : t()("comptes.picker.none") }}</p>
              }
            </div>
          </div>
          <button modal-footer type="button" class="btn btn-ghost" (click)="closePicker()">{{ t()("comptes.cancel") }}</button>
        </ui-modal>
      }

      <!-- ───── Confirmation : délier ───── -->
      @if (unlinkTarget(); as link) {
        <ui-modal [open]="true" tone="danger" icon="link" [title]="t()('comptes.dlg.unlink.title')" [description]="t()('comptes.dlg.unlink.desc')" [width]="540" [closeLabel]="t()('common.close')" (closed)="unlinkTarget.set(null)">
          <p class="pb-6 text-[15px] font-semibold">{{ link.account.name }} ↔ {{ link.producer.code }} · {{ link.producer.name }}</p>
          <button modal-footer type="button" class="btn btn-ghost" (click)="unlinkTarget.set(null)">{{ t()("comptes.cancel") }}</button>
          <button modal-footer type="button" class="btn btn-danger" [disabled]="busy()" (click)="unlink(link)">{{ t()("comptes.dlg.unlink.action") }}</button>
        </ui-modal>
      }
    </app-shell>
  `,
})
export default class ComptesPage {
  protected readonly store = inject(StoreService);
  protected readonly locale = inject(LocaleService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackbar = inject(SnackbarService);
  protected readonly t = this.locale.t;
  protected readonly nf = nf;
  protected readonly fmtDateTime = fmtDateTime;
  protected readonly initials = initialsOf;
  protected readonly toneSuccess = TONE.succes;
  protected readonly toneNeutral = TONE.neutre;

  protected readonly q = signal("");
  protected readonly busy = signal(false);
  protected readonly loading = signal(isApiMode());
  /** Réponse de l'API (`/account-links`) ; vide en démonstration locale. */
  private readonly overview = signal<AccountLinksOverview | null>(null);

  protected readonly pickerAccount = signal<AccountRow | null>(null);
  protected readonly pickerQ = signal("");
  protected readonly pickerApiHits = signal<ProducerRef[]>([]);
  protected readonly pickerLoading = signal(false);
  private pickerTimer: ReturnType<typeof setTimeout> | undefined;
  protected readonly unlinkTarget = signal<LinkRow | null>(null);

  private readonly vueFromRoute = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get("vue") as Vue | null)),
    { initialValue: null as Vue | null },
  );

  constructor() {
    if (isApiMode()) void this.reload();
  }

  // ───── Données ─────

  private scoopLabel(ids: readonly string[]): string {
    if (!ids.length) return this.t()("comptes.scopeAll");
    const scoops = this.store.state().scoops;
    const names = ids.map((id) => scoops.find((scoop) => scoop.id === id)?.name ?? id);
    return names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2}` : names.join(", ");
  }

  private producerRef(
    summary: { id: string; code: string; firstName: string; lastName: string; village: string; scoopId: string },
  ): ProducerRef {
    return {
      id: summary.id,
      code: summary.code,
      name: `${summary.firstName} ${summary.lastName}`,
      village: summary.village,
      scoopLabel: this.scoopLabel([summary.scoopId]),
    };
  }

  private async reload(): Promise<void> {
    try {
      this.overview.set(await fetchAccountLinks());
    } catch {
      this.snackbar.error(this.t()("comptes.loadError"));
    } finally {
      this.loading.set(false);
    }
  }

  protected readonly accounts = computed<AccountRow[]>(() => {
    const data = this.overview();
    if (isApiMode()) {
      return (data?.accounts ?? []).map((account) => ({
        id: account.id,
        name: account.name,
        email: account.email,
        phone: account.phone,
        role: account.role,
        scoopLabel: this.scoopLabel(account.scoopIds),
        active: account.active,
      }));
    }
    return this.store.state().users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      scoopLabel: this.scoopLabel(user.scoopIds ?? (user.scoopId ? [user.scoopId] : [])),
      active: user.active,
    }));
  });

  private accountById(id: string): AccountRow | undefined {
    return this.accounts().find((account) => account.id === id);
  }

  protected readonly candidates = computed<CandidateRow[]>(() => {
    if (isApiMode()) {
      return (this.overview()?.candidates ?? []).flatMap((candidate) => {
        const account = this.accountById(candidate.userId);
        return account
          ? [{ id: candidate.id, account, producer: this.producerRef(candidate.producer), score: candidate.score, signals: candidate.signals }]
          : [];
      });
    }
    const state = this.store.state();
    return state.linkCandidates.flatMap((candidate) => {
      const account = this.accountById(candidate.userId);
      const producer = state.producers.find((item) => item.id === candidate.producerId);
      return account && producer
        ? [{ id: candidate.id, account, producer: this.producerRef(producer), score: candidate.score, signals: candidate.signals }]
        : [];
    });
  });

  protected readonly links = computed<LinkRow[]>(() => {
    if (isApiMode()) {
      return (this.overview()?.links ?? []).flatMap((link) => {
        const account = this.accountById(link.userId);
        return account ? [{ id: link.id, account, producer: this.producerRef(link.producer), linkedAt: link.linkedAt, by: link.by }] : [];
      });
    }
    const state = this.store.state();
    return state.links.flatMap((link) => {
      const account = this.accountById(link.userId);
      const producer = state.producers.find((item) => item.id === link.producerId);
      return account && producer ? [{ id: link.id, account, producer: this.producerRef(producer), linkedAt: link.linkedAt, by: link.by }] : [];
    });
  });

  protected readonly unmatched = computed(() => {
    const linked = new Set(this.links().map((link) => link.account.id));
    const proposed = new Set(this.candidates().map((candidate) => candidate.account.id));
    return this.accounts().filter((account) => !linked.has(account.id) && !proposed.has(account.id));
  });

  // ───── Vues et recherche ─────

  protected readonly needle = computed(() => norm(this.q().trim()));

  private hit(...haystack: (string | undefined)[]): boolean {
    const needle = this.needle();
    return !needle || haystack.some((text) => norm(text ?? "").includes(needle));
  }

  protected readonly toMatch = computed(() =>
    this.unmatched().filter((account) => this.hit(account.name, account.email, this.store.roleLabel(account.role), account.scoopLabel)),
  );
  protected readonly shownCandidates = computed(() =>
    this.candidates().filter((candidate) => this.hit(candidate.account.name, candidate.producer.code, candidate.producer.name)),
  );
  protected readonly shownLinks = computed(() =>
    this.links().filter((link) => this.hit(link.account.name, link.producer.code, link.producer.name)),
  );

  protected readonly vue = computed<Vue>(() => {
    const fromUrl = this.vueFromRoute();
    if (fromUrl === "a-rapprocher" || fromUrl === "candidats" || fromUrl === "liees") return fromUrl;
    if (this.candidates().length) return "candidats";
    return this.unmatched().length ? "a-rapprocher" : "liees";
  });

  protected readonly vueOptions = computed(() => {
    const t = this.t();
    return [
      { key: "a-rapprocher" as const, label: t("comptes.view.toMatch"), count: this.unmatched().length },
      { key: "candidats" as const, label: t("comptes.view.candidates"), count: this.candidates().length },
      { key: "liees" as const, label: t("comptes.view.linked"), count: this.links().length },
    ];
  });

  protected readonly stats = computed<StatCard[]>(() => {
    const t = this.t();
    return [
      { label: t("comptes.stat.accounts"), value: nf.format(this.accounts().length), sub: t("comptes.stat.accountsSub", { count: nf.format(this.links().length) }), icon: "manage_accounts", bg: "", fg: "" },
      { label: t("comptes.stat.toMatch"), value: nf.format(this.unmatched().length), sub: t("comptes.stat.toMatchSub"), icon: "search", ...TONE.attente },
      { label: t("comptes.stat.candidates"), value: nf.format(this.candidates().length), sub: t("comptes.stat.candidatesSub"), icon: "check", ...TONE.info },
      { label: t("comptes.stat.linked"), value: nf.format(this.links().length), sub: t("comptes.stat.linkedSub"), icon: "link", ...TONE.succes },
    ];
  });

  protected readonly matchPager = createPager(() => this.toMatch());
  protected readonly candPager = createPager(() => this.shownCandidates());
  protected readonly linkedPager = createPager(() => this.shownLinks());

  protected scoreTone(score: number) {
    return score >= 80 ? TONE.succes : score >= 60 ? TONE.attente : TONE.neutre;
  }

  protected setVue(vue: Vue): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { vue },
      queryParamsHandling: "merge",
      replaceUrl: true,
    });
  }

  // ───── Actions ─────

  /** Exécute l'action sur l'API (puis relit la liste) ou dans le store de démonstration, et le dit à la personne. */
  private async apply(
    onApi: () => Promise<unknown>,
    onDemo: () => boolean | void,
    success: { title: MessageKey; description?: MessageKey },
  ): Promise<boolean> {
    if (this.busy()) return false;
    this.busy.set(true);
    try {
      if (isApiMode()) {
        await onApi();
        await this.reload();
      } else if (onDemo() === false) {
        this.snackbar.error(this.t()("comptes.toast.impossibleDesc"));
        return false;
      }
      this.snackbar.success(this.t()(success.title));
      return true;
    } catch (error) {
      this.snackbar.error(this.t()(accountLinkError(error)));
      // La fiche ou le compte a pu changer entre-temps : on relit.
      if (isApiMode()) await this.reload();
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  protected confirm(candidate: CandidateRow): void {
    void this.apply(
      () => linkAccount(candidate.account.id, candidate.producer.id),
      () => this.store.actions.confirmLink(candidate.account.id, candidate.producer.id),
      { title: "comptes.toast.confirmed" },
    );
  }

  protected reject(candidate: CandidateRow): void {
    void this.apply(
      () => rejectAccountCandidate(candidate.account.id, candidate.producer.id),
      () => this.store.actions.rejectLink(candidate.id),
      { title: "comptes.toast.rejected" },
    );
  }

  protected async unlink(link: LinkRow): Promise<void> {
    const done = await this.apply(
      () => unlinkAccount(link.id),
      () => this.store.actions.unlinkLink(link.id),
      { title: "comptes.toast.removed" },
    );
    if (done) this.unlinkTarget.set(null);
  }

  // ───── Recherche manuelle de la fiche ─────

  protected openPicker(account: AccountRow): void {
    this.pickerAccount.set(account);
    this.pickerQ.set("");
    this.pickerApiHits.set([]);
    void this.searchProducers("");
  }

  protected closePicker(): void {
    clearTimeout(this.pickerTimer);
    this.pickerAccount.set(null);
  }

  protected onPickerInput(value: string): void {
    this.pickerQ.set(value);
    clearTimeout(this.pickerTimer);
    this.pickerTimer = setTimeout(() => void this.searchProducers(value), 250);
  }

  /** Fiches pas encore rapprochées : recherche côté serveur en mode API, sur le store en démonstration. */
  private async searchProducers(raw: string): Promise<void> {
    if (!isApiMode()) return;
    const query = raw.trim();
    if (query.length === 1) {
      this.pickerApiHits.set([]);
      return;
    }
    this.pickerLoading.set(true);
    try {
      const page = await listProducers({ ...(query && { q: query }), limit: 30 });
      this.pickerApiHits.set(page.items.filter((item) => !item.mergedInto).map((item) => this.producerRef(item)));
    } catch {
      this.pickerApiHits.set([]);
    } finally {
      this.pickerLoading.set(false);
    }
  }

  protected readonly pickerHits = computed<ProducerRef[]>(() => {
    const account = this.pickerAccount();
    if (!account) return [];
    const taken = new Set(this.links().map((link) => link.producer.id));
    if (isApiMode()) return this.pickerApiHits().filter((hit) => !taken.has(hit.id)).slice(0, 20);
    const needle = norm(this.pickerQ().trim());
    const state = this.store.state();
    return inScope(state.producers, state.session)
      .filter((producer) => !producer.mergedInto && !taken.has(producer.id))
      .filter((producer) => !needle || norm(`${producer.firstName} ${producer.lastName} ${producer.code} ${producer.village}`).includes(needle))
      .slice(0, 20)
      .map((producer) => this.producerRef(producer));
  });

  protected async linkManually(account: AccountRow, hit: ProducerRef): Promise<void> {
    const done = await this.apply(
      () => linkAccount(account.id, hit.id),
      () => this.store.actions.linkManually(account.id, hit.id),
      { title: "comptes.toast.created" },
    );
    if (done) this.closePicker();
  }
}
