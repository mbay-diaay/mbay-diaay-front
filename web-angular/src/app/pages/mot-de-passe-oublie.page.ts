import { Component, DestroyRef, computed, inject, signal } from "@angular/core";
import { ArrowLeft, ArrowRight, CircleAlert, Loader2, LucideAngularModule, RotateCw, ShieldCheck } from "lucide-angular";
import { Router, RouterLink } from "@angular/router";

import { authErrorMessage } from "@/lib/auth/messages";
import { OTP_LENGTH, OTP_TTL_MS, isPasswordValid, normalizeEmail } from "@/lib/auth/policy";
import type { CodeSent } from "@/lib/auth/types";
import { AUTH_FORM_STYLES } from "@shared/auth-form.styles";
import { AuthFieldComponent } from "@shared/auth-field.component";
import { AuthPasswordRulesComponent } from "@shared/auth-password-rules.component";
import { AuthShellComponent } from "@shared/auth-shell.component";
import { AuthService } from "@shared/auth.service";
import { OtpInputComponent } from "@shared/otp-input.component";
import { LocaleService } from "@shared/locale.service";

type Step =
  | { name: "email" }
  | { name: "code"; email: string; sent: CodeSent }
  | { name: "password"; email: string; resetToken: string };

/**
 * Réinitialisation en
 * trois étapes via AuthService (démo ou API).
 */
