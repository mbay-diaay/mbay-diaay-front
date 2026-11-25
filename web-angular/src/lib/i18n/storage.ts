import type { Locale } from "./translate";

export function isLocale(value: unknown): value is Locale {
  return value === "fr" || value === "wo";
}

/**
 * Langue de départ avant connexion : `fr` par défaut, ou la langue du navigateur si c'est le wolof.
 * Rien n'est enregistré dans le navigateur : après connexion, la langue vient des préférences du compte (serveur).
 */
export function initialLocale(): Locale {
  if (typeof navigator === "undefined") return "fr";
  return navigator.language?.toLowerCase().startsWith("wo") ? "wo" : "fr";
}
