import { isPlatformBrowser } from "@angular/common";
import { PLATFORM_ID, inject } from "@angular/core";
import { type CanActivateFn, Router } from "@angular/router";

import { SITE_GATE_PAGE, isOpenPath, isUnlockedForSession } from "@/lib/site-gate";

/**
 * Renvoie vers l'écran « site en construction » tant que le code d'accès n'a pas été saisi dans ce navigateur.
 * Côté serveur (pré-rendu), la page passe : le contrôle se fait dans le navigateur.
 */
export const siteGateGuard: CanActivateFn = (_route, state) => {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return true;
  if (isOpenPath(state.url) || isUnlockedForSession()) return true;
  return inject(Router).createUrlTree([SITE_GATE_PAGE], { queryParams: { redirect: state.url } });
};
