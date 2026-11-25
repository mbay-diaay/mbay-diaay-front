import type { MessageKey } from "../i18n";
import { ApiError, apiFetch } from "./client";

/** Déplacement en lot de producteurs ou d'adhérents vers une organisation existante (`POST /organisations/move`). */
export type MoveKind = "producers" | "members";

/** Limite du serveur par envoi. */
export const MOVE_MAX_ITEMS = 500;

export type MoveResult = { targetOrganisationId: string; targetScoopId: string; moved: number; scoopChanged: number };

export function moveToOrganisation(body: { kind: MoveKind; ids: string[]; targetOrganisationId: string; reason?: string }) {
  const reason = body.reason?.trim();
  return apiFetch<MoveResult>("/organisations/move", {
    method: "POST",
    body: { kind: body.kind, ids: body.ids, targetOrganisationId: body.targetOrganisationId, ...(reason ? { reason } : {}) },
  });
}

/** Message français d'une erreur de déplacement (404 et 409 du serveur). */
export function moveErrorKey(error: unknown): MessageKey {
  if (error instanceof ApiError) {
    const cause = (error.details as { code?: string } | undefined)?.code ?? error.code;
    switch (cause) {
      case "MOVE_NEEDS_TRANSFER":
        return "deplacer.err.needsTransfer";
      case "MOVE_ALREADY_THERE":
        return "deplacer.err.alreadyThere";
      case "MOVE_MERGED_PRODUCER":
        return "deplacer.err.merged";
      case "SCOOP_ARCHIVED":
        return "deplacer.err.archived";
    }
    if (error.status === 0) return "deplacer.err.network";
    if (error.status === 403) return "deplacer.err.forbidden";
    if (error.status === 404) return "deplacer.err.notFound";
  }
  return "deplacer.err.generic";
}
