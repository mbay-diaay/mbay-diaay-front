import { Component, computed, inject, signal } from "@angular/core";
import { RouterLink } from "@angular/router";

import { isApiMode } from "@/lib/api/config";
import { fetchDevices, type ApiDevice } from "@/lib/api/devices";
import { fetchAllPages } from "@/lib/api/pagination";
import { fetchMe, type MeResponse } from "@/lib/api/session";
import { listUsers, type ApiUser } from "@/lib/api/users";
import { fmtDateTime, nf } from "@/lib/format";
import type { MessageKey } from "@/lib/i18n";
import type { Permission } from "@/lib/permissions";
import { AppShellComponent } from "@shared/app-shell.component";
import { LocaleService } from "@shared/locale.service";
import { StoreService } from "@shared/store.service";
import {
  IconComponent,
  initialsOf,
  SnackbarService,
  TONE,
  UiEmptyStateComponent,
  V2_PAGE_STYLES,
} from "@shared/ui";

type ProfileTab = "info" | "permissions" | "devices";

/**
 * Super administration › Mon profil (charte V2) : fiche complète du compte connecté
 * (identité, rôle actif, périmètre, session, droits effectifs et appareils associés).
 */
@Component({
  selector: "app-super-admin-profil-page",
  imports: [AppShellComponent, IconComponent, RouterLink, UiEmptyStateComponent],
  styles: [
    V2_PAGE_STYLES,
    `
      .hero {
        position: relative;
        overflow: hidden;
        border-radius: 24px;
        border: 1.5px solid var(--v2-bord-carte);
        background:
          radial-gradient(circle at 92% 14%, color-mix(in oklab, var(--v2-sauge) 58%, transparent) 0, transparent 42%),
          var(--v2-blanc);
        padding: 24px;
      }
      .avatar {
        display: grid;
        height: 76px;
        width: 76px;
        flex-shrink: 0;
        place-items: center;
        border-radius: 22px;
        background: var(--v2-foret);
        color: var(--v2-citron);
        font-size: 24px;
        font-weight: 800;
        letter-spacing: -0.02em;
        overflow: hidden;
      }
      .avatar img {
        height: 100%;
        width: 100%;
        object-fit: cover;
      }
      .kpi-card {
        border-radius: 20px;
        border: 1.5px solid var(--v2-bord-carte);
        background: var(--v2-blanc);
        padding: 18px 20px;
      }
      .kpi-val {
        margin-top: 8px;
        font-size: 24px;
        font-weight: 800;
        line-height: 1.15;
        letter-spacing: -0.02em;
        color: var(--v2-encre);
      }
      .kpi-sub {
        margin-top: 4px;
        font-size: 13px;
        font-weight: 500;
        color: var(--v2-gris-texte);
      }
      .tabs {
        display: inline-flex;
        flex-wrap: wrap;
        gap: 6px;
        border-radius: 16px;
        border: 1.5px solid var(--v2-bord-carte);
        background: var(--v2-blanc);
        padding: 6px;
      }
      .tab {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border-radius: 12px;
        padding: 10px 16px;
        font-size: 14px;
        font-weight: 700;
        color: var(--v2-gris-texte);
        cursor: pointer;
        transition:
          background-color 0.16s ease,
          color 0.16s ease;
      }
      .tab:hover {
        color: var(--v2-encre);
        background: var(--v2-creme);
      }
      .tab.on {
        background: var(--v2-foret);
        color: var(--v2-citron);
      }
      .tab .n {
        border-radius: 999px;
        padding: 1px 8px;
        font-size: 12px;
        font-weight: 800;
        background: var(--v2-sauge);
        color: var(--v2-foret);
      }
      .tab.on .n {
        background: var(--v2-citron);
        color: var(--v2-foret);
      }
      .tab:focus-visible {
        outline: 2px solid var(--v2-foret);
        outline-offset: 2px;
      }
      .kv-row {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 16px;
        border-bottom: 1px solid var(--v2-separateur);
        padding: 13px 0;
      }
      .kv-row:last-child {
        border-bottom: 0;
        padding-bottom: 0;
      }
      .kv-row:first-child {
        padding-top: 0;
      }
      .kv-k {
        font-size: 13px;
        font-weight: 600;
        color: var(--v2-gris-texte);
      }
      .kv-v {
        text-align: right;
        font-size: 14px;
        font-weight: 700;
        color: var(--v2-encre);
        word-break: break-word;
      }
      .perm-pill {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        border-radius: 16px;
        border: 1.5px solid var(--v2-bord-carte);
        background: var(--v2-blanc);
        padding: 14px 16px;
      }
      .device-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        border-radius: 18px;
        border: 1.5px solid var(--v2-bord-carte);
        background: var(--v2-blanc);
        padding: 16px 20px;
      }
      .search-box {
        display: flex;
        align-items: center;
        gap: 10px;
        border-radius: 14px;
        border: 1.5px solid var(--v2-bord-carte);
        background: var(--v2-blanc);
        padding: 10px 14px;
      }
      .search-box:focus-within {
        border-color: var(--v2-foret);
      }
      .search-box input {
        width: 100%;
        border: 0;
        background: transparent;
        font-size: 14px;
        font-weight: 600;
        color: var(--v2-encre);
        outline: none;
      }
    `,
  ],
  template: `
    <app-shell perm="dashboard.read" [area]="t()('superadmin.profil.title')">
      <header class="rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <p class="mono inline-flex items-center gap-1.5" style="color: var(--v2-gris-texte)">
            <ui-icon [name]="canConfigureRoles() ? 'lock' : 'person'" [size]="14" />
            {{ canConfigureRoles() ? t()("superadmin.eyebrow") : t()("profil.eyebrow") }}
          </p>
          <h1 class="mt-2 text-[30px] font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-[38px]">
            {{ t()("superadmin.profil.title") }}
          </h1>
          <p class="mt-2 max-w-2xl text-[16px] font-medium" style="color: var(--v2-gris-texte)">
            {{ t()("superadmin.profil.description") }}
          </p>
        </div>
        @if (apiMode) {
          <button type="button" class="btn btn-ghost" [disabled]="loading()" (click)="reload(true)">
            <ui-icon name="refresh" [size]="18" [class.animate-spin]="loading()" />
            {{ loading() ? t()("superadmin.profil.refreshing") : t()("superadmin.profil.refresh") }}
          </button>
        }
      </header>

      @if (error()) {
        <div
          class="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border px-5 py-4"
          style="border-color: var(--v2-erreur-fg); background: var(--v2-erreur-bg); color: var(--v2-erreur-fg)"
          role="alert"
        >
          <div class="flex items-center gap-2.5 text-[14px] font-bold">
            <ui-icon name="warning" [size]="18" />
            <span>{{ error() }}</span>
          </div>
          <button type="button" class="btn btn-ghost" (click)="reload(false)">{{ t()("superadmin.profil.retry") }}</button>
        </div>
      }

      @if (profile(); as p) {
        <!-- Carte d'identité principale -->
        <section class="hero rise mt-6">
          <div class="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div class="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div class="avatar">
                @if (p.photoUrl) {
                  <img [src]="p.photoUrl" [alt]="p.name" />
                } @else {
                  {{ initialsOf(p.name) }}
                }
              </div>
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2.5">
                  <h2 class="truncate text-[22px] font-extrabold tracking-[-0.02em] sm:text-[26px]" style="color: var(--v2-encre)">
                    {{ p.name }}
                  </h2>
                  <span
                    class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold"
                    [style.background]="p.active ? TONE.succes.bg : TONE.erreur.bg"
                    [style.color]="p.active ? TONE.succes.fg : TONE.erreur.fg"
                  >
                    <ui-icon [name]="p.active ? 'check_circle' : 'warning'" [size]="14" />
                    {{ p.active ? t()("superadmin.profil.status.active") : t()("superadmin.profil.status.inactive") }}
                  </span>
                </div>
                <p class="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14.5px] font-medium" style="color: var(--v2-gris-texte)">
                  <span class="inline-flex items-center gap-1.5">
                    <ui-icon name="mail" [size]="15" />
                    {{ p.email }}
                  </span>
                  @if (p.phone) {
                    <span class="inline-flex items-center gap-1.5">
                      <ui-icon name="call" [size]="15" />
                      {{ p.phone }}
                    </span>
                  }
                </p>
                <div class="mt-3 flex flex-wrap gap-2">
                  <span
                    class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-extrabold"
                    style="background: var(--v2-foret); color: var(--v2-citron)"
                  >
                    <ui-icon name="admin_panel_settings" [size]="14" />
                    {{ store.roleLabel(p.role) }}
                  </span>
                  <span
                    class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold"
                    style="background: var(--v2-sauge); color: var(--v2-foret)"
                  >
                    <ui-icon name="hub" [size]="14" />
                    {{ scopeSummary() }}
                  </span>
                  <span
                    class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold"
                    style="background: var(--v2-creme); color: var(--v2-ardoise)"
                  >
                    <ui-icon name="lock" [size]="14" />
                    {{ apiMode ? t()("superadmin.profil.mode.api") : t()("superadmin.profil.mode.demo") }}
                  </span>
                </div>
              </div>
            </div>

            @if (canConfigureRoles()) {
              <div class="flex flex-wrap items-center gap-3">
                <a class="btn btn-primary" routerLink="/dashboard/super-admin/roles">
                  <ui-icon name="admin_panel_settings" [size]="18" />
                  <span>{{ t()("superadmin.profil.link.roles") }}</span>
                  <span class="btn-chip">
                    <ui-icon name="arrow_outward" [size]="16" />
                  </span>
                </a>
                <a class="btn btn-ghost" routerLink="/dashboard/super-admin/comptes">
                  <ui-icon name="manage_accounts" [size]="18" />
                  <span>{{ t()("superadmin.profil.link.accounts") }}</span>
                  <ui-icon name="arrow_outward" [size]="15" />
                </a>
              </div>
            }
          </div>
        </section>

        <!-- Chiffres clés -->
        <section class="rise mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          <div class="kpi-card">
            <p class="mono" style="color: var(--v2-gris-texte)">{{ t()("superadmin.profil.stat.perms") }}</p>
            <p class="kpi-val">{{ nf.format(p.permissions.length) }}</p>
            <p class="kpi-sub">{{ t()("superadmin.profil.field.roleLabel") }} · {{ store.roleLabel(p.role) }}</p>
          </div>
          <div class="kpi-card">
            <p class="mono" style="color: var(--v2-gris-texte)">{{ t()("superadmin.profil.stat.scope") }}</p>
            <p class="kpi-val">{{ p.isConsolidated ? t()("superadmin.profil.stat.scopeAll") : nf.format(p.scoopIds.length) }}</p>
            <p class="kpi-sub">
              {{
                p.isConsolidated
                  ? t()("superadmin.profil.stat.scopeAllSub")
                  : t()("superadmin.profil.stat.scopeCountSub", { count: p.scoopIds.length })
              }}
            </p>
          </div>
          <div class="kpi-card">
            <p class="mono" style="color: var(--v2-gris-texte)">{{ t()("superadmin.profil.stat.session") }}</p>
            <p class="kpi-val">{{ t()("superadmin.profil.stat.sessionActive") }}</p>
            <p class="kpi-sub">{{ t()("superadmin.profil.stat.sessionExp", { date: formatEpoch(p.expiresAt) }) }}</p>
          </div>
          <div class="kpi-card">
            <p class="mono" style="color: var(--v2-gris-texte)">
              {{ apiMode && canManageDevices() ? t()("superadmin.profil.stat.devices") : t()("superadmin.profil.stat.pages") }}
            </p>
            @if (apiMode && canManageDevices()) {
              <p class="kpi-val">{{ nf.format(myDevices().length) }}</p>
              <p class="kpi-sub">{{ t()("superadmin.profil.stat.devicesSub", { active: activeDeviceCount() }) }}</p>
            } @else {
              <p class="kpi-val">{{ p.allowedPages ? nf.format(p.allowedPages.length) : t()("superadmin.profil.stat.pagesAll") }}</p>
              <p class="kpi-sub">{{ t()("superadmin.profil.stat.pagesAllSub") }}</p>
            }
          </div>
        </section>

        <!-- Onglets -->
        <nav class="tabs rise mt-6" role="tablist">
          <button
            type="button"
            role="tab"
            class="tab"
            [class.on]="tab() === 'info'"
            [attr.aria-selected]="tab() === 'info'"
            (click)="tab.set('info')"
          >
            <ui-icon name="person" [size]="16" />
            <span>{{ t()("superadmin.profil.tab.info") }}</span>
          </button>
          <button
            type="button"
            role="tab"
            class="tab"
            [class.on]="tab() === 'permissions'"
            [attr.aria-selected]="tab() === 'permissions'"
            (click)="tab.set('permissions')"
          >
            <ui-icon name="verified" [size]="16" />
            <span>{{ t()("superadmin.profil.tab.permissions") }}</span>
            <span class="n">{{ nf.format(p.permissions.length) }}</span>
          </button>
          @if (apiMode && canManageDevices()) {
            <button
              type="button"
              role="tab"
              class="tab"
              [class.on]="tab() === 'devices'"
              [attr.aria-selected]="tab() === 'devices'"
              (click)="tab.set('devices')"
            >
              <ui-icon name="devices" [size]="16" />
              <span>{{ t()("superadmin.profil.tab.devices") }}</span>
              <span class="n">{{ nf.format(myDevices().length) }}</span>
            </button>
          }
        </nav>

        <!-- Contenu de l'onglet actif -->
        @if (tab() === "info") {
          <div class="rise mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section class="card p-6">
              <div class="mb-4 flex items-center gap-2.5">
                <span class="grid size-9 place-items-center rounded-[12px]" style="background: var(--v2-sauge); color: var(--v2-foret)">
                  <ui-icon name="person" [size]="18" />
                </span>
                <h3 class="text-[17px] font-extrabold tracking-[-0.01em]">{{ t()("superadmin.profil.card.identity") }}</h3>
              </div>
              <div>
                <div class="kv-row">
                  <span class="kv-k">{{ t()("superadmin.profil.field.name") }}</span>
                  <span class="kv-v">{{ p.name }}</span>
                </div>
                <div class="kv-row">
                  <span class="kv-k">{{ t()("superadmin.profil.field.email") }}</span>
                  <span class="kv-v">{{ p.email }}</span>
                </div>
                <div class="kv-row">
                  <span class="kv-k">{{ t()("superadmin.profil.field.phone") }}</span>
                  <span class="kv-v">{{ p.phone || t()("superadmin.profil.notSet") }}</span>
                </div>
                <div class="kv-row">
                  <span class="kv-k">{{ t()("superadmin.profil.field.status") }}</span>
                  <span class="kv-v">{{ p.active ? t()("superadmin.profil.status.active") : t()("superadmin.profil.status.inactive") }}</span>
                </div>
              </div>
            </section>

            <section class="card p-6">
              <div class="mb-4 flex items-center gap-2.5">
                <span class="grid size-9 place-items-center rounded-[12px]" style="background: var(--v2-sauge); color: var(--v2-foret)">
                  <ui-icon name="admin_panel_settings" [size]="18" />
                </span>
                <h3 class="text-[17px] font-extrabold tracking-[-0.01em]">{{ t()("superadmin.profil.card.role") }}</h3>
              </div>
              <div>
                <div class="kv-row">
                  <span class="kv-k">{{ t()("superadmin.profil.field.roleLabel") }}</span>
                  <span class="kv-v">{{ store.roleLabel(p.role) }}</span>
                </div>
                <div class="kv-row">
                  <span class="kv-k">{{ t()("superadmin.profil.field.roleId") }}</span>
                  <span class="kv-v mono">{{ p.role }}</span>
                </div>
                <div class="kv-row">
                  <span class="kv-k">{{ t()("superadmin.profil.field.scope") }}</span>
                  <span class="kv-v">{{ scopeSummary() }}</span>
                </div>
                <div class="kv-row">
                  <span class="kv-k">{{ t()("superadmin.profil.field.pages") }}</span>
                  <span class="kv-v">
                    {{
                      p.allowedPages
                        ? t()("superadmin.profil.field.pagesCustom", { count: p.allowedPages.length })
                        : t()("superadmin.profil.field.pagesAll")
                    }}
                  </span>
                </div>
              </div>
            </section>

            <section class="card p-6 lg:col-span-2">
              <div class="mb-4 flex items-center gap-2.5">
                <span class="grid size-9 place-items-center rounded-[12px]" style="background: var(--v2-sauge); color: var(--v2-foret)">
                  <ui-icon name="lock" [size]="18" />
                </span>
                <h3 class="text-[17px] font-extrabold tracking-[-0.01em]">{{ t()("superadmin.profil.card.session") }}</h3>
              </div>
              <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div class="rounded-[16px] p-4" style="background: var(--v2-creme)">
                  <p class="mono" style="color: var(--v2-ardoise)">{{ t()("superadmin.profil.field.mode") }}</p>
                  <p class="mt-1.5 text-[15px] font-extrabold">{{ apiMode ? t()("superadmin.profil.mode.api") : t()("superadmin.profil.mode.demo") }}</p>
                </div>
                <div class="rounded-[16px] p-4" style="background: var(--v2-creme)">
                  <p class="mono" style="color: var(--v2-ardoise)">{{ t()("superadmin.profil.field.authMethod") }}</p>
                  <p class="mt-1.5 text-[15px] font-extrabold">{{ t()("superadmin.profil.field.authMethodVal") }}</p>
                </div>
                <div class="rounded-[16px] p-4" style="background: var(--v2-creme)">
                  <p class="mono" style="color: var(--v2-ardoise)">{{ t()("superadmin.profil.field.expires") }}</p>
                  <p class="mt-1.5 text-[15px] font-extrabold">{{ formatEpoch(p.expiresAt) }}</p>
                </div>
              </div>
            </section>
          </div>
        } @else if (tab() === "permissions") {
          <section class="rise mt-5">
            <div class="search-box max-w-md">
              <ui-icon name="search" [size]="18" style="color: var(--v2-gris-texte)" />
              <input
                type="search"
                [value]="permQuery()"
                (input)="permQuery.set($any($event.target).value)"
                [placeholder]="t()('superadmin.profil.permsSearch')"
              />
            </div>

            @if (filteredPermissions().length === 0) {
              <div class="mt-4">
                <ui-empty-state icon="verified" [title]="t()('superadmin.profil.permsEmpty')" />
              </div>
            } @else {
              <div class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                @for (item of filteredPermissions(); track item.code) {
                  <div class="perm-pill">
                    <span class="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full" [style.background]="TONE.succes.bg" [style.color]="TONE.succes.fg">
                      <ui-icon name="check" [size]="15" />
                    </span>
                    <div class="min-w-0">
                      <p class="text-[14px] font-bold leading-snug" style="color: var(--v2-encre)">{{ item.label }}</p>
                      <p class="mono mt-1 text-[11.5px]" style="color: var(--v2-gris-texte)">{{ item.code }}</p>
                    </div>
                  </div>
                }
              </div>
            }
          </section>
        } @else if (tab() === "devices") {
          <section class="rise mt-5">
            @if (myDevices().length === 0) {
              <ui-empty-state
                icon="devices"
                [title]="t()('superadmin.profil.devicesEmptyTitle')"
                [description]="t()('superadmin.profil.devicesEmptyDesc')"
              />
            } @else {
              <div class="grid gap-3">
                @for (device of myDevices(); track device.id) {
                  <div class="device-row">
                    <div class="flex items-center gap-3.5">
                      <span class="grid size-11 place-items-center rounded-[14px]" style="background: var(--v2-sauge); color: var(--v2-foret)">
                        <ui-icon name="devices" [size]="20" />
                      </span>
                      <div>
                        <p class="text-[15px] font-extrabold" style="color: var(--v2-encre)">{{ device.label }}</p>
                        <p class="text-[13px] font-medium" style="color: var(--v2-gris-texte)">
                          {{ device.platform }} · v{{ device.appVersion }} ·
                          {{ t()("superadmin.profil.device.lastSeen", { date: fmtDateTime(device.lastActiveAt) }) }}
                        </p>
                      </div>
                    </div>
                    <span
                      class="rounded-full px-3 py-1 text-[12px] font-bold"
                      [style.background]="device.active ? TONE.succes.bg : TONE.erreur.bg"
                      [style.color]="device.active ? TONE.succes.fg : TONE.erreur.fg"
                    >
                      {{ device.active ? t()("superadmin.profil.device.active") : t()("superadmin.profil.device.revoked") }}
                    </span>
                  </div>
                }
              </div>
            }
          </section>
        }
      }
    </app-shell>
  `,
})
export default class SuperAdminProfilPage {
  protected readonly store = inject(StoreService);
  protected readonly t = inject(LocaleService).t;
  private readonly snackbar = inject(SnackbarService);

