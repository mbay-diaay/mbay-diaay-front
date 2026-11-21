import type { MessageKey } from "../i18n";
import type { Org, OrgType } from "../mock/data";
import { ApiError, apiFetch } from "./client";
import { type Page, type PageQuery, withPage } from "./pagination";

/** Organisation telle que l'API la renvoie (`GET /organisations`). */
export type ApiOrganisation = {
  id: string;
  scoopId: string;
  name: string;
  type: OrgType | null;
  village: string;
};

/** Une page d'organisations du périmètre (tri par nom), avec filtres facultatifs. */
export function listOrganisations(query: PageQuery & { scoopId?: string; q?: string; type?: string } = {}) {
  return apiFetch<Page<ApiOrganisation>>(withPage("/organisations", query));
}

export function getOrganisation(id: string) {
  return apiFetch<ApiOrganisation>(`/organisations/${encodeURIComponent(id)}`);
}

export function createOrganisation(body: { scoopId: string; name: string; type?: OrgType | null; village?: string }) {
  return apiFetch<ApiOrganisation>("/organisations", { method: "POST", body });
}

export function updateOrganisation(id: string, body: { name?: string; type?: OrgType | null; village?: string }) {
  return apiFetch<ApiOrganisation>(`/organisations/${encodeURIComponent(id)}`, { method: "PATCH", body });
}

/** Attribue un même type à plusieurs organisations (tout ou rien). */
export function qualifyOrganisations(ids: string[], type: OrgType) {
  return apiFetch<{ updated: number }>("/organisations/qualify", { method: "POST", body: { ids, type } });
}

/** Organisation de l'API → organisation du store. */
export const orgFromApi = (item: ApiOrganisation): Org => ({
  id: item.id,
  name: item.name,
  type: item.type,
  scoopId: item.scoopId,
  village: item.village,
});

/** Message d'une erreur de l'API pour une organisation ; `field` dit sous quel champ l'afficher. */
export function organisationApiError(error: unknown): { key: MessageKey; field?: "name" } {
  if (error instanceof ApiError) {
    // Un conflit arrive en `CONFLICT` ; la cause précise est dans `details.code`.
    const cause = (error.details as { code?: string } | undefined)?.code ?? error.code;
    if (cause === "ORG_NAME_TAKEN") return { key: "errors.organisation.nameTaken", field: "name" };
    if (cause === "SCOOP_ARCHIVED") return { key: "errors.organisation.scoopArchived" };
    if (error.code === "NOT_FOUND") return { key: "errors.organisation.notFound" };
    if (error.code === "FORBIDDEN") return { key: "errors.organisation.forbidden" };
  }
  return { key: "errors.organisation.api" };
}
