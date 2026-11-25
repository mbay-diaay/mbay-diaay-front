import { apiFetch } from "./client";
import { isApiMode } from "./config";
import { getAccessToken } from "./tokens";

/** Préférences du compte, enregistrées côté serveur (`/users/me/preferences`) : jamais dans le navigateur. */
export type UserPreferences = {
  locale?: "fr" | "wo";
  sidebarCollapsed?: boolean;
  sidebarGroups?: Record<string, boolean>;
  cooperativesView?: "list" | "cards";
};

const SAVE_DELAY_MS = 600;

let current: UserPreferences = {};
let pendingPatch: UserPreferences = {};
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<(preferences: UserPreferences) => void>();

function notify(): void {
  for (const listener of listeners) listener(current);
}

export function getPreferences(): UserPreferences {
  return current;
}

export function subscribePreferences(listener: (preferences: UserPreferences) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Garde seulement les champs connus et bien typés d'une réponse serveur. */
export function sanitizePreferences(raw: unknown): UserPreferences {
  if (!raw || typeof raw !== "object") return {};
  const source = raw as Record<string, unknown>;
  const result: UserPreferences = {};
  if (source["locale"] === "fr" || source["locale"] === "wo") result.locale = source["locale"];
  if (typeof source["sidebarCollapsed"] === "boolean") result.sidebarCollapsed = source["sidebarCollapsed"];
  if (source["cooperativesView"] === "list" || source["cooperativesView"] === "cards") {
    result.cooperativesView = source["cooperativesView"];
  }
  const groups = source["sidebarGroups"];
  if (groups && typeof groups === "object") {
    result.sidebarGroups = Object.fromEntries(
      Object.entries(groups as Record<string, unknown>).filter(([, value]) => typeof value === "boolean"),
    ) as Record<string, boolean>;
  }
  return result;
}

/** Lit les préférences du serveur après connexion. Silencieux en cas d'échec (valeurs par défaut). */
export async function loadPreferences(): Promise<UserPreferences> {
  if (!isApiMode() || !getAccessToken()) return current;
  try {
    const raw = await apiFetch<unknown>("/users/me/preferences");
    // Une modification locale en attente d'envoi reste prioritaire sur la lecture.
    current = { ...sanitizePreferences(raw), ...pendingPatch };
    notify();
  } catch {
    /* silencieux : on garde les valeurs par défaut */
  }
  return current;
}

/** Applique tout de suite en mémoire, puis envoie au serveur après un court délai (anti-rebond). */
export function updatePreferences(patch: UserPreferences): void {
  current = { ...current, ...patch };
  notify();
  if (!isApiMode() || !getAccessToken()) return;
  pendingPatch = { ...pendingPatch, ...patch };
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void flushPreferences(), SAVE_DELAY_MS);
}

async function flushPreferences(): Promise<void> {
  saveTimer = null;
  const body = pendingPatch;
  pendingPatch = {};
  if (Object.keys(body).length === 0 || !getAccessToken()) return;
  try {
    await apiFetch("/users/me/preferences", { method: "PUT", body });
  } catch {
    /* silencieux : la préférence reste appliquée dans cette page */
  }
}

/** À la déconnexion : on oublie tout (le compte suivant relit les siennes). */
export function resetPreferences(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  pendingPatch = {};
  current = {};
  notify();
}
