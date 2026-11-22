import { Component, computed, inject, signal } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { map } from "rxjs";

import {
  deviceApiError,
  fetchDevices,
  reactivateDeviceOnApi,
  renameDeviceOnApi,
  resyncDeviceOnApi,
  revokeDeviceOnApi,
  signOutDeviceOnApi,
  type DevicesOverview,
} from "@/lib/api/devices";
import { isApiMode } from "@/lib/api/config";
import { fmtDateTime, nf } from "@/lib/format";
import type { MessageKey } from "@/lib/i18n";
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
  TextFieldComponent,
  TONE,
  V2_PAGE_STYLES,
  type StatCard,
} from "@shared/ui";

type Filter = "tous" | "actifs" | "revoques";
type ConfirmKind = "revoke" | "reactivate" | "signout";

/** Appareil tel que la page l'affiche, que les données viennent de l'API ou de la démonstration. */
interface DeviceRow {
  id: string;
  userId: string;
  label: string;
  platform: string;
  appVersion: string;
  registeredAt: string;
  lastActiveAt: string | null;
  active: boolean;
  signedOutPending: boolean;
}

interface OwnerRef {
  id: string;
  name: string;
  email: string;
  role: RoleId;
  scoopLabel: string;
}

const norm = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Appareils (charte V2) : les téléphones sur lesquels les comptes utilisent l'application mobile. On peut renommer un
 * appareil, demander une resynchronisation, forcer sa déconnexion, le révoquer ou le réactiver. Les données viennent de
 * l'API (`/devices`) ; en démonstration locale, du store en mémoire.
 */
