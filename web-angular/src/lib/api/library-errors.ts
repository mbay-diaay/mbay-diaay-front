import type { MessageKey } from "../i18n";
import { ApiError } from "./client";

/** Message de la bibliothèque pour une erreur de l'API (dépôt, téléchargement, retrait). */
export function libraryApiError(error: unknown): MessageKey {
  if (error instanceof ApiError) {
    // Un conflit arrive en `CONFLICT` ; la cause précise est dans `details.code`.
    const cause = (error.details as { code?: string } | undefined)?.code ?? error.code;
    switch (cause) {
      case "SCOOP_ARCHIVED":
        return "errors.scoop.archived";
      case "DOCUMENT_TOO_LARGE":
        return "errors.library.api.tooBig";
      case "FILE_FORMAT":
        return "errors.library.api.format";
      case "FILE_CONTENT":
        return "errors.library.api.content";
      case "FILE_REQUIRED":
        return "errors.library.api.fileRequired";
      case "LINK_INVALID":
        return error.status === 403 ? "errors.library.api.linkExpired" : "errors.library.link";
      case "VERSION_NOT_ALLOWED":
        return "errors.library.versionNotAllowed";
      case "FILE_UNAVAILABLE":
        return "errors.library.api.noFile";
      case "STORAGE_DISABLED":
      case "STORAGE_UNAVAILABLE":
        return "errors.library.api.storage";
      case "FORBIDDEN":
        return "errors.store.downloadNotAllowed";
      case "NOT_FOUND":
        return "errors.library.notFound";
    }
  }
  return "errors.library.api.generic";
}
