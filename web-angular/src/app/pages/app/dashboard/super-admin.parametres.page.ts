import { Component, computed, effect, inject, signal } from "@angular/core";
import { DomSanitizer, type SafeHtml } from "@angular/platform-browser";

import {
  brandingApiError,
  fetchMailPreview,
  MAIL_SAMPLE_TYPES,
  resetBrandLogo,
  sendMailTest,
  uploadBrandLogo,
  type LogoVariant,
  type MailSampleType,
} from "@/lib/api/branding";
import { isApiMode } from "@/lib/api/config";
import { fmtDateTime } from "@/lib/format";
import type { MessageKey } from "@/lib/i18n";
import { AppShellComponent } from "@shared/app-shell.component";
import { BrandingService } from "@shared/branding.service";
import { LocaleService } from "@shared/locale.service";
import { BrandLogoComponent, IconComponent, SnackbarService, V2_PAGE_STYLES } from "@shared/ui";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

const SAMPLE_LABEL: Record<MailSampleType, MessageKey> = {
  invitation: "settings.mail.sample.invitation",
  meeting: "settings.mail.sample.meeting",
  cancelled: "settings.mail.sample.cancelled",
  login: "settings.mail.sample.login",
  technician: "settings.mail.sample.technician",
};

/**
 * Super administration › Réglages de la plateforme (charte V2) : le logo de toute la plateforme (site, application,
 * e-mails) et l'aperçu du modèle unique des e-mails, avec envoi d'un e-mail de test. Réservé au droit `role.configure`.
 */