@Component({
  selector: "app-appareils-page",
  imports: [AppShellComponent, IconComponent, ModalComponent, PaginationComponent, RouterLink, StatCardsComponent, TextFieldComponent],
  styles: [
    V2_PAGE_STYLES,
    `
      .sm {
        height: 40px;
        padding: 0 14px;
        font-size: 14px;
      }
    `,
  ],
  template: `
    <app-shell perm="device.manage" [area]="t()('appareils.area')">
      <header class="rise">
        <p class="mono" style="color: var(--v2-gris-texte)">{{ t()("appareils.eyebrow") }}</p>
        <h1 class="mt-2 text-[30px] font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-[38px]">
          {{ t()("appareils.title") }}
        </h1>
        <p class="mt-2 max-w-2xl text-[16px] font-medium" style="color: var(--v2-gris-texte)">
          {{ t()("appareils.description") }}
        </p>
      </header>

      <ui-stat-cards class="rise mt-8" [stats]="stats()" />

      <div class="toolbar card mt-6">
        <label class="search">
          <ui-icon name="search" [size]="20" />
          <input
            type="search"
            [placeholder]="t()('appareils.search')"
            [attr.aria-label]="t()('appareils.search')"
            [value]="q()"
            (input)="q.set($any($event.target).value)"
          />
        </label>
        <div class="seg" role="radiogroup" [attr.aria-label]="t()('appareils.state.aria')">
          @for (option of filterOptions(); track option.key) {
            <button
              type="button"
              role="radio"
              [class.on]="filter() === option.key"
              [attr.aria-checked]="filter() === option.key"
              (click)="filter.set(option.key)"
            >
              {{ option.label }}<span class="n" [class.zero]="!option.count">{{ nf.format(option.count) }}</span>
            </button>
          }
        </div>
      </div>

      @if (filteredOwner(); as owner) {
        <p class="sub mt-4 flex flex-wrap items-center gap-2">
          {{ t()("appareils.filter.of") }} <strong>{{ owner.name }}</strong>
          <a class="link font-bold" style="color: var(--v2-foret-clair)" routerLink="/dashboard/appareils">{{ t()("appareils.filter.all") }}</a>
        </p>
      }

      <section class="card mt-4 overflow-hidden">
        @if (loading()) {
          <div class="p-10 text-center" role="status"><p class="sub">{{ t()("shell.loading") }}</p></div>
        } @else if (shown().length) {
          <div class="overflow-x-auto">
            <table class="tbl min-w-[900px]">
              <thead>
                <tr>
                  <th>{{ t()("appareils.col.device") }}</th>
                  <th>{{ t()("appareils.col.user") }}</th>
                  <th>{{ t()("appareils.col.registered") }}</th>
                  <th>{{ t()("appareils.col.lastActive") }}</th>
                  <th>{{ t()("appareils.col.status") }}</th>
                  <th class="text-right">&nbsp;</th>
                </tr>
              </thead>
              <tbody>
                @for (device of pager.items(); track device.id) {
                  <tr>
                    <td class="max-w-[260px]">
                      <span class="block truncate font-bold">{{ device.label }}</span>
                      <span class="sub block truncate">{{ platformLabel(device) }}</span>
                    </td>
                    <td class="max-w-[240px]">
                      @if (owner(device.userId); as person) {
                        <span class="flex items-center gap-3">
                          <span class="grid size-9 shrink-0 place-items-center rounded-full text-[12px] font-extrabold" style="background: var(--v2-sauge); color: var(--v2-foret)">{{ initials(person.name) }}</span>
                          <span class="min-w-0">
                            <span class="block truncate font-bold">{{ person.name }}</span>
                            <span class="sub block truncate">{{ store.roleLabel(person.role) }}</span>
                          </span>
                        </span>
                      } @else {
                        <span class="sub">{{ t()("appareils.unknown") }}</span>
                      }
                    </td>
                    <td class="font-medium tabular-nums">{{ fmtDateTime(device.registeredAt) }}</td>
                    <td class="font-medium tabular-nums">{{ device.lastActiveAt ? fmtDateTime(device.lastActiveAt) : t()("appareils.neverSeen") }}</td>
                    <td>
                      <span class="badge" [style.background]="device.active ? toneSuccess.bg : toneNeutral.bg" [style.color]="device.active ? toneSuccess.fg : toneNeutral.fg">{{ device.active ? t()("appareils.state.active") : t()("appareils.state.revoked") }}</span>
                    </td>
                    <td>
                      <span class="flex flex-wrap items-center justify-end gap-2">
                        <button type="button" class="act" [title]="t()('appareils.action.rename')" [attr.aria-label]="t()('appareils.action.rename') + ' · ' + device.label" (click)="openRename(device)"><ui-icon name="edit" [size]="18" /></button>
                        @if (device.active) {
                          <button type="button" class="act" [title]="t()('appareils.action.resync')" [attr.aria-label]="t()('appareils.action.resync') + ' · ' + device.label" [disabled]="busy()" (click)="resync(device)"><ui-icon name="refresh" [size]="18" /></button>
                          <button type="button" class="act" [title]="t()('appareils.action.signout')" [attr.aria-label]="t()('appareils.action.signout') + ' · ' + device.label" (click)="ask(device, 'signout')"><ui-icon name="logout" [size]="18" /></button>
                          <button type="button" class="btn btn-ghost sm" (click)="ask(device, 'revoke')">{{ t()("appareils.action.revoke") }}</button>
                        } @else {
                          <button type="button" class="btn btn-primary sm" (click)="ask(device, 'reactivate')">{{ t()("appareils.action.reactivate") }}</button>
                        }
                      </span>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <ui-pagination class="px-5 pb-5" [pager]="pager" />
        } @else {
          <div class="flex flex-col items-center gap-3 p-10 text-center">
            <span class="grid size-14 place-items-center rounded-[16px]" style="background: var(--v2-sauge); color: var(--v2-foret)"><ui-icon name="search" [size]="26" /></span>
            <p class="text-[16px] font-extrabold">{{ t()("appareils.empty.title") }}</p>
            <p class="sub max-w-md">{{ t()("appareils.empty.desc") }}</p>
          </div>
        }
      </section>

      <!-- ───── Renommer ───── -->
      @if (renaming(); as device) {
        <ui-modal [open]="true" icon="edit" [title]="t()('appareils.rename.title')" [description]="t()('appareils.rename.desc')" [width]="540" [closeLabel]="t()('common.close')" (closed)="renaming.set(null)">
          <div class="pb-6">
            <ui-text-field [label]="t()('appareils.rename.field')" [placeholder]="t()('appareils.rename.placeholder')" [value]="renameLabel()" [error]="renameError()" (valueChange)="renameLabel.set($event); renameError.set('')" />
          </div>
          <button modal-footer type="button" class="btn btn-ghost" (click)="renaming.set(null)">{{ t()("comptes.cancel") }}</button>
          <button modal-footer type="button" class="btn btn-primary" [disabled]="busy()" (click)="saveRename(device)">{{ t()("appareils.rename.submit") }}</button>
        </ui-modal>
      }

      <!-- ───── Confirmation : révoquer, réactiver, déconnecter ───── -->
      @if (confirmation(); as pending) {
        <ui-modal [open]="true" [tone]="pending.kind === 'reactivate' ? 'default' : 'danger'" [icon]="pending.kind === 'reactivate' ? 'check' : pending.kind === 'signout' ? 'logout' : 'block'" [title]="confirmTitle(pending.kind)" [description]="t()('appareils.confirm.desc')" [width]="540" [closeLabel]="t()('common.close')" (closed)="confirmation.set(null)">
          <div class="pb-6">
            <p class="text-[15px] font-semibold">
              {{ t()("appareils.confirm.device") }} <strong>{{ pending.device.label }}</strong>
              @if (owner(pending.device.userId); as person) { {{ t()("appareils.confirm.of") }} {{ person.name }} }
            </p>
            <p class="sub mt-2">{{ confirmNote(pending.kind) }}</p>
          </div>
          <button modal-footer type="button" class="btn btn-ghost" (click)="confirmation.set(null)">{{ t()("comptes.cancel") }}</button>
          <button modal-footer type="button" class="btn" [class.btn-danger]="pending.kind !== 'reactivate'" [class.btn-primary]="pending.kind === 'reactivate'" [disabled]="busy()" (click)="runConfirmed(pending)">{{ confirmSubmit(pending.kind) }}</button>
        </ui-modal>
      }
    </app-shell>
  `,
})
export default class AppareilsPage {
  protected readonly store = inject(StoreService);
  protected readonly locale = inject(LocaleService);
  private readonly route = inject(ActivatedRoute);
  private readonly snackbar = inject(SnackbarService);
  protected readonly t = this.locale.t;
  protected readonly nf = nf;
  protected readonly fmtDateTime = fmtDateTime;
  protected readonly initials = initialsOf;
  protected readonly toneSuccess = TONE.succes;
  protected readonly toneNeutral = TONE.neutre;

