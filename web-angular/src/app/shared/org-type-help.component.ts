import { Component, computed, inject, input } from "@angular/core";

import type { MessageKey } from "@/lib/i18n";
import { LocaleService } from "./locale.service";
import { IconComponent } from "./ui";

/** Une phrase d'aide par type d'organisation (décision Q-09, « DONNEES.md » §7). Pas de phrase inventée pour un type absent de la liste. */
const HELP_KEY: Partial<Record<string, MessageKey>> = {
  GIE: "orgtype.help.GIE",
  Union: "orgtype.help.Union",
  Groupement: "orgtype.help.Groupement",
  Section: "orgtype.help.Section",
  OP: "orgtype.help.OP",
  "À préciser": "orgtype.help.aPreciser",
};

const NAME_KEY: Partial<Record<string, MessageKey>> = {
  GIE: "organisations.type.GIE",
  Union: "organisations.type.Union",
  Groupement: "organisations.type.Groupement",
  Section: "organisations.type.Section",
  OP: "orgtype.name.OP",
  "À préciser": "orgtype.name.aPreciser",
};

/** Ordre d'affichage de la liste complète. */
const ALL_TYPES = ["GIE", "Union", "Groupement", "Section", "OP", "À préciser"] as const;

/**
 * Aide en français sur les types d'organisation.
 * - `<app-org-type-help [type]="type" />` : la phrase du type donné (type vide : « À préciser »).
 * - `<app-org-type-help [showAll]="true" />` : les six définitions (GIE, Union, Groupement, Section, OP, À préciser).
 * Une seule colonne de lecture, texte court.
 */
@Component({
  selector: "app-org-type-help",
  imports: [IconComponent],
  styles: `
    .box {
      border-radius: 16px;
      background: var(--v2-info-bg);
      color: var(--v2-info-fg);
      padding: 12px 14px;
      font-size: 14px;
      font-weight: 500;
      line-height: 1.45;
    }
    .row {
      display: flex;
      gap: 8px;
      align-items: flex-start;
    }
    ul {
      display: grid;
      gap: 8px;
      margin-top: 8px;
    }
    b {
      font-weight: 800;
    }
  `,
  template: `
    @if (showAll()) {
      <div class="box">
        <p class="row"><ui-icon name="info" [size]="18" /><b>{{ t()("orgtype.help.title") }}</b></p>
        <ul>
          @for (entry of entries(); track entry.name) {
            <li>
              <b>{{ entry.name }}</b> : {{ entry.help }}
            </li>
          }
        </ul>
        <p class="mt-2" style="font-size: 13px">{{ t()("orgtype.help.note") }}</p>
      </div>
    } @else if (single(); as current) {
      <p class="box row">
        <ui-icon name="info" [size]="18" />
        <span
          ><b>{{ current.name }}</b> : {{ current.help }}</span
        >
      </p>
    }
  `,
})
export class OrgTypeHelpComponent {
  readonly type = input<string | null | undefined>(null);
  readonly showAll = input(false);

  protected readonly t = inject(LocaleService).t;

  protected readonly entries = computed(() => {
    const t = this.t();
    return [
      ...ALL_TYPES.map((type) => ({ name: t(NAME_KEY[type]!), help: t(HELP_KEY[type]!) })),
    ];
  });

  protected readonly single = computed(() => {
    const t = this.t();
    const type = this.type();
    if (!type) return { name: t("orgtype.name.aPreciser"), help: t("orgtype.help.aPreciser") };
    const helpKey = HELP_KEY[type];
    const nameKey = NAME_KEY[type];
    return helpKey && nameKey ? { name: t(nameKey), help: t(helpKey) } : null;
  });
}