@Component({
  selector: "app-mot-de-passe-oublie-page",
  imports: [
    RouterLink,
    LucideAngularModule,
    AuthShellComponent,
    AuthFieldComponent,
    AuthPasswordRulesComponent,
    OtpInputComponent,
  ],
  styles: AUTH_FORM_STYLES,
  template: `
    <app-auth-shell>
      <span
        class="mono inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5"
        style="background: var(--v2-sauge); color: var(--v2-foret)"
      >
        <lucide-angular [img]="icons.shield" [size]="14" />
        {{ t()("auth.step.progress", { current: stepNumber(), total: "03" }) }}
      </span>
      <div class="mt-3 flex max-w-[260px] gap-1.5" aria-hidden="true">
        @for (index of [1, 2, 3]; track index) {
          <span
            class="h-1 flex-1 rounded-full transition-colors"
            [style.background]="index <= stepIndex() ? 'var(--v2-foret)' : 'var(--v2-lin)'"
          ></span>
        }
      </div>

      @switch (step().name) {
        @case ("email") {
          <h1 class="mt-7 text-[32px] font-extrabold leading-[1.05] tracking-[-0.03em] lg:text-[40px]">
            {{ t()("auth.forgot.title") }}
          </h1>
          <p class="mt-3 text-base font-medium" style="color: var(--v2-gris-texte)">
            {{ t()("auth.forgot.description") }}
          </p>
          <form class="mt-8 space-y-5" novalidate (submit)="$event.preventDefault(); submitEmail()">
            <app-auth-field
              id="email"
              kind="email"
              autocomplete="username"
              [label]="t()('auth.login.email')"
              [placeholder]="t()('auth.login.emailPlaceholder')"
              [(value)]="email"
            />
            @if (error()) {
              <div role="alert" class="alert"><lucide-angular [img]="icons.alert" [size]="20" />{{ error() }}</div>
            }
            <button type="submit" class="btn-primary !mt-7" [disabled]="busy()">
              <span>{{ busy() ? t()("auth.forgot.sending") : t()("auth.forgot.send") }}</span>
              <span class="btn-chip" aria-hidden="true">
                <lucide-angular [img]="busy() ? icons.loader : icons.arrowRight" [size]="22" [class.animate-spin]="busy()" />
              </span>
            </button>
          </form>
        }
        @case ("code") {
          <h1 class="mt-7 text-[32px] font-extrabold leading-[1.05] tracking-[-0.03em] lg:text-[40px]">
            {{ t()("auth.forgot.codeTitle") }}
          </h1>
          <p class="mt-3 text-base font-medium" style="color: var(--v2-gris-texte)">
            {{ t()("auth.otp.sent", { length: OTP_LENGTH, email: sentInfo()?.maskedEmail ?? "", minutes: otpMinutes }) }}
          </p>
          <form class="mt-8 space-y-5" (submit)="$event.preventDefault(); submitCode()">
            <div class="space-y-2.5">
              <label id="otp-label" for="otp" class="label">{{ t()("auth.otp.code") }}</label>
              <app-otp-input
                fieldId="otp"
                labelledBy="otp-label"
                [value]="code()"
                [disabled]="busy()"
                (valueChange)="code.set($event)"
                (complete)="submitCode()"
              />
            </div>
            @if (error()) {
              <div role="alert" class="alert"><lucide-angular [img]="icons.alert" [size]="20" />{{ error() }}</div>
            }
            @if (demoMail(); as mail) {
              <div role="status" class="note">
                <span>
                  <span class="mono block" style="color: var(--v2-gris-texte)">{{ t()("auth.mail.title") }}</span>
                  <span class="mt-1 block font-medium">
                    {{ t()("auth.mail.line", { to: mail.to }) }} {{ t()("auth.mail.code") }}
                    <span class="font-bold tracking-[0.2em]" style="font-family: var(--v2-font-mono)">{{ mail.code }}</span>
                  </span>
                </span>
              </div>
            }
            <button type="submit" class="btn-primary" [disabled]="busy() || code().length < OTP_LENGTH">
              <span>{{ busy() ? t()("auth.otp.verifying") : t()("auth.forgot.validate") }}</span>
              <span class="btn-chip" aria-hidden="true">
                <lucide-angular [img]="busy() ? icons.loader : icons.arrowRight" [size]="22" [class.animate-spin]="busy()" />
              </span>
            </button>
            <div class="flex flex-wrap items-center justify-between gap-3 text-[15px]">
              <button
                type="button"
                class="link inline-flex items-center gap-1.5 disabled:no-underline disabled:opacity-60"
                [disabled]="busy() || resendWait() > 0"
                (click)="resend()"
              >
                <lucide-angular [img]="icons.resend" [size]="16" />
                {{ resendWait() > 0 ? t()("auth.otp.resendIn", { seconds: resendWait() }) : t()("auth.otp.resend") }}
              </button>
              <button type="button" class="ghost inline-flex items-center gap-1.5 font-semibold" style="color: var(--v2-gris-texte)" (click)="backToEmail()">
                <lucide-angular [img]="icons.arrowLeft" [size]="16" />{{ t()("auth.otp.back") }}
              </button>
            </div>
          </form>
        }
        @case ("password") {
          <h1 class="mt-7 text-[32px] font-extrabold leading-[1.05] tracking-[-0.03em] lg:text-[40px]">
            {{ t()("auth.forgot.newTitle") }}
          </h1>
          <p class="mt-3 text-base font-medium" style="color: var(--v2-gris-texte)">
            {{ t()("auth.forgot.newDescription") }}
          </p>
          <form class="mt-8 space-y-5" novalidate (submit)="$event.preventDefault(); submitPassword()">
            <app-auth-field
              id="pw1"
              kind="password"
              autocomplete="new-password"
              [label]="t()('auth.forgot.newPassword')"
              [(value)]="password"
            />
            <app-auth-password-rules [password]="password()" [email]="resetEmail()" />
            <app-auth-field
              id="pw2"
              kind="password"
              autocomplete="new-password"
              [label]="t()('auth.forgot.confirm')"
              [invalid]="mismatch()"
              [(value)]="confirm"
            />
            @if (mismatch()) {
              <div role="alert" class="alert"><lucide-angular [img]="icons.alert" [size]="20" />{{ t()("auth.forgot.mismatch") }}</div>
            } @else if (error()) {
              <div role="alert" class="alert"><lucide-angular [img]="icons.alert" [size]="20" />{{ error() }}</div>
            }
            <button type="submit" class="btn-primary !mt-7" [disabled]="busy() || !canSubmitPassword()">
              <span>{{ busy() ? t()("auth.forgot.saving") : t()("auth.forgot.save") }}</span>
              <span class="btn-chip" aria-hidden="true">
                <lucide-angular [img]="busy() ? icons.loader : icons.arrowRight" [size]="22" [class.animate-spin]="busy()" />
              </span>
            </button>
          </form>
        }
      }

      <p class="mt-8 text-[15px]">
        <a routerLink="/login" class="link inline-flex items-center gap-1.5">
          <lucide-angular [img]="icons.arrowLeft" [size]="16" />{{ t()("auth.forgot.back") }}
        </a>
      </p>
    </app-auth-shell>
  `,
})
export default class MotDePasseOubliePage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly locale = inject(LocaleService);
  protected readonly t = this.locale.t;
  protected readonly OTP_LENGTH = OTP_LENGTH;
  protected readonly otpMinutes = Math.round(OTP_TTL_MS / 60000);

  protected readonly icons = {
    alert: CircleAlert,
    arrowLeft: ArrowLeft,
    arrowRight: ArrowRight,
    loader: Loader2,
    resend: RotateCw,
    shield: ShieldCheck,
  };

  protected readonly step = signal<Step>({ name: "email" });
  /** 1, 2 ou 3 : position dans les trois étapes (adresse, code, nouveau mot de passe). */
  protected readonly stepIndex = computed(() => ({ email: 1, code: 2, password: 3 })[this.step().name]);
  protected readonly stepNumber = computed(() => `0${this.stepIndex()}`);
  /** Adresse du compte en cours de réinitialisation (sert à refuser un mot de passe qui la reprend). */
  protected readonly resetEmail = computed(() => {
    const current = this.step();
    return current.name === "email" ? "" : current.email;
  });
  protected readonly email = signal("");
  protected readonly code = signal("");
  protected readonly password = signal("");
  protected readonly confirm = signal("");
  protected readonly error = signal("");
  protected readonly busy = signal(false);
  private readonly now = signal(Date.now());

  protected readonly sentInfo = computed(() => {
    const s = this.step();
    return s.name === "code" ? s.sent : null;
  });
  protected readonly resendWait = computed(() => {
    const sent = this.sentInfo();
    if (!sent) return 0;
    this.now();
    return Math.max(0, Math.ceil((sent.resendAvailableAt - Date.now()) / 1000));
  });
  protected readonly demoMail = signal(this.auth.mailbox.latest());

  constructor() {
    const tick = setInterval(() => this.now.set(Date.now()), 500);
    this.destroyRef.onDestroy(() => clearInterval(tick));
    const unsub = this.auth.mailbox.subscribe(() => {
      this.demoMail.set(this.auth.mailbox.latest());
    });
    this.destroyRef.onDestroy(unsub);
  }

  protected inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected onCodeInput(event: Event): void {
    const v = this.inputValue(event).replace(/\D/g, "").slice(0, OTP_LENGTH);
    this.code.set(v);
  }

  protected mismatch(): boolean {
    return this.confirm().length > 0 && this.confirm() !== this.password();
  }

  protected canSubmitPassword(): boolean {
    const s = this.step();
    if (s.name !== "password") return false;
    return isPasswordValid(this.password(), s.email) && this.confirm() === this.password();
  }

  protected async submitEmail(): Promise<void> {
    const normalized = normalizeEmail(this.email());
    if (!normalized) {
      this.error.set(this.t()("auth.login.errorEmail"));
      return;
    }
    this.busy.set(true);
    this.error.set("");
    try {
      const sent = await this.auth.requestPasswordReset(normalized);
      this.step.set({ name: "code", email: normalized, sent });
      this.code.set("");
    } catch (e) {
      this.error.set(authErrorMessage(e, this.t()));
    } finally {
      this.busy.set(false);
    }
  }

  protected async submitCode(): Promise<void> {
    const s = this.step();
    if (s.name !== "code") return;
    const raw = this.code();
    if (raw.length < OTP_LENGTH) return;
    this.busy.set(true);
    this.error.set("");
    try {
      const { resetToken } = await this.auth.verifyResetCode(s.email, raw);
      this.step.set({ name: "password", email: s.email, resetToken });
      this.password.set("");
      this.confirm.set("");
    } catch (e) {
      this.error.set(authErrorMessage(e, this.t()));
      this.code.set("");
    } finally {
      this.busy.set(false);
    }
  }

  protected async resend(): Promise<void> {
    const s = this.step();
    if (s.name !== "code") return;
    this.busy.set(true);
    this.error.set("");
    try {
      const next = await this.auth.requestPasswordReset(s.email);
      this.step.set({ name: "code", email: s.email, sent: next });
      this.code.set("");
    } catch (e) {
      this.error.set(authErrorMessage(e, this.t()));
    } finally {
      this.busy.set(false);
    }
  }

  protected backToEmail(): void {
    this.step.set({ name: "email" });
    this.code.set("");
    this.error.set("");
  }

  protected async submitPassword(): Promise<void> {
    const s = this.step();
    if (s.name !== "password" || !this.canSubmitPassword()) return;
    this.busy.set(true);
    this.error.set("");
    try {
      await this.auth.resetPassword(s.resetToken, this.password());
      await this.router.navigate(["/login"], { queryParams: { motdepasse: "modifie" } });
    } catch (e) {
      this.error.set(authErrorMessage(e, this.t()));
    } finally {
      this.busy.set(false);
    }
  }
}