  protected readonly q = signal("");
  protected readonly filter = signal<Filter>("tous");
  protected readonly busy = signal(false);
  protected readonly loading = signal(isApiMode());
  /** Réponse de l'API (`/devices`) ; vide en démonstration locale. */
  private readonly overview = signal<DevicesOverview | null>(null);

  protected readonly renaming = signal<DeviceRow | null>(null);
  protected readonly renameLabel = signal("");
  protected readonly renameError = signal("");
  protected readonly confirmation = signal<{ device: DeviceRow; kind: ConfirmKind } | null>(null);

  private readonly userFilter = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get("user") ?? "")),
    { initialValue: "" },
  );

  constructor() {
    if (isApiMode()) void this.reload();
  }

  // ───── Données ─────

  private scoopLabel(ids: readonly string[]): string {
    if (!ids.length) return this.t()("comptes.scopeAll");
    const scoops = this.store.state().scoops;
    return ids.map((id) => scoops.find((scoop) => scoop.id === id)?.name ?? id).join(", ");
  }

  private async reload(): Promise<void> {
    try {
      this.overview.set(await fetchDevices());
    } catch {
      this.snackbar.error(this.t()("appareils.loadError"));
    } finally {
      this.loading.set(false);
    }
  }

  protected readonly devices = computed<DeviceRow[]>(() => {
    if (isApiMode()) {
      return (this.overview()?.devices ?? []).map((device) => ({
        id: device.id,
        userId: device.userId,
        label: device.label,
        platform: device.platform,
        appVersion: device.appVersion,
        registeredAt: device.registeredAt,
        lastActiveAt: device.lastActiveAt,
        active: device.active,
        signedOutPending: !!device.signOutRequestedAt,
      }));
    }
    return this.store.state().devices.map((device) => ({
      id: device.id,
      userId: device.userId,
      label: device.label,
      platform: "",
      appVersion: "",
      registeredAt: device.registeredAt,
      lastActiveAt: device.lastActiveAt,
      active: device.active,
      signedOutPending: false,
    }));
  });

  protected owner(userId: string): OwnerRef | undefined {
    if (isApiMode()) {
      const owner = this.overview()?.owners.find((item) => item.id === userId);
      return owner ? { id: owner.id, name: owner.name, email: owner.email, role: owner.role, scoopLabel: this.scoopLabel(owner.scoopIds) } : undefined;
    }
    const user = this.store.state().users.find((item) => item.id === userId);
    return user
      ? { id: user.id, name: user.name, email: user.email, role: user.role, scoopLabel: this.scoopLabel(user.scoopIds ?? (user.scoopId ? [user.scoopId] : [])) }
      : undefined;
  }

  protected readonly filteredOwner = computed(() => {
    const id = this.userFilter();
    return id ? this.owner(id) : undefined;
  });

  protected platformLabel(device: DeviceRow): string {
    const t = this.t();
    const platform = device.platform === "android" ? t("appareils.platform.android") : device.platform === "ios" ? t("appareils.platform.ios") : "";
    return [platform, device.appVersion && `v${device.appVersion}`].filter(Boolean).join(" · ") || "—";
  }

  // ───── Filtres ─────

  private readonly searched = computed(() => {
    const needle = norm(this.q().trim());
    const owner = this.userFilter();
    return this.devices().filter((device) => {
      if (owner && device.userId !== owner) return false;
      if (!needle) return true;
      const person = this.owner(device.userId);
      return norm(`${device.label} ${person?.name ?? ""} ${person?.email ?? ""}`).includes(needle);
    });
  });

  protected readonly shown = computed(() => {
    const filter = this.filter();
    return this.searched().filter((device) => filter === "tous" || (filter === "actifs" ? device.active : !device.active));
  });

  protected readonly filterOptions = computed(() => {
    const t = this.t();
    const all = this.searched();
    return [
      { key: "tous" as const, label: t("appareils.seg.all"), count: all.length },
      { key: "actifs" as const, label: t("appareils.seg.active"), count: all.filter((device) => device.active).length },
      { key: "revoques" as const, label: t("appareils.seg.revoked"), count: all.filter((device) => !device.active).length },
    ];
  });

  protected readonly pager = createPager(() => this.shown());

  protected readonly stats = computed<StatCard[]>(() => {
    const t = this.t();
    const all = this.devices();
    const active = all.filter((device) => device.active).length;
    const recent = all.filter((device) => device.lastActiveAt && Date.now() - new Date(device.lastActiveAt).getTime() < WEEK_MS).length;
    return [
      { label: t("appareils.stat.devices"), value: nf.format(all.length), sub: t("appareils.stat.devicesSub", { count: nf.format(new Set(all.map((device) => device.userId)).size) }), icon: "manage_accounts", bg: "", fg: "" },
      { label: t("appareils.stat.active"), value: nf.format(active), sub: t("appareils.stat.activeSub"), icon: "check", ...TONE.succes },
      { label: t("appareils.stat.revoked"), value: nf.format(all.length - active), sub: t("appareils.stat.revokedSub"), icon: "block", ...TONE.neutre },
      { label: t("appareils.stat.recent"), value: nf.format(recent), sub: t("appareils.stat.recentSub"), icon: "history", ...TONE.info },
    ];
  });

  // ───── Actions ─────

  /** Exécute l'action sur l'API (puis relit la liste) ou dans le store de démonstration, et le dit à la personne. */
  private async apply(onApi: () => Promise<unknown>, onDemo: () => void, success: MessageKey): Promise<boolean> {
    if (this.busy()) return false;
    this.busy.set(true);
    try {
      if (isApiMode()) {
        await onApi();
        await this.reload();
      } else {
        onDemo();
      }
      this.snackbar.success(this.t()(success));
      return true;
    } catch (error) {
      this.snackbar.error(this.t()(deviceApiError(error)));
      if (isApiMode()) await this.reload();
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  protected ask(device: DeviceRow, kind: ConfirmKind): void {
    this.confirmation.set({ device, kind });
  }

  protected async runConfirmed(pending: { device: DeviceRow; kind: ConfirmKind }): Promise<void> {
    const { device, kind } = pending;
    const done =
      kind === "revoke"
        ? await this.apply(() => revokeDeviceOnApi(device.id), () => this.store.actions.revokeDevice(device.id), "appareils.ok.revoked")
        : kind === "reactivate"
          ? await this.apply(() => reactivateDeviceOnApi(device.id), () => this.store.actions.reactivateDevice(device.id), "appareils.ok.reactivated")
          : await this.apply(() => signOutDeviceOnApi(device.id), () => this.store.actions.signOutDevice(device.id), "appareils.ok.signedOut");
    if (done) this.confirmation.set(null);
  }

  protected resync(device: DeviceRow): void {
    void this.apply(() => resyncDeviceOnApi(device.id), () => this.store.actions.resyncDevice(device.id), "appareils.ok.resync");
  }

  protected openRename(device: DeviceRow): void {
    this.renaming.set(device);
    this.renameLabel.set(device.label);
    this.renameError.set("");
  }

  protected async saveRename(device: DeviceRow): Promise<void> {
    const label = this.renameLabel().trim().replace(/\s+/g, " ");
    if (label.length < 2) {
      this.renameError.set(this.t()("appareils.rename.placeholder"));
      return;
    }
    const done = await this.apply(() => renameDeviceOnApi(device.id, label), () => this.store.actions.renameDevice(device.id, label), "appareils.toast.renamed");
    if (done) this.renaming.set(null);
  }

  protected confirmTitle(kind: ConfirmKind): string {
    return this.t()(kind === "revoke" ? "appareils.confirm.revoke.title" : kind === "reactivate" ? "appareils.confirm.reactivate.title" : "appareils.confirm.signout.title");
  }

  protected confirmNote(kind: ConfirmKind): string {
    return this.t()(kind === "revoke" ? "appareils.confirm.revoke.note" : kind === "reactivate" ? "appareils.confirm.reactivate.note" : "appareils.confirm.signout.note");
  }

  protected confirmSubmit(kind: ConfirmKind): string {
    return this.t()(kind === "revoke" ? "appareils.confirm.revoke.submit" : kind === "reactivate" ? "appareils.confirm.reactivate.submit" : "appareils.confirm.signout.submit");
  }
}
