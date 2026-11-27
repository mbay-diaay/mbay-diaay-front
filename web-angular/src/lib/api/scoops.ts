import type { MessageKey } from "../i18n";
import type { RoleId } from "../permissions";
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
  /** Coopérative technique « Hors coopérative » : exclue des décomptes, sélectionnable pour un transfert. */
  technical?: boolean;
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
export function listScoops(query: PageQuery & { q?: string; archived?: boolean; includeTechnical?: boolean } = {}) {
  const { archived, includeTechnical, ...rest } = query;
  return apiFetch<Page<ApiScoop>>(
    withPage("/scoops", {
      ...rest,
      ...(archived !== undefined && { archived: String(archived) }),
      // Ignoré par le serveur pour un compte sans le droit de transfert.
      ...(includeTechnical && { includeTechnical: "true" }),
    }),
  );
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
    ...(apiScoop.technical && { technical: true }),
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

/** Personnel de la coopérative (comptes actifs, hors rôles de réseau) : sert à choisir les convoqués d'une réunion. */
export type ScoopStaffMember = { id: string; name: string; role: RoleId };

export const fetchScoopStaff = (scoopId: string) =>
  apiFetch<ScoopStaffMember[]>(`/scoops/${encodeURIComponent(scoopId)}/staff`);

/**
 * Chiffres d'une coopérative tels que `GET /scoops/stats` les renvoie, calculés sur la base reçue du CRADESC (Kobo) :
 * producteurs (dont femmes, jeunes), parcelles et superficie en hectares. Tous les nombres sont fournis (0 si rien).
 */
/** Chiffres d'une coopérative pour UNE base d'origine (Kobo ou consolidée) : les deux bases ne sont jamais mélangées. */
export type ScoopBaseFigures = { producers: number; women: number; youth: number; plots: number; plotAreaHa: number };

export type ScoopStatsDto = {
  scoopId: string;
  /** Mêmes chiffres séparés par base d'origine (absent d'une ancienne réponse du serveur). */
  bySource?: { KOBO: ScoopBaseFigures; CONSOLIDE: ScoopBaseFigures };
  producers: number;
  women: number;
  men: number;
  youth: number;
  producersValidated: number;
  producersToCheck: number;
  organisations: number;
  members: number;
  plots: number;
  plotAreaHa: number;
  cultivatedAreaHa: number;
  plotsValidated: number;
  plotsToCheck: number;
  photos: number;
  mainCrops: { crop: string; plots: number }[];
  /** Date du dernier import Kobo, `null` si la coopérative n'en a pas. */
  lastImportAt: string | null;
};

/** Chiffres des coopératives du périmètre (ou d'une seule avec `scoopId`). */
export async function fetchScoopStats(scoopId?: string, includeTechnical = false): Promise<ScoopStatsDto[]> {
  const response = await apiFetch<{ items: ScoopStatsDto[] }>(
    withPage("/scoops/stats", { ...(scoopId && { scoopId }), ...(includeTechnical && { includeTechnical: "true" }) }),
  );
  return response.items;
}

// ------------------------------------------------------------------ Transfert

/** Sorte d'éléments déplaçables d'une coopérative à une autre (`POST /scoops/transfer`). */
export type TransferKind = "organisations" | "producers" | "members";

export type TransferBody = {
  kind: TransferKind;
  /** 500 identifiants au plus : un transfert est une seule transaction. */
  ids: string[];
  targetScoopId: string;
  reason?: string;
};

/** Éléments réellement déplacés : ceux demandés et ceux qui leur sont rattachés. */
export type TransferResult = {
  batchId: string;
  targetScoopId: string;
  fromScoopIds: string[];
  moved: {
    organisations: number;
    producers: number;
    members: number;
    plots: number;
    plotCrops: number;
    dossiers: number;
    corrections: number;
    accountLinks: number;
  };
};

/** Nombre maximal d'éléments par transfert (limite du serveur). */
export const TRANSFER_MAX_ITEMS = 500;

/** Déplace des organisations, producteurs ou membres vers une autre coopérative (droit `scoop.transfer`, audité). */
export const transferToScoop = (body: TransferBody) =>
  apiFetch<TransferResult>("/scoops/transfer", {
    method: "POST",
    body: {
      kind: body.kind,
      ids: body.ids,
      targetScoopId: body.targetScoopId,
      ...(body.reason?.trim() && { reason: body.reason.trim() }),
    },
  });

/** Clé du message français pour un refus de transfert. */
export function transferErrorKey(error: unknown): MessageKey {
  if (error instanceof ApiError) {
    const cause = (error.details as { code?: string } | undefined)?.code ?? error.code;
    switch (cause) {
      case "SCOOP_ARCHIVED":
        return "transfert.err.archived";
      case "TRANSFER_ALREADY_THERE":
        return "transfert.err.alreadyThere";
      case "TRANSFER_MERGED_PRODUCER":
        return "transfert.err.merged";
      case "ORG_NAME_TAKEN":
        return "transfert.err.nameTaken";
    }
    if (error.status === 0) return "transfert.err.network";
    if (error.status === 403) return "transfert.err.forbidden";
    if (error.status === 404) return "transfert.err.notFound";
  }
  return "transfert.err.generic";
}
