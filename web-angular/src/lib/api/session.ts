import type { Permission, RoleId } from "../permissions";
import { actions, getState } from "../store";
import { apiFetch, refreshSession } from "./client";
import { isApiMode } from "./config";
import { loadPreferences } from "./preferences";
import { fetchAllPages } from "./pagination";
import { fetchScoopStats, listScoops, managerRowsFromScoops, scoopFromApi } from "./scoops";
import { clearTokens, getAccessToken } from "./tokens";

type MeResponse = {
  id: string;
  email: string;
  name: string;
  role: RoleId;
  scoopId: string | null;
  /** Coopératives du périmètre (vide pour un rôle de réseau). */
  scoopIds?: string[];
  /** Droits appliqués par le serveur (matrice modifiable par le super administrateur). */
  permissions?: Permission[];
};

/**
 * Retrouve la session auprès de l'API : le jeton d'accès n'est qu'en mémoire, donc au chargement (ou dans un
 * nouvel onglet) on le redemande avec le cookie HttpOnly de renouvellement (POST /auth/refresh), puis GET /me.
 * Sans session valide → déconnexion propre (écran de connexion).
 * En mode démo (pas d'API) : la session n'existe qu'en mémoire, rien à restaurer.
 */
export async function hydrateSessionFromApi(): Promise<boolean> {
  if (!isApiMode()) {
    actions.restoreSession();
    return getState().session !== null;
  }
  if (!getAccessToken() && !(await refreshSession())) {
    actions.logout();
    return false;
  }
  try {
    const me = await apiFetch<MeResponse>("/me");
    actions.login(me.name, me.email, me.role, me.permissions, me.scoopIds ?? (me.scoopId ? [me.scoopId] : []));
    await Promise.all([loadScoopsFromApi(), loadPreferences()]);
    return true;
  } catch {
    clearTokens();
    actions.logout();
    return false;
  }
}

/**
 * Mode API : les coopératives du compte (son périmètre) viennent du serveur, pas des données de démonstration.
 * Un échec laisse la liste actuelle en place : les écrans la rechargent à leur ouverture.
 */
export async function loadScoopsFromApi(): Promise<void> {
  try {
    const scoops = await fetchAllPages((query) => listScoops(query));
    actions.replaceScoopsFromApi(scoops.map(scoopFromApi));
    actions.syncManagersFromApi(scoops.map((scoop) => scoop.id), managerRowsFromScoops(scoops));
  } catch {
    // Silencieux : voir ci-dessus.
  }
  await loadScoopStatsFromApi();
}

/**
 * Mode API : les chiffres des coopératives (producteurs, femmes, jeunes, parcelles, hectares) viennent de
 * `GET /scoops/stats`. Sans réponse, les écrans affichent « — » : jamais un chiffre de démonstration.
 */
export async function loadScoopStatsFromApi(scoopId?: string): Promise<void> {
  try {
    const items = await fetchScoopStats(scoopId);
    if (scoopId) actions.mergeScoopStatsFromApi(items);
    else actions.setScoopStatsFromApi(items);
  } catch {
    // Silencieux : les compteurs restent à « — ».
  }
}
