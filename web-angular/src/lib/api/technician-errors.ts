import type { MessageKey } from "../i18n";
import { ApiError } from "./client";

/**
 * Message du formulaire « technicien » pour une erreur de l'API. `field` dit sous quel champ l'afficher ;
 * sans champ, c'est un message général.
 */
export function technicianApiError(error: unknown): { key: MessageKey; field?: "phone" | "email" | "name" } {
  if (error instanceof ApiError) {
    // Un conflit arrive en `CONFLICT` ; la cause précise (téléphone ou e-mail déjà pris) est dans `details.code`.
    const cause = (error.details as { code?: string } | undefined)?.code ?? error.code;
    if (cause === "PHONE_TAKEN") return { key: "errors.technician.phoneTaken", field: "phone" };
    if (cause === "EMAIL_TAKEN") return { key: "errors.technician.emailTaken", field: "email" };
    if (error.code === "NOT_FOUND") return { key: "errors.technician.notFound" };
    if (error.code === "FORBIDDEN") return { key: "errors.technician.scope" };
    if (error.code === "BAD_REQUEST") {
      const text = JSON.stringify(error.details ?? error.message).toLowerCase();
      if (text.includes("sénégalais") || text.includes("phone")) return { key: "errors.technician.phone", field: "phone" };
      if (text.includes("email")) return { key: "errors.technician.email", field: "email" };
    }
  }
  return { key: "errors.users.api" };
}