@Component({
  selector: "app-super-admin-parametres-page",
  imports: [AppShellComponent, BrandLogoComponent, IconComponent],
  styles: [
    V2_PAGE_STYLES,
    `
      .tile {
        display: flex;
        flex-direction: column;
        border-radius: 22px;
        border: 1.5px solid var(--v2-bord-carte);
        background: var(--v2-blanc);
        overflow: hidden;
      }
      .stage {
        display: grid;
        min-height: 150px;
        place-items: center;
        padding: 28px 20px;
      }
      .stage.light {
        background:
          radial-gradient(circle at 20% 20%, var(--v2-sauge) 0, transparent 55%),
          var(--v2-creme);
      }
      .stage.dark {
        background:
          radial-gradient(circle at 80% 10%, color-mix(in oklab, var(--v2-citron) 18%, transparent) 0, transparent 50%),
          var(--v2-foret);
      }
      .lbl {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--v2-ardoise);
      }
      .seg-mail {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .seg-mail button {
        border-radius: 999px;
        border: 1.5px solid var(--v2-gris-trait);
        background: var(--v2-blanc);
        padding: 8px 14px;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
      }
      .seg-mail button:hover {
        border-color: var(--v2-foret);
      }
      .seg-mail button.on {
        border-color: var(--v2-foret);
        background: var(--v2-foret);
        color: var(--v2-blanc);
      }
      .seg-mail button:focus-visible {
        outline: 2px solid var(--v2-foret);
        outline-offset: 2px;
      }
      .mailbox {
        border-radius: 22px;
        border: 1.5px solid var(--v2-bord-carte);
        background: var(--v2-creme);
        overflow: hidden;
      }
      .mailbox-head {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px;
        border-bottom: 1.5px solid var(--v2-bord-carte);
        background: var(--v2-blanc);
        padding: 14px 18px;
      }
      .dot {
        height: 11px;
        width: 11px;
        border-radius: 99px;
      }
      iframe {
        display: block;
        width: 100%;
        height: 760px;
        border: 0;
        background: var(--v2-creme);
      }
      .file-input {
        position: absolute;
        width: 1px;
        height: 1px;
        opacity: 0;
        pointer-events: none;
      }
    `,
  ],
  template: `
    <app-shell perm="role.configure" [area]="t()('settings.title')">
      <header class="rise">
        <p class="mono inline-flex items-center gap-1.5" style="color: var(--v2-gris-texte)"><ui-icon name="lock" [size]="14" />{{ t()("superadmin.eyebrow") }}</p>
        <h1 class="mt-2 text-[30px] font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-[38px]">{{ t()("settings.title") }}</h1>
        <p class="mt-2 max-w-2xl text-[16px] font-medium" style="color: var(--v2-gris-texte)">{{ t()("settings.description") }}</p>
      </header>

      @if (!apiMode) {
        <p class="notice mt-6"><ui-icon name="info" [size]="18" />{{ t()("settings.demo") }}</p>
      }

      <!-- ───── Identité visuelle ───── -->
      <section class="card rise mt-8 p-5 sm:p-6">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 class="text-[20px] font-extrabold tracking-[-0.02em]">{{ t()("settings.logo.title") }}</h2>
            <p class="sub mt-1 max-w-2xl">{{ t()("settings.logo.description") }}</p>
          </div>
          @if (lastChange(); as change) {
            <p class="sub text-[13px]">{{ t()("settings.logo.lastChange", { date: change.date, by: change.by }) }}</p>
          }
        </div>

        <div class="mt-5 grid gap-4 lg:grid-cols-2">
          @for (tile of tiles; track tile.variant) {
            <article class="tile">
              <div class="stage" [class.light]="tile.variant === 'color'" [class.dark]="tile.variant === 'inverse'">
                <ui-brand-logo [variant]="tile.variant" [size]="64" />
              </div>
              <div class="flex flex-1 flex-col gap-3 p-5">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <p class="text-[16px] font-extrabold">{{ t()(tile.title) }}</p>
                  <span class="badge" [style.background]="isCustom(tile.variant) ? 'var(--v2-sauge)' : 'var(--v2-lin)'" [style.color]="isCustom(tile.variant) ? 'var(--v2-foret)' : 'var(--v2-gris-texte)'">
                    {{ isCustom(tile.variant) ? t()("settings.logo.custom") : t()("settings.logo.default") }}
                  </span>
                </div>
                <p class="sub">{{ t()(tile.usage) }}</p>
                <div class="mt-auto flex flex-wrap gap-2 pt-2">
                  <label class="btn btn-primary" [class.opacity-50]="!apiMode || busy() === tile.variant" [attr.aria-disabled]="!apiMode || busy() === tile.variant">
                    <input class="file-input" type="file" accept="image/png,image/jpeg" [disabled]="!apiMode || !!busy()" (change)="onFile(tile.variant, $event)" />
                    {{ busy() === tile.variant ? t()("settings.logo.uploading") : t()("settings.logo.replace") }}
                    <span class="btn-chip"><ui-icon name="upload" [size]="18" /></span>
                  </label>
                  @if (isCustom(tile.variant)) {
                    <button type="button" class="btn btn-ghost" [disabled]="!!busy()" (click)="reset(tile.variant)"><ui-icon name="undo" [size]="18" />{{ t()("settings.logo.reset") }}</button>
                  }
                </div>
              </div>
            </article>
          }
        </div>
        <p class="notice mt-4"><ui-icon name="info" [size]="18" />{{ t()("settings.logo.rules") }}</p>
      </section>

      <!-- ───── Modèle des e-mails ───── -->
      <section class="card rise mt-6 p-5 sm:p-6">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 class="text-[20px] font-extrabold tracking-[-0.02em]">{{ t()("settings.mail.title") }}</h2>
            <p class="sub mt-1 max-w-2xl">{{ t()("settings.mail.description") }}</p>
          </div>
          <button type="button" class="btn btn-primary ml-auto" [disabled]="!apiMode || sending()" (click)="sendTest()">
            {{ sending() ? t()("settings.mail.sending") : t()("settings.mail.test") }}<span class="btn-chip"><ui-icon name="mail" [size]="18" /></span>
          </button>
        </div>

        <div class="seg-mail mt-5" role="radiogroup" [attr.aria-label]="t()('settings.mail.choose')">
          @for (type of sampleTypes; track type) {
            <button type="button" role="radio" [class.on]="sample() === type" [attr.aria-checked]="sample() === type" (click)="sample.set(type)">{{ t()(sampleLabel[type]) }}</button>
          }
        </div>

        <div class="mailbox mt-4">
          <div class="mailbox-head">
            <span class="dot" style="background: #f2685c"></span><span class="dot" style="background: #f5bf4f"></span><span class="dot" style="background: #62c554"></span>
            <span class="ml-2 min-w-0 flex-1 truncate text-[14px] font-bold">{{ previewSubject() || t()("settings.mail.loading") }}</span>
          </div>
          @if (previewHtml(); as html) {
            <iframe [srcdoc]="html" sandbox="" [title]="t()('settings.mail.previewTitle')"></iframe>
          } @else {
            <p class="sub p-10 text-center">{{ apiMode ? t()("settings.mail.loading") : t()("settings.demo") }}</p>
          }
        </div>
      </section>
    </app-shell>
  `,
})
export default class SuperAdminParametresPage {
  protected readonly locale = inject(LocaleService);
  protected readonly t = this.locale.t;
  private readonly branding = inject(BrandingService);
  private readonly snackbar = inject(SnackbarService);

