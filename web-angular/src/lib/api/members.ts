import { actions } from "../store";
import type { Member, MembershipStatus } from "../mock/cooperative";
import type { MessageKey } from "../i18n";
import { ApiError, apiFetch } from "./client";
import { fetchAllPages, type Page, type PageQuery, withPage } from "./pagination";

/**
 * Membres des coopératives côté API (`GET/POST/PATCH /members`, `POST /members/:id/status`, voir
 * `mbay-diaay-api/docs/API_ROUTES_M1.md`). La ligne renvoyée a la même forme que le `Member` du store.
 */
export type ApiMemberRow = Member;
export type ApiMemberCounts = { active: number; candidates: number; suspended: number; left: number; roster: number };

export type MemberFilters = PageQuery & {
  q?: string;
  status?: MembershipStatus;
  scoopId?: string;
  orgId?: string;
  producerId?: string;
};

export const listMembersPage = (query: MemberFilters = {}) =>
  apiFetch<Page<ApiMemberRow> & { counts: ApiMemberCounts }>(withPage("/members", query));

/** Tous les membres du périmètre du compte (paquets de 200). */
export const fetchAllMembers = () => fetchAllPages<ApiMemberRow>((query) => listMembersPage(query));

export type NewMemberBody = {
  scoopId: string;
  firstName: string;
  lastName: string;
  sex: "F" | "H";
  phone?: string;
  email?: string;
  age?: number;
  handicap?: boolean;
  village?: string;
  orgId?: string;
  producerId?: string;
  status?: MembershipStatus;
  joinedAt?: string;
};

export const createMemberOnApi = (body: NewMemberBody) =>
  apiFetch<ApiMemberRow>("/members", { method: "POST", body });

/** `null` retire l'organisation, l'e-mail, l'âge ou le producteur ; un champ absent n'est pas touché. */
export type MemberPatchBody = {
  orgId?: string | null;
  phone?: string;
  email?: string | null;
  age?: number | null;
  handicap?: boolean;
  village?: string;
  producerId?: string | null;
};

export const updateMemberOnApi = (id: string, body: MemberPatchBody) =>
  apiFetch<ApiMemberRow>(`/members/${encodeURIComponent(id)}`, { method: "PATCH", body });

export const setMemberStatusOnApi = (id: string, status: MembershipStatus, comment?: string) =>
  apiFetch<ApiMemberRow & { closedAccounts: number }>(`/members/${encodeURIComponent(id)}/status`, {
    method: "POST",
    body: { status, ...(comment ? { comment } : {}) },
  });

/** Message à afficher pour une erreur de l'API sur un membre ; `field` dit sous quel champ le montrer. */
export function memberApiError(error: unknown): { key: MessageKey; field?: "phone" | "email" | "age" } {
  if (error instanceof ApiError) {
    const cause = (error.details as { code?: string } | undefined)?.code ?? error.code;
    if (cause === "MEMBER_EMAIL_TAKEN") return { key: "errors.member.emailTaken", field: "email" };
    if (cause === "SCOOP_ARCHIVED") return { key: "errors.scoop.archived" };
    if (cause === "STATUS_UNCHANGED") return { key: "errors.member.statusUnchanged" };
    if (error.code === "NOT_FOUND") return { key: "errors.store.membreIntrouvable" };
    if (error.code === "FORBIDDEN") return { key: "errors.store.ceMembreEstHorsDe" };
    if (error.code === "BAD_REQUEST") {
      const text = JSON.stringify(error.details ?? error.message).toLowerCase();
      if (text.includes("sénégalais")) return { key: "errors.technician.phone", field: "phone" };
      if (text.includes("e-mail") || text.includes("email")) return { key: "errors.technician.email", field: "email" };
      if (text.includes("âge")) return { key: "errors.technician.age", field: "age" };
    }
  }
  return { key: "errors.users.api" };
}

/**
 * Variantes « mode API » des actions du store : l'API décide (identifiant, historique, comptes fermés), puis la ligne
 * renvoyée remplace celle du store. En mode démo, on garde `actions.addMember`, `updateMember` et `setMembershipStatus`.
 */
export async function addMemberViaApi(body: NewMemberBody): Promise<Member> {
  const row = await createMemberOnApi(body);
  actions.mergeMemberFromApi(row);
  return row;
}

export async function editMemberViaApi(id: string, body: MemberPatchBody): Promise<Member> {
  const row = await updateMemberOnApi(id, body);
  actions.mergeMemberFromApi(row);
  return row;
}

export async function changeMemberStatusViaApi(
  id: string,
  status: MembershipStatus,
  comment?: string,
): Promise<{ member: Member; closedAccounts: number }> {
  const { closedAccounts, ...member } = await setMemberStatusOnApi(id, status, comment);
  actions.mergeMemberFromApi(member);
  return { member, closedAccounts };
}
