import type { MessageKey } from "../i18n";
import { ApiError, apiFetch } from "./client";
import { type Page, type PageQuery, withPage } from "./pagination";

/**
 * Alertes de qualité enregistrées sur le serveur (`/quality/alerts`, mode API). Aujourd'hui : « CNI proches : à vérifier ».
 * Rien n'est calculé dans le navigateur : l'API détecte, le site affiche. Une alerte ne dit PAS que deux fiches sont
 * un doublon (règle Q-12 : une même CNI sur plusieurs enregistrements est normale ; seules des CNI différentes mais
 * proches sont signalées, pour vérification humaine). Aucune valeur de CNI n'est transmise.
 */

export type QualityAlertKind = "cni_proches" | "cni_format_inhabituel";
export const QUALITY_ALERT_KINDS: readonly QualityAlertKind[] = ["cni_proches", "cni_format_inhabituel"];
export type QualityAlertSeverity = "haute" | "moyenne" | "basse";
export type QualityAlertStatus = "ouverte" | "résolue" | "obsolète";
export type QualityAlertReason =
  | "format"
  | "un_caractere"
  | "inversion"
  // CNI au format inhabituel : moins de 13 chiffres, plus de 13 chiffres, caractères autres que des chiffres.
  | "trop_court"
  | "trop_long"
  | "caracteres";

export type QualityAlertDto = {
  id: string;
  kind: QualityAlertKind;
  severity: QualityAlertSeverity;
  message: string;
  reason: QualityAlertReason;
  status: QualityAlertStatus;
  producerId: string;
  producerCode: string | null;
  scoopId: string;
  /** Autre fiche de la paire ; `null` si elle est hors du périmètre du compte ou pour un format inhabituel (une seule fiche). */
  otherProducerId: string | null;
  otherProducerCode: string | null;
  otherScoopId: string | null;
  detectedAt: string;
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
};

export type QualityAlertsPage = Page<QualityAlertDto> & { open: number; openHigh: number };

export type QualityAlertsQuery = PageQuery & {
  severity?: QualityAlertSeverity;
  scoopId?: string;
  kind?: string;
  status?: QualityAlertStatus | "";
  producerId?: string;
};

/** Longueur maximale de la note de résolution (limite du serveur). */
export const ALERT_NOTE_MAX = 1000;

export function listQualityAlerts(query: QualityAlertsQuery = {}) {
  return apiFetch<QualityAlertsPage>(withPage("/quality/alerts", query));
}

/** Identifiants des fiches du périmètre qui portent une alerte haute ouverte (pastille rouge des listes). */
export async function listFlaggedProducerIds(): Promise<string[]> {
  const result = await apiFetch<{ producerIds: string[] }>("/quality/alerts/flagged-producers");
  return result.producerIds;
}

export async function listProducerAlerts(producerId: string): Promise<QualityAlertDto[]> {
  const result = await apiFetch<{ items: QualityAlertDto[] }>(
    `/quality/alerts/producer/${encodeURIComponent(producerId)}`,
  );
  return result.items;
}

/** Résolution manuelle : la vérification est faite par une personne. Ne fusionne jamais rien. */
export function resolveQualityAlert(id: string, note?: string) {
  const trimmed = note?.trim();
  return apiFetch<QualityAlertDto>(`/quality/alerts/${encodeURIComponent(id)}/resolve`, {
    method: "POST",
    body: trimmed ? { note: trimmed } : {},
  });
}

export type DetectCniFormatResult = { fiches: number; unusual: number; created: number; reopened: number; obsolete: number };
export type DetectCniResult = {
  fiches: number;
  pairs: number;
  created: number;
  reopened: number;
  obsolete: number;
  /** Détection des CNI au format inhabituel (signalement seulement, la CNI n'est jamais modifiée). */
  format?: DetectCniFormatResult;
};

/** Relance la détection des CNI proches (compte `quality.review` au périmètre complet). Idempotente. */
export function detectCloseCni() {
  return apiFetch<DetectCniResult>("/quality/alerts/detect-cni", { method: "POST", body: {} });
}

export const ALERT_REASON_KEY: Record<QualityAlertReason, MessageKey> = {
  format: "cni.reason.format",
  un_caractere: "cni.reason.un_caractere",
  inversion: "cni.reason.inversion",
  trop_court: "cni.reason.trop_court",
  trop_long: "cni.reason.trop_long",
  caracteres: "cni.reason.caracteres",
};

/** Message français d'une erreur de l'API des alertes. */
export function alertErrorKey(error: unknown): MessageKey {
  if (error instanceof ApiError) {
    const cause = (error.details as { code?: string } | undefined)?.code ?? error.code;
    if (cause === "ALREADY_CLOSED") return "cni.err.alreadyClosed";
    if (error.status === 0) return "cni.err.network";
    if (error.status === 403) return "cni.err.forbidden";
    if (error.status === 404 || cause === "NOT_FOUND") return "cni.err.notFound";
  }
  return "cni.err.generic";
}
