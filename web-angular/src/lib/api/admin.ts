import { apiFetch } from "./client";
import { type Page, type PageQuery, withPage } from "./pagination";

/**
 * Listes M1 de l'API (toutes paginées). Formes alignées sur `docs/openapi.json` de
 * `mbay-diaay-api` ; les écrans les utilisent quand `VITE_API_URL` est configurée.
 */

export type ApiScoop = { id: string; code: string; name: string };
export type ApiOrganisation = { id: string; scoopId: string; name: string; type: string; village: string };
export type ApiProducer = {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  scoopId: string;
  status: string;
  cniMasked: string;
};
export type ApiContribution = { memberId: string; status: string; period: string; amount: number };
export type ApiMeeting = { id: string; title: string; status: string; date: string };
export type ApiDocument = { id: string; title: string; version: number; status: string };
export type ApiAuditEntry = {
  id: string;
  at: string;
  actor: string;
  action: string;
  target: string;
  detail: string;
  scoopId?: string | null;
  /** Famille d'événement du serveur : consultations, acces_refuses, connexions ou operations. */
  category?: string | null;
};

export const listScoops = (q: PageQuery = {}) => apiFetch<Page<ApiScoop>>(withPage("/scoops", q));

export const listOrganisations = (q: PageQuery & { scoopId?: string } = {}) =>
  apiFetch<Page<ApiOrganisation>>(withPage("/organisations", q));

export const listProducers = (q: PageQuery & { q?: string } = {}) =>
  apiFetch<Page<ApiProducer>>(withPage("/producers", q));

export const listContributions = (q: PageQuery = {}) =>
  apiFetch<Page<ApiContribution>>(withPage("/contributions", q));

export const listMeetings = (q: PageQuery = {}) => apiFetch<Page<ApiMeeting>>(withPage("/meetings", q));

export const listDocuments = (q: PageQuery = {}) => apiFetch<Page<ApiDocument>>(withPage("/documents", q));

export const listQualityAlerts = (q: PageQuery = {}) =>
  apiFetch<Page<unknown> & { open: number }>(withPage("/quality/alerts", q));

export const listAudit = (q: PageQuery = {}) => apiFetch<Page<ApiAuditEntry>>(withPage("/audit", q));