  protected readonly apiMode = isApiMode();
  protected readonly sampleTypes = MAIL_SAMPLE_TYPES;
  protected readonly sampleLabel = SAMPLE_LABEL;
  protected readonly tiles: { variant: LogoVariant; title: MessageKey; usage: MessageKey }[] = [
    { variant: "color", title: "settings.logo.color", usage: "settings.logo.colorUsage" },
    { variant: "inverse", title: "settings.logo.inverse", usage: "settings.logo.inverseUsage" },
  ];

  protected readonly busy = signal<LogoVariant | null>(null);
  protected readonly sending = signal(false);
  protected readonly sample = signal<MailSampleType>("invitation");
  /** HTML de l'aperçu : affiché dans un cadre isolé (`sandbox` sans script), ses styles en ligne doivent être gardés. */
  protected readonly previewHtml = signal<SafeHtml | null>(null);
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly previewSubject = signal("");

  protected readonly lastChange = computed(() => {
    const value = this.branding.branding();
    return value?.updatedAt ? { date: fmtDateTime(value.updatedAt), by: value.updatedBy ?? "" } : null;
  });

  constructor() {
    // Aperçu de l'e-mail choisi ; relu aussi après un changement de logo (le logo y figure).
    effect(() => {
      const type = this.sample();
      this.branding.branding();
      if (this.apiMode) void this.loadPreview(type);
    });
  }

  protected isCustom(variant: LogoVariant): boolean {
    const value = this.branding.branding();
    return variant === "color" ? !!value?.custom.color : !!value?.custom.inverse;
  }

  private async loadPreview(type: MailSampleType): Promise<void> {
    try {
      const preview = await fetchMailPreview(type);
      if (this.sample() !== type) return;
      this.previewSubject.set(preview.subject);
      this.previewHtml.set(this.sanitizer.bypassSecurityTrustHtml(preview.html));
    } catch (error) {
      this.snackbar.error(this.t()(brandingApiError(error)));
    }
  }

  protected async onFile(variant: LogoVariant, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      this.snackbar.error(this.t()("settings.err.format"));
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      this.snackbar.error(this.t()("settings.err.size"));
      return;
    }
    this.busy.set(variant);
    try {
      this.branding.apply(await uploadBrandLogo(variant, file));
      this.snackbar.success(this.t()("settings.logo.saved"));
    } catch (error) {
      this.snackbar.error(this.t()(brandingApiError(error)));
    } finally {
      this.busy.set(null);
    }
  }

  protected async reset(variant: LogoVariant): Promise<void> {
    this.busy.set(variant);
    try {
      this.branding.apply(await resetBrandLogo(variant));
      this.snackbar.success(this.t()("settings.logo.restored"));
    } catch (error) {
      this.snackbar.error(this.t()(brandingApiError(error)));
    } finally {
      this.busy.set(null);
    }
  }

  protected async sendTest(): Promise<void> {
    this.sending.set(true);
    try {
      const result = await sendMailTest(this.sample());
      this.snackbar.success(this.t()("settings.mail.sent", { email: result.to }));
    } catch (error) {
      this.snackbar.error(this.t()(brandingApiError(error)));
    } finally {
      this.sending.set(false);
    }
  }
}
