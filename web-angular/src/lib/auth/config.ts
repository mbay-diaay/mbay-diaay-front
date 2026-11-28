import { demoMode } from "@/lib/api/config";

/**
 * Mode démonstration : comptes fictifs, courriel simulé affiché à l'écran, profils interchangeables.
 * Fermé en production ; ouvert par défaut en développement local sauf réglage contraire.
 */
export function resolveDemoMode(value: unknown, development: boolean): boolean {
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  return development;
}

export const DEMO_MODE = demoMode();
