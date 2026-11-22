import type { MessageKey } from "../i18n";
import type { Scoop } from "../mock/data";
import type { ApiUserRow } from "../store";
import { ApiError, apiFetch } from "./client";
import { mediaSrc } from "./media";
import { type Page, type PageQuery, withPage } from "./pagination";

/** Gestionnaire d'une coopérative, tel que `GET /scoops` et `GET /scoops/:id` le renvoient à qui voit la coopérative. */
export type ApiScoopManager = {
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  active: boolean;
  invitationPending: boolean;
  invitationExpiresAt: string | null;
};

/** Coopérative telle que l'API la renvoie (`GET /scoops`). */
export type ApiScoop = {
  id: string;
  name: string;
  code: string;
  commune: string;
  region: string | null;
  archived: boolean;
  createdAt: string;
  /** Lien signé du logo (1 h), `null` sans logo. */
  logoUrl?: string | null;
  /** Gestionnaire de la coopérative (liste et fiche) ; absent dans la réponse à une création. */
  manager?: ApiScoopManager | null;
};

export type CreatedScoop = Omit<ApiScoop, "manager"> & {
  /** Compte gestionnaire créé avec la coopérative : inactif tant qu'il n'a pas choisi son mot de passe. */
  manager?: { userId: string; activationPending: boolean; invitationSent?: boolean } | null;
};

export type ScoopCreateBody = {
  name: string;
  commune: string;
  code?: string;
  region?: string;
  createdAt?: string;
  manager?: { firstName: string; lastName: string; email: string };
};

export type ScoopUpdateBody = { name?: string; commune?: string; code?: string; region?: string };

/** Une page de coopératives (filtres : `q`, `archived`). */
export function listScoops(query: PageQuery & { q?: string; archived?: boolean } = {}) {
  const { archived, ...rest } = query;
  return apiFetch<Page<ApiScoop>>(withPage("/scoops", { ...rest, ...(archived !== undefined && { archived: String(archived) }) }));
}

export function getScoop(id: string) {
  return apiFetch<ApiScoop>(`/scoops/${encodeURIComponent(id)}`);
}

export function createScoop(body: ScoopCreateBody) {
  return apiFetch<CreatedScoop>("/scoops", { method: "POST", body });
}

export function updateScoop(id: string, body: ScoopUpdateBody) {
  return apiFetch<ApiScoop>(`/scoops/${encodeURIComponent(id)}`, { method: "PATCH", body });
}

/** Archive la coopérative et ferme les accès liés à elle seule : `closedAccounts` les compte. */
export function archiveScoop(id: string) {
  return apiFetch<ApiScoop & { closedAccounts: number }>(`/scoops/${encodeURIComponent(id)}/archive`, { method: "POST", body: {} });
}

export function restoreScoop(id: string) {
  return apiFetch<ApiScoop>(`/scoops/${encodeURIComponent(id)}/restore`, { method: "POST", body: {} });
}

/** Coopérative de l'API au format du store (région absente = `undefined`, jamais `null`). */
export function scoopFromApi(apiScoop: Omit<ApiScoop, "manager">): Scoop {
  return {
    id: apiScoop.id,
    name: apiScoop.name,
    commune: apiScoop.commune,
    code: apiScoop.code,
    ...(apiScoop.region && { region: apiScoop.region }),
    createdAt: apiScoop.createdAt,
    ...(apiScoop.archived && { archived: true }),
    // Lien relatif de l'API (`/v1/media/…`) : on le rend absolu, sinon le navigateur le cherche sur le site.
    ...(apiScoop.logoUrl && { logoUrl: mediaSrc(apiScoop.logoUrl) ?? apiScoop.logoUrl }),
  };
}

/**
 * Message du formulaire « coopérative » pour une erreur de l'API. `field` dit sous quel champ l'afficher
 * (le code court se corrige en changeant le nom : il est affiché sous le champ « nom »).
 */
export function scoopApiError(error: unknown): { key: MessageKey; field?: "name" | "commune" | "managerFirstName" | "managerLastName" | "managerEmail" } {
  if (error instanceof ApiError) {
    // Un conflit arrive en `CONFLICT` ; la cause précise est dans `details.code`.
    const cause = (error.details as { code?: string } | undefined)?.code ?? error.code;
    if (cause === "SCOOP_NAME_TAKEN") return { key: "errors.scoop.nameTaken", field: "name" };
    if (cause === "SCOOP_CODE_TAKEN") return { key: "errors.scoop.codeTaken", field: "name" };
    if (cause === "EMAIL_TAKEN") return { key: "errors.scoop.emailTaken", field: "managerEmail" };
    if (cause === "ALREADY_ARCHIVED") return { key: "errors.scoop.alreadyArchived" };
    if (cause === "NOT_ARCHIVED") return { key: "errors.scoop.notArchived" };
    if (error.code === "NOT_FOUND") return { key: "errors.scoop.notFound" };
    if (error.code === "FORBIDDEN") return { key: "errors.scoop.notAllowed" };
    if (error.code === "BAD_REQUEST") {
      const text = JSON.stringify(error.details ?? error.message).toLowerCase();
      if (text.includes("nom de la coop")) return { key: "errors.scoop.nameRequired", field: "name" };
      if (text.includes("commune")) return { key: "errors.scoop.communeRequired", field: "commune" };
      if (text.includes("code")) return { key: "errors.scoop.codeFormat", field: "name" };
      if (text.includes("e-mail")) return { key: "errors.scoop.emailFormat", field: "managerEmail" };
      if (text.includes("prénom")) return { key: "errors.scoop.managerRequired", field: "managerFirstName" };
      if (text.includes("nom du gestionnaire")) return { key: "errors.scoop.managerRequired", field: "managerLastName" };
    }
  }
  return { key: "errors.scoop.api" };
}

/**
 * Gestionnaires renvoyés avec les coopératives, au format des comptes du store : la fiche, la liste et la barre latérale
 * retrouvent ainsi le gestionnaire sans que la personne ait le droit de lister tous les comptes de la plateforme.
 */
export function managerRowsFromScoops(items: ApiScoop[]): ApiUserRow[] {
  return items.flatMap((item) =>
    item.manager
      ? [
          {
            id: item.manager.userId,
            name: item.manager.name,
            email: item.manager.email,
            role: "gestionnaire" as const,
            scoopId: item.id,
            phone: item.manager.phone,
            active: item.manager.active,
            invitationPending: item.manager.invitationPending,
            invitationExpiresAt: item.manager.invitationExpiresAt,
          },
        ]
      : [],
  );
}
