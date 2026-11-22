import type { MessageKey } from "../i18n";
import type { RoleId } from "../permissions";
import { ApiError, apiFetch } from "./client";

/** Fiche producteur résumée, telle que l'API la joint aux rapprochements. */
export type ApiProducerSummary = {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  village: string;
  scoopId: string;
  orgId: string;
};

export type ApiAccount = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: RoleId;
  scoopId: string | null;
  scoopIds: string[];
  active: boolean;
};

export type ApiAccountLink = {
  id: string;
  userId: string;
  producerId: string;
  linkedAt: string;
  by: string;
  producer: ApiProducerSummary;
};

export type ApiAccountCandidate = {
  id: string;
  userId: string;
  producerId: string;
  score: number;
  signals: string[];
  producer: ApiProducerSummary;
};

export type AccountLinksOverview = {
  accounts: ApiAccount[];
  links: ApiAccountLink[];
  candidates: ApiAccountCandidate[];
};

/** Comptes du périmètre, rapprochements confirmés et propositions (`GET /account-links`). */
export const fetchAccountLinks = () => apiFetch<AccountLinksOverview>("/account-links");

/** Rapproche un compte d'une fiche : confirme une proposition ou lie à la main. */
export const linkAccount = (userId: string, producerId: string) =>
  apiFetch<ApiAccountLink>("/account-links", { method: "POST", body: { userId, producerId } });

/** Écarte une proposition : elle ne revient plus pour ce couple. */
export const rejectAccountCandidate = (userId: string, producerId: string) =>
  apiFetch<{ rejected: true }>("/account-links/reject", { method: "POST", body: { userId, producerId } });

export const unlinkAccount = (linkId: string) =>
  apiFetch<{ deleted: true }>(`/account-links/${encodeURIComponent(linkId)}/delete`, { method: "POST", body: {} });

/** Message d'une erreur de l'API sur un rapprochement. */
export function accountLinkError(error: unknown): MessageKey {
  if (error instanceof ApiError) {
    const cause = (error.details as { code?: string } | undefined)?.code ?? error.code;
    if (cause === "ACCOUNT_ALREADY_LINKED" || cause === "PRODUCER_ALREADY_LINKED") return "comptes.toast.impossibleDesc";
    if (cause === "SCOOP_MISMATCH") return "comptes.err.scoopMismatch";
    if (error.code === "NOT_FOUND") return "comptes.err.notFound";
    if (error.code === "FORBIDDEN") return "comptes.err.forbidden";
  }
  return "comptes.err.api";
}
