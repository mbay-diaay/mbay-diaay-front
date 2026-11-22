import { Component, computed, input, model, signal } from "@angular/core";
import { Eye, EyeOff, Lock, LucideAngularModule, Mail } from "lucide-angular";

import { LocaleService } from "./locale.service";
import { inject } from "@angular/core";

/**
 * Champ des écrans d'authentification (charte V2) : même rendu que la connexion, icône à gauche, œil pour afficher un
 * mot de passe. `<app-auth-field id="pw1" [label]="…" kind="password" [(value)]="password" />`
 */
@Component({
  selector: "app-auth-field",
  imports: [LucideAngularModule],
  styles: `
    :host {
      display: block;
    }
    .label {
      display: block;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--v2-ardoise);
    }
    .field {
      height: 60px;
      width: 100%;
      border-radius: var(--v2-radius-champ);
      border: 1.5px solid var(--v2-gris-trait);
      background: var(--v2-blanc);
      padding-left: 56px;
      padding-right: 16px;
      font-size: 16px;
      font-weight: 500;
      color: var(--v2-encre);
      transition:
        border-color 0.15s ease,
        box-shadow 0.15s ease;
    }
    .field.with-toggle {
      padding-right: 64px;
    }
    .field::placeholder {
      color: var(--v2-gris-texte);
      opacity: 0.75;
    }
    .field:hover {
      border-color: var(--v2-gris-texte);
    }
    .field:focus-visible {
      outline: none;
      border: 2px solid var(--v2-foret);
      padding-left: 55.5px;
      box-shadow: var(--v2-halo);
    }
    .field[aria-invalid="true"] {
      border: 2px solid var(--v2-erreur-fg);
      padding-left: 55.5px;
    }
    .toggle {
      cursor: pointer;
    }
    .toggle:hover {
      background: var(--v2-sauge);
    }
    .toggle:focus-visible {
      outline: 2px solid var(--v2-foret);
      outline-offset: 2px;
    }
  `,
  template: `
    <div class="space-y-2.5">
      <label [for]="id()" class="label">{{ label() }}</label>
      <div class="relative">
        <span
          class="pointer-events-none absolute inset-y-0 left-0 grid w-14 place-items-center"
          style="color: var(--v2-gris-texte)"
          aria-hidden="true"
        >
          <lucide-angular [img]="kind() === 'email' ? icons.mail : icons.lock" [size]="20" />
        </span>
        <input
          [id]="id()"
          class="field"
          [class.with-toggle]="kind() === 'password'"
          [type]="kind() === 'password' && !visible() ? 'password' : kind() === 'email' ? 'email' : 'text'"
          [attr.autocomplete]="autocomplete()"
          [attr.inputmode]="kind() === 'email' ? 'email' : null"
          [attr.autocapitalize]="'none'"
          spellcheck="false"
          [placeholder]="placeholder()"
          [value]="value()"
          [attr.aria-invalid]="invalid() || null"
          (input)="value.set($any($event.target).value)"
        />
        @if (kind() === "password") {
          <button
            type="button"
            class="toggle absolute right-2 top-1/2 grid size-12 -translate-y-1/2 place-items-center rounded-[14px] transition-colors"
            style="color: var(--v2-ardoise)"
            [attr.aria-label]="visible() ? t()('auth.password.hide') : t()('auth.password.show')"
            [attr.aria-pressed]="visible()"
            (click)="visible.set(!visible())"
          >
            <lucide-angular [img]="visible() ? icons.eyeOff : icons.eye" [size]="20" />
          </button>
        }
      </div>
    </div>
  `,
})
export class AuthFieldComponent {
  readonly id = input.required<string>();
  readonly label = input.required<string>();
  readonly kind = input<"email" | "password" | "text">("text");
  readonly placeholder = input("");
  readonly autocomplete = input("off");
  readonly invalid = input(false);
  readonly value = model("");

  protected readonly visible = signal(false);
  protected readonly icons = { mail: Mail, lock: Lock, eye: Eye, eyeOff: EyeOff };
  protected readonly t = inject(LocaleService).t;
  protected readonly isPassword = computed(() => this.kind() === "password");
}
