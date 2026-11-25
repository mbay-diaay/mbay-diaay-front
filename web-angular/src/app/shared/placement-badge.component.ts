import { Component, computed, inject, input } from "@angular/core";

import type { RecordOrigin } from "@/lib/mock/data";
import { LocaleService } from "./locale.service";
import { IconComponent } from "./ui";

/**
 * Mention « Coopérative à confirmer » : rattachement provisoire d'une fiche (décision Q-03). Elle ne s'affiche que
 * quand le serveur le demande (`placementAConfirmer`) ; la note du serveur sert d'infobulle. Se corrige par un
 * transfert vers la bonne coopérative.
 */
@Component({
  selector: "app-placement-badge",
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
      background: var(--v2-attente-bg);
      color: var(--v2-attente-fg);
    }
  `,
  template: `
    @if (record().placementAConfirmer) {
      <span class="badge" [title]="note()"><ui-icon name="help" [size]="14" />{{ t()("placement.badge") }}</span>
    }
  `,
})
export class PlacementBadgeComponent {
  readonly record = input.required<RecordOrigin>();

  protected readonly t = inject(LocaleService).t;
  protected readonly note = computed(() => this.record().placementNote || this.t()("placement.noteDefault"));
}
