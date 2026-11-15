import { apiFetch } from "./client";
import { apiBaseUrl, isApiMode } from "./config";

/** Fiches qui portent une image : chaque type correspond à une route de l'API (`docs/API_ROUTES_M1.md`). */
export type MediaTarget = "scoop" | "producer" | "user";

const path = (target: MediaTarget, id: string): string => {
  const key = encodeURIComponent(id);
  if (target === "scoop") return `/scoops/${key}/logo`;
  if (target === "producer") return `/producers/${key}/photo`;
  return `/users/${key}/photo`;
};

/** Envoie (ou remplace) l'image d'une fiche. Renvoie le lien de lecture signé (valable 1 h). */
export async function uploadImage(target: MediaTarget, id: string, image: Blob): Promise<string> {
  const form = new FormData();
  form.append("file", image, "image");
  const { url } = await apiFetch<{ url: string }>(path(target, id), { method: "PUT", body: form });
  return mediaSrc(url) ?? url;
}

export const removeImage = (target: MediaTarget, id: string) =>
  apiFetch<{ deleted: boolean }>(path(target, id), { method: "DELETE" });

/**
 * Lien d'image reçu de l'API (`/v1/media/…`, relatif à l'adresse du serveur) → lien utilisable dans `<img>`.
 * Les aperçus locaux (`data:`) et les liens déjà absolus passent tels quels.
 */
export function mediaSrc(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^(https?:|data:|blob:)/.test(url)) return url;
  const base = apiBaseUrl();
  if (!base) return url;
  // `base` finit par /v1 : on garde l'origine seule, le lien reçu contient déjà son préfixe.
  return `${new URL(base).origin}${url.startsWith("/") ? url : `/${url}`}`;
}

/**
 * Envoi d'image après l'enregistrement d'une fiche. Sans API (démonstration locale) ou sans image, il n'y a rien à
 * faire. Renvoie false si l'envoi échoue : la fiche reste enregistrée, l'appelant prévient l'utilisateur.
 */
export async function syncImage(target: MediaTarget, id: string, image: Blob | null): Promise<boolean> {
  if (!isApiMode() || !image) return true;
  try {
    await uploadImage(target, id, image);
    return true;
  } catch {
    return false;
  }
}
