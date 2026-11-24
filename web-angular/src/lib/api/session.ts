import type { Permission, RoleId } from "../permissions";
import { actions, getState } from "../store";
import { apiFetch } from "./client";
import { isApiMode } from "./config";
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
 * Restaure la session depuis l'API (jeton + GET /me).
 * Sans jeton valide → déconnexion propre.
 * En mode démo (pas d'API) → restoreSession locale.
 */
export async function hydrateSessionFromApi(): Promise<boolean> {
  if (!isApiMode()) {
    actions.restoreSession();
    return getState().session !== null;
  }
  if (!getAccessToken()) {
    actions.logout();
    return false;
  }
  try {
    const me = await apiFetch<MeResponse>("/me");
    actions.login(me.name, me.email, me.role, me.permissions, me.scoopIds ?? (me.scoopId ? [me.scoopId] : []));
    await loadScoopsFromApi();
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
