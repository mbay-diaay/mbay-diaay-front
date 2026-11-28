import { Component, input } from "@angular/core";

import { IconComponent, type IconName } from "./icon.component";

/**
 * Tableau ou liste sans ligne (charte V2) : pastille d'icône, titre, explication et, au besoin, une action.
 *
 * ```html
 * <ui-empty-state icon="inventory_2" title="Aucun lot en stock" description="Enregistrez le premier lot reçu.">
 *   <button class="btn btn-primary" (click)="openCreate()">Nouveau lot</button>
 * </ui-empty-state>
 * ```
 *
 * `compact` : version réduite pour une carte ou un panneau latéral.
 */
@Component({
  selector: "ui-empty-state",
  imports: [IconComponent],
  host: { class: "block", role: "status" },
  styles: `
    .wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 48px 24px 52px;
      text-align: center;
    }
    .wrap.compact {
      padding: 28px 16px 32px;
    }
    .badge {
      position: relative;
      display: grid;
      width: 76px;
      height: 76px;
      place-items: center;
      border-radius: 999px;
      background: var(--v2-sauge);
      color: var(--v2-foret);
      margin-bottom: 14px;
    }
    .compact .badge {
      width: 56px;
      height: 56px;
      margin-bottom: 8px;
    }
    /* Deux anneaux discrets : l'écran « respire » sans animation ni image. */
    .badge::before,
    .badge::after {
      content: "";
      position: absolute;
      inset: -10px;
      border-radius: 999px;
      border: 1.5px dashed color-mix(in oklab, var(--v2-foret) 22%, transparent);
    }
    .badge::after {
      inset: -22px;
      border-style: solid;
      border-color: color-mix(in oklab, var(--v2-foret) 8%, transparent);
    }
    .compact .badge::after {
      display: none;
    }
    .dot {
      position: absolute;
      right: -2px;
      bottom: 4px;
      width: 14px;
      height: 14px;
      border-radius: 999px;
      background: var(--v2-citron);
      border: 3px solid var(--v2-blanc);
    }
    h3 {
      margin: 0;
      font-size: 18px;
      font-weight: 800;
      letter-spacing: -0.01em;
      color: var(--v2-encre);
    }
    .compact h3 {
      font-size: 15px;
    }
    p {
      margin: 0;
      max-width: 44ch;
      font-size: 14px;
      font-weight: 500;
      line-height: 1.55;
      color: var(--v2-gris-texte);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 10px;
      margin-top: 16px;
    }
    .actions:empty {
      display: none;
    }
  `,
  template: `
    <div class="wrap" [class.compact]="compact()">
      <span class="badge" aria-hidden="true">
        <ui-icon [name]="icon()" [size]="compact() ? 26 : 34" />
        <span class="dot"></span>
      </span>
      <h3>{{ title() }}</h3>
      @if (description()) {
        <p>{{ description() }}</p>
      }
      <div class="actions"><ng-content /></div>
    </div>
  `,
})
export class UiEmptyStateComponent {
  readonly icon = input<IconName>("search");
  readonly title = input.required<string>();
  readonly description = input("");
  readonly compact = input(false);
}
