import { Component, inject, input } from "@angular/core";

import { CniAlertsService } from "./cni-alerts.service";
import { LocaleService } from "./locale.service";
import { IconComponent } from "./ui";

/**
 * Pastille rouge « CNI proches : à vérifier ». Alimentée par le serveur (`CniAlertsService`), visible seulement pour
 * un compte qui a le droit de voir les alertes. Elle ne dit pas qu'il y a un doublon : l'infobulle le précise.
 * `<app-cni-alert-badge [producerId]="producer.id" />`
 */
@Component({
  selector: "app-cni-alert-badge",
  imports: [IconComponent],
  styles: `
    :host {
      display: inline-flex;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      border-radius: 999px;
      padding: 3px 10px 3px 8px;
      font-size: 12px;
      font-weight: 800;
      white-space: nowrap;
      background: var(--v2-erreur-bg);
      color: var(--v2-erreur-fg);
    }
  `,
  template: `
    @if (alerts.isFlagged(producerId())) {
      <span class="badge" role="status" [title]="t()('cni.badge.title')"
        ><ui-icon name="warning" [size]="14" />{{ t()("cni.badge") }}</span
      >
    }
  `,
})
export class CniAlertBadgeComponent {
  readonly producerId = input.required<string>();

  protected readonly alerts = inject(CniAlertsService);
  protected readonly t = inject(LocaleService).t;
}
