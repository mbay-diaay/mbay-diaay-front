import { Component, DestroyRef, inject, signal } from "@angular/core";
import { ArrowRight, CircleAlert, Loader2, LucideAngularModule, ShieldCheck } from "lucide-angular";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { take } from "rxjs";

import { authErrorMessage } from "@/lib/auth/messages";
import { isPasswordValid } from "@/lib/auth/policy";
import { AUTH_FORM_STYLES } from "@shared/auth-form.styles";
import { AuthFieldComponent } from "@shared/auth-field.component";
import { AuthPasswordRulesComponent } from "@shared/auth-password-rules.component";
import { AuthShellComponent } from "@shared/auth-shell.component";
import { AuthService } from "@shared/auth.service";
import { LocaleService } from "@shared/locale.service";

/**
 * Activation de compte (premier mot de passe).
 * Le jeton est retiré de l’URL après lecture (replace).
 */
@Component({
  selector: "app-invitation-page",
  imports: [
    RouterLink,
    LucideAngularModule,
    AuthShellComponent,
    AuthFieldComponent,
    AuthPasswordRulesComponent,
  ],
  styles: AUTH_FORM_STYLES,
  template: `
    <app-auth-shell>
      <span
        class="mono inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5"
        style="background: var(--v2-sauge); color: var(--v2-foret)"
      >
        <lucide-angular [img]="icons.shield" [size]="14" />
        {{ t()("auth.invitation.badge") }}
      </span>

      <h1 class="mt-7 text-[32px] font-extrabold leading-[1.05] tracking-[-0.03em] lg:text-[40px]">
        {{ t()("auth.invitation.title") }}
      </h1>

      @if (checking()) {
        <p role="status" class="mt-3 flex items-center gap-2 text-base font-medium" style="color: var(--v2-gris-texte)">
          <lucide-angular [img]="icons.loader" [size]="18" class="animate-spin" />
          {{ t()("auth.invitation.checking") }}
        </p>
      } @else if (known(); as k) {
        <p class="mt-3 text-base font-medium" style="color: var(--v2-gris-texte)">
          {{ t()("auth.invitation.description") }}
        </p>
        <div
          class="mt-6 rounded-[16px] border p-4"
          style="border-color: var(--v2-bord-carte); background: var(--v2-blanc)"
        >
          <p class="text-[17px] font-extrabold">{{ k.name }}</p>
          <p class="mono mt-1" style="color: var(--v2-gris-texte)">
            {{ t()("auth.invitation.account", { email: k.maskedEmail }) }}
          </p>
        </div>
        <form class="mt-6 space-y-5" novalidate (submit)="$event.preventDefault(); submitForm()">
          <app-auth-field
            id="pw1"
            kind="password"
            autocomplete="new-password"
            [label]="t()('auth.invitation.password')"
            [(value)]="password"
          />
          <app-auth-password-rules [password]="password()" [email]="k.email" />
          <app-auth-field
            id="pw2"
            kind="password"
            autocomplete="new-password"
            [label]="t()('auth.invitation.confirm')"
            [invalid]="mismatch()"
            [(value)]="confirm"
          />
          @if (mismatch()) {
            <div role="alert" class="alert"><lucide-angular [img]="icons.alert" [size]="20" />{{ t()("auth.invitation.mismatch") }}</div>
          } @else if (error()) {
            <div role="alert" class="alert"><lucide-angular [img]="icons.alert" [size]="20" />{{ error() }}</div>
          }
          <button type="submit" class="btn-primary !mt-7" [disabled]="busy() || !canSubmit()">
            <span>{{ busy() ? t()("auth.invitation.submitting") : t()("auth.invitation.submit") }}</span>
            <span class="btn-chip" aria-hidden="true">
              <lucide-angular [img]="busy() ? icons.loader : icons.arrowRight" [size]="22" [class.animate-spin]="busy()" />
            </span>
          </button>
        </form>
      } @else {
        <div role="alert" class="alert mt-6">
          <lucide-angular [img]="icons.alert" [size]="20" class="mt-0.5 shrink-0" />
          <span>{{ error() || t()("auth.error.invitation_invalid") }}</span>
        </div>
      }

      <p class="mt-8 text-[15px]">
        <a routerLink="/login" class="link">{{ t()("auth.invitation.toLogin") }}</a>
      </p>
    </app-auth-shell>
  `,
})
export default class InvitationPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly locale = inject(LocaleService);
  protected readonly t = this.locale.t;

  protected readonly icons = { alert: CircleAlert, arrowRight: ArrowRight, loader: Loader2, shield: ShieldCheck };

  private token: string | null = null;
  protected readonly checking = signal(false);
  protected readonly known = signal<{ name: string; email: string; maskedEmail: string } | null>(
    null,
  );
  protected readonly password = signal("");
  protected readonly confirm = signal("");
  protected readonly error = signal("");
  protected readonly busy = signal(false);

  constructor() {
    this.route.queryParamMap
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const urlToken = params.get("jeton");
        if (urlToken) {
          this.token = urlToken;
          void this.router.navigate([], {
            relativeTo: this.route,
            replaceUrl: true,
            queryParams: { jeton: null },
          });
          this.loadInfo();
        } else {
          this.error.set(this.t()("auth.invitation.missing"));
        }
      });
  }

  private loadInfo(): void {
    if (!this.token) return;
    this.checking.set(true);
    this.error.set("");
    this.auth
      .invitationInfo(this.token)
      .then((info) => {
        this.known.set(info);
      })
      .catch((e) => {
        this.error.set(authErrorMessage(e, this.t()));
        this.known.set(null);
      })
      .finally(() => this.checking.set(false));
  }

  protected inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected mismatch(): boolean {
    return this.confirm().length > 0 && this.confirm() !== this.password();
  }

  protected canSubmit(): boolean {
    const k = this.known();
    if (!k || !this.token) return false;
    return isPasswordValid(this.password(), k.email) && this.confirm() === this.password();
  }

  protected async submitForm(): Promise<void> {
    if (!this.canSubmit() || !this.token || this.busy()) return;
    this.busy.set(true);
    this.error.set("");
    try {
      await this.auth.acceptInvitation(this.token, this.password());
      await this.router.navigate(["/login"], { queryParams: { motdepasse: "modifie" } });
    } catch (e) {
      this.error.set(authErrorMessage(e, this.t()));
    } finally {
      this.busy.set(false);
    }
  }
}
