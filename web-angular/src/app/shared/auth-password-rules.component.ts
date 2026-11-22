import { Component, computed, inject, input } from "@angular/core";
import { Check, Circle, LucideAngularModule } from "lucide-angular";

import { evaluatePassword } from "@/lib/auth/policy";

import { LocaleService } from "./locale.service";

/** Règles du mot de passe, cochées au fil de la saisie (mêmes règles que le serveur). */
@Component({
  selector: "app-auth-password-rules",
  imports: [LucideAngularModule],
  styles: `
    :host {
      display: block;
    }
  `,
  template: `
    <ul class="grid gap-1.5 text-[14px] font-semibold" [attr.aria-label]="t()('auth.password.rules')">
      @for (rule of rules(); track rule.id) {
        <li class="flex items-center gap-2" [style.color]="rule.ok ? 'var(--v2-vert-pousse)' : 'var(--v2-gris-texte)'">
          <lucide-angular [img]="rule.ok ? icons.check : icons.circle" [size]="16" />
          {{ t()(rule.key, rule.params ?? {}) }}
        </li>
      }
    </ul>
  `,
})
export class AuthPasswordRulesComponent {
  readonly password = input("");
  readonly email = input("");

  protected readonly t = inject(LocaleService).t;
  protected readonly icons = { check: Check, circle: Circle };
  protected readonly rules = computed(() => evaluatePassword(this.password(), this.email()));
}