  protected readonly apiMode = isApiMode();
  protected readonly TONE = TONE;
  protected readonly nf = nf;
  protected readonly fmtDateTime = fmtDateTime;
  protected readonly initialsOf = initialsOf;

  protected readonly tab = signal<ProfileTab>("info");
  protected readonly permQuery = signal("");
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly meData = signal<MeResponse | null>(null);
  private readonly userDetail = signal<ApiUser | null>(null);
  private readonly devices = signal<ApiDevice[]>([]);

  protected readonly profile = computed(() => {
    const session = this.store.state().session;
    if (!session) return null;

    const me = this.meData();
    const apiUser = this.userDetail();
    const localUser = this.store.state().users.find((u) => u.email.toLowerCase() === session.email.toLowerCase());

    const scoopIds: string[] =
      me?.scoopIds && me.scoopIds.length > 0
        ? me.scoopIds
        : me?.scoopId
          ? [me.scoopId]
          : session.scope.kind === "scoop"
            ? (session.scope.scoopIds ?? [])
            : [];

    return {
      id: me?.id ?? apiUser?.id ?? localUser?.id ?? "",
      name: me?.name ?? session.name,
      email: me?.email ?? session.email,
      phone: apiUser?.phone ?? localUser?.phone ?? null,
      photoUrl: apiUser?.photoUrl ?? null,
      active: apiUser?.active ?? localUser?.active ?? true,
      role: me?.role ?? session.role,
      permissions: me?.permissions ?? session.permissions,
      allowedPages: me?.allowedPages !== undefined ? me.allowedPages : session.allowedPages,
      isConsolidated: session.scope.kind === "consolidé",
      scoopIds,
      expiresAt: session.expiresAt,
    };
  });

