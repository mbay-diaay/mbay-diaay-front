import { Component } from "@angular/core";

import { AppLayoutComponent } from "@shared/app-layout.component";
import type { RouteMeta } from "@analogjs/router";
import { siteGateGuard } from "@shared/site-gate.guard";

/** Rideau « site en construction » : code d'accès demandé tant qu'il n'a pas été saisi. */
export const routeMeta: RouteMeta = { canActivate: [siteGateGuard] };

/**
 * Route de layout sans segment d'URL (Analog : le groupe `(app)` n'apparaît pas dans le chemin).
 * Toutes les pages connectées vivent dans `pages/(app)/` et s'affichent dans le `<router-outlet>`
 * de `AppLayoutComponent` : le menu et la barre du haut restent montés d'une page à l'autre.
 * Connexion, invitation et mot de passe oublié restent hors de ce cadre.
 */
@Component({
  selector: "app-layout-page",
  imports: [AppLayoutComponent],
  template: `<app-layout />`,
})
export default class AppLayoutPage {}
