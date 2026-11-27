import { apiFetch } from "./client";
import { withPage } from "./pagination";
import type { ProducerStats } from "./producers";

export type StatsBase = "ALL" | "KOBO" | "CONSOLIDE" | "APPLICATION";

/** Réseau : `null` pour un chiffre que le compte n'a pas le droit de voir (jamais un faux zéro). */
export type StatsNetwork = {
  organisations: number | null;
  gie: number | null;
  techniciansActive: number | null;
  accountsActive: number | null;
  invitationsPending: number | null;
};

/**
 * Résumé de l'accueil calculé par le serveur, en UN appel (`GET /stats/overview`) : producteurs par base d'origine,
 * réseau et alertes. Chaque partie est `null` si le compte n'a pas le droit correspondant.
 */
export type StatsMembers = { active: number; total: number };

export type StatsOverview = {
  generatedAt: string;
  producers: Record<StatsBase, ProducerStats> | null;
  network: StatsNetwork | null;
  members: StatsMembers | null;
  openAlerts: number | null;
  /** Dont alertes critiques (sévérité haute). */
  openHighAlerts: number | null;
};

const recent = new Map<string, { at: number; promise: Promise<StatsOverview> }>();

/**
 * Plusieurs blocs de l'accueil lisent le même résumé : pendant 5 secondes, la même demande est partagée au lieu
 * d'être renvoyée (le serveur garde aussi le résultat 30 secondes).
 */
export function getStatsOverview(youthMaxAge: number): Promise<StatsOverview> {
  const path = withPage("/stats/overview", { youthMaxAge });
  const known = recent.get(path);
  if (known && Date.now() - known.at < 5000) return known.promise;
  const promise = apiFetch<StatsOverview>(path);
  recent.set(path, { at: Date.now(), promise });
  promise.catch(() => recent.delete(path));
  return promise;
}
