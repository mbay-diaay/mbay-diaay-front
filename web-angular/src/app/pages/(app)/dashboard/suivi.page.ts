import { Component, inject } from "@angular/core";

import { AppShellComponent } from "@shared/app-shell.component";
import { LocaleService } from "@shared/locale.service";
import { UiEmptyComponent } from "@shared/ui/empty.component";
import { UiPageHeaderComponent } from "@shared/ui/page-header.component";

/**
 * Suivi des cultures : écran ouvert dans le menu, sans donnée tant que le module n'est pas relié au serveur.
 * Aucune valeur inventée : l'état vide l'indique clairement.
 */
@Component({
  selector: "app-suivi-page",
  imports: [AppShellComponent, UiPageHeaderComponent, UiEmptyComponent],
  template: `
    <app-shell [perm]="perms" [area]="t()('nav.item.suivi')">
      <ui-page-header
        [title]="t()('nav.item.suivi')"
        [description]="t()('agronomique.suivi.description')"
      />
      <div class="surface">
        <ui-empty>{{ t()("commercial.empty") }}</ui-empty>
      </div>
    </app-shell>
  `,
})
export default class SuiviPage {
  protected readonly locale = inject(LocaleService);
  protected readonly t = this.locale.t;
  protected readonly perms = ["dashboard.read"] as const;
}
