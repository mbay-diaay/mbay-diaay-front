import { Component, computed, inject, input } from "@angular/core";

import { describeSource, describeSourcePlace, shortSourceKey, sourceOfRecord, type OriginSource } from "@/lib/data-source";
import { LocaleService } from "./locale.service";
import { IconComponent } from "./ui";

/**
 * Colonne « Source » d'une fiche (producteur ou organisation) : « Kobo », « Consolidé » ou « Saisie », lue dans les
 * colonnes d'origine enregistrées par le serveur, avec la feuille et le numéro de ligne du fichier d'origine.
 * `showPlace` ajoute l'emplacement sous la pastille ; l'infobulle le donne toujours.
 */
@Component({
  selector: "app-source-badge",
  imports: [IconComponent],
  styles: `
    :host {
      display: inline-flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
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
    }
    .place {
      font-size: 12px;
      font-weight: 500;
      color: var(--v2-gris-texte);
      white-space: nowrap;
    }
  `,
  template: `
    <span class="badge" [style.background]="source().bg" [style.color]="source().fg" [title]="detail()">
      <ui-icon [name]="source().icon" [size]="14" />{{ t()(shortKey()) }}
    </span>
    @if (showPlace() && place()) {
      <span class="place">{{ place() }}</span>
    }
  `,
})
export class SourceBadgeComponent {
  readonly record = input.required<OriginSource>();
  readonly showPlace = input(false);

  protected readonly t = inject(LocaleService).t;
  protected readonly source = computed(() => sourceOfRecord(this.record()));
  protected readonly shortKey = computed(() => shortSourceKey(this.source()));
  protected readonly place = computed(() => describeSourcePlace(this.record(), this.t()));
  protected readonly detail = computed(() => {
    const base = describeSource(this.source(), this.t());
    return this.place() ? `${base} · ${this.place()}` : base;
  });
}