  protected readonly scopeSummary = computed(() => {
    const p = this.profile();
    if (!p) return "";
    if (p.isConsolidated) return this.t()("superadmin.profil.stat.scopeAll");
    const scoops = this.store.state().scoops;
    const names = p.scoopIds.map((id) => scoops.find((s) => s.id === id)?.name ?? id);
    return names.length > 0 ? names.join(", ") : this.t()("superadmin.profil.stat.scopeCountSub", { count: p.scoopIds.length });
  });

  protected readonly filteredPermissions = computed(() => {
    const p = this.profile();
    if (!p) return [];
    const q = this.permQuery().trim().toLowerCase();
    const translate = this.t();
    return p.permissions
      .map((code: Permission) => {
        const key = `perm.${code}` as MessageKey;
        const translated = translate(key);
        return {
          code,
          label: translated === key ? code : translated,
        };
      })
      .filter((item) => !q || item.label.toLowerCase().includes(q) || item.code.toLowerCase().includes(q));
  });

  protected readonly myDevices = computed(() => {
    const meId = this.meData()?.id ?? this.userDetail()?.id;
    if (!meId) return [];
    return this.devices().filter((d) => d.userId === meId);
  });

  protected readonly activeDeviceCount = computed(() => this.myDevices().filter((d) => d.active).length);

