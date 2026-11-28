import { environment } from "../../environments/environment";

/**
 * URL de l'API NestJS (sans slash final), ex. http://localhost:3000/v1 ou https://api.mbaydiaay.com/v1
 * Absent → mode démonstration locale (store en mémoire).
 */
export function apiUrl(): string | null {
  const raw = environment.apiUrl;
  if (!raw?.trim()) return null;
  return raw.trim().replace(/\/$/, "");
}

/** Alias conservé pour les appels existants. */
export function apiBaseUrl(): string | null {
  return apiUrl();
}

/** True si le front doit parler au backend réel. */
export function isApiMode(): boolean {
  return apiUrl() !== null;
}

/** Vrai si le mode démonstration est activé. */
export function demoMode(): boolean {
  return environment.demoMode;
}

/** Vrai si le rideau « site en construction » est actif. */
export function siteGate(): boolean {
  return environment.siteGate;
}

/** Code d'accès du rideau « site en construction ». */
export function siteAccessCode(): string {
  return environment.siteAccessCode.trim() || "CRADESC-NIAYES";
}

/** Identifiant de l'agrégateur de paiement relié (null si aucun). */
export function paymentProvider(): string | null {
  return environment.paymentProvider?.trim() || null;
}

/** Jeton public Mapbox GL JS. */
export function mapboxToken(): string | null {
  const raw = environment.mapboxToken;
  return raw?.trim() ? raw.trim() : null;
}

/** URL optionnelle de remontée des erreurs navigateur. */
export function errorReportUrl(): string | null {
  const raw = environment.errorReportUrl;
  return raw?.trim() ? raw.trim() : null;
}
