import type { MessageKey } from "../i18n";
import { ApiError, apiFetch } from "./client";
import { type Page, type PageQuery, withPage } from "./pagination";

/** Demandes du CRADESC aux coopératives (`/coop-requests`, mode API uniquement). */

export type CoopRequestKind = "doublon" | "alerte" | "organisation" | "fiche" | "autre";
export const COOP_REQUEST_KINDS: readonly CoopRequestKind[] = ["doublon", "alerte", "organisation", "fiche", "autre"];

export type CoopRequestStatus = "ouverte" | "réglée" | "annulée";
export const COOP_REQUEST_STATUSES: readonly CoopRequestStatus[] = ["ouverte", "réglée", "annulée"];

export type CoopRequestItemType = "producer" | "organisation" | "plot";

/** Élément concerné par la demande : jamais de téléphone ni de CNI, seulement un identifiant et un libellé. */
export type CoopRequestItem = { type: CoopRequestItemType; id: string; label: string };

export type CoopRequestHistoryEntry = { at: string; by: string; action: string; comment?: string };

export type CoopRequestDto = {
  id: string;
  scoopId: string;
  scoopName: string;
  kind: CoopRequestKind;
  subject: string;
  message: string;
  items: CoopRequestItem[];
  link: string | null;
  status: CoopRequestStatus;
  createdBy: string;
  createdAt: string;
  recipientEmail: string | null;
  mailStatus: "envoyé" | "non envoyé";
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  history: CoopRequestHistoryEntry[];
};

/** Destinataire d'une demande : le gestionnaire actif de la coopérative (`null` : aucun). */
export type CoopRequestRecipient = {
  scoopId: string;
  scoopName: string;
  recipient: { name: string; email: string } | null;
};

export type CoopRequestInput = {
  scoopId: string;
  kind: CoopRequestKind;
  subject: string;
  message: string;
  items?: CoopRequestItem[];
  /** Chemin relatif commençant par `/dashboard/`. */
  link?: string;
};

export const COOP_REQUEST_SUBJECT_MAX = 160;
export const COOP_REQUEST_MESSAGE_MAX = 3000;
export const COOP_REQUEST_ITEMS_MAX = 50;

export function getCoopRequestRecipient(scoopId: string) {
  return apiFetch<CoopRequestRecipient>(withPage("/coop-requests/recipient", { scoopId }));
}

export function createCoopRequest(body: CoopRequestInput) {
  return apiFetch<CoopRequestDto>("/coop-requests", { method: "POST", body });
}

export function listCoopRequests(
  query: PageQuery & { scoopId?: string; status?: CoopRequestStatus | ""; kind?: CoopRequestKind | "" } = {},
) {
  return apiFetch<Page<CoopRequestDto>>(withPage("/coop-requests", query));
}

export function getCoopRequest(id: string) {
  return apiFetch<CoopRequestDto>(`/coop-requests/${encodeURIComponent(id)}`);
}

export function resolveCoopRequest(id: string, note?: string) {
  const trimmed = note?.trim();
  return apiFetch<CoopRequestDto>(`/coop-requests/${encodeURIComponent(id)}/resolve`, {
    method: "POST",
    body: trimmed ? { note: trimmed } : {},
  });
}

export function cancelCoopRequest(id: string) {
  return apiFetch<CoopRequestDto>(`/coop-requests/${encodeURIComponent(id)}/cancel`, { method: "POST", body: {} });
}

/** Clé de message française pour une erreur de l'API des demandes. */
export function coopRequestErrorKey(error: unknown): MessageKey {
  if (error instanceof ApiError) {
    const cause = (error.details as { code?: string } | undefined)?.code ?? error.code;
    if (cause === "NO_MANAGER") return "demandes.err.noManager";
    if (cause === "ALREADY_CLOSED") return "demandes.err.alreadyClosed";
    if (error.status === 0) return "demandes.err.network";
    if (error.status === 403) return "demandes.err.forbidden";
    if (error.status === 404 || cause === "NOT_FOUND") return "demandes.err.notFound";
    if (error.status === 400 || error.status === 422) return "demandes.err.invalid";
  }
  return "demandes.err.generic";
}