  protected readonly canConfigureRoles = computed(
    () => this.profile()?.permissions.includes("role.configure") ?? false,
  );

  protected readonly canManageDevices = computed(
    () => this.profile()?.permissions.includes("device.manage") ?? false,
  );

  protected formatEpoch(epochMs: number): string {
    return fmtDateTime(new Date(epochMs).toISOString());
  }

  constructor() {
    if (this.apiMode) {
      void this.reload(false);
    }
  }

  protected async reload(notify: boolean) {
    if (!this.apiMode) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const me = await fetchMe();
      this.meData.set(me);

      const tasks: Promise<void>[] = [];
      if (me.permissions?.includes("user.manage") || this.store.state().session?.permissions.includes("user.manage")) {
        tasks.push(
          fetchAllPages((query) => listUsers(query))
            .then((users) => {
              const found = users.find((u) => u.id === me.id || u.email.toLowerCase() === me.email.toLowerCase()) ?? null;
              this.userDetail.set(found);
            })
            .catch(() => {
              /* Détails complémentaires facultatifs si l'utilisateur n'a pas accès à la liste complète. */
            }),
        );
      }
      if (me.permissions?.includes("device.manage") || this.store.state().session?.permissions.includes("device.manage")) {
        tasks.push(
          fetchDevices()
            .then((overview) => {
              this.devices.set(overview.devices);
            })
            .catch(() => {
              /* Liste des appareils facultative selon les droits effectifs. */
            }),
        );
      }
      await Promise.all(tasks);
      if (notify) {
        this.snackbar.show("success", this.t()("superadmin.profil.refreshed"));
      }
    } catch {
      this.error.set(this.t()("superadmin.profil.loadError"));
    } finally {
      this.loading.set(false);
    }
  }
}
