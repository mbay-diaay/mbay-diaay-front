import { apiFetch } from "./client";
import { mediaSrc } from "./media";
import { fetchAllPages, type Page, withPage } from "./pagination";

/** Document de la bibliothèque tel que l'API le renvoie (`GET /documents`, `docs/API_ROUTES_M1.md`). */
export type ApiDocument = {
  id: string;
  ownerType: string;
  ownerId: string;
  scoopId: string;
  kind: string;
  name: string;
  sizeKb: number;
  mime: string;
  uploadedBy: string;
  uploadedAt: string;
  sensitive: boolean;
  version: number;
  effectiveAt: string;
  lifecycle: "en vigueur" | "remplacé";
  replacedById: string | null;
  link: { type: string; id: string } | null;
  /** Faux pour un document de démonstration : il n'a pas de fichier à télécharger. */
  hasFile: boolean;
};

/** Toute la bibliothèque du périmètre du compte (pages de 200 réunies). */
export const listLibraryDocuments = (): Promise<ApiDocument[]> =>
  fetchAllPages((query) => apiFetch<Page<ApiDocument>>(withPage("/documents", query)));

export type UploadFields = {
  kind: string;
  sensitive: boolean;
  link?: { type: string; id: string } | undefined;
  replaceExisting: boolean;
};

/** Dépose un fichier dans la bibliothèque d'une coopérative. `name` remplace le nom d'origine du fichier. */
export function uploadLibraryDocument(scoopId: string, file: File, name: string, fields: UploadFields) {
  const form = new FormData();
  form.append("file", file, name);
  form.append("kind", fields.kind);
  form.append("sensitive", String(fields.sensitive));
  if (fields.link) {
    form.append("linkType", fields.link.type);
    form.append("linkId", fields.link.id);
  }
  form.append("replaceExisting", String(fields.replaceExisting));
  return apiFetch<ApiDocument>(`/scoops/${encodeURIComponent(scoopId)}/documents`, { method: "POST", body: form });
}

/** Lien de téléchargement signé (5 minutes), utilisable tel quel dans un lien `<a>`. */
export async function documentDownloadUrl(id: string): Promise<{ url: string; name: string }> {
  const link = await apiFetch<{ url: string; expiresAt: string; name: string }>(
    `/documents/${encodeURIComponent(id)}/link`,
  );
  return { url: mediaSrc(link.url) ?? link.url, name: link.name };
}

/** Retire un document de la bibliothèque (suppression logique côté serveur). */
export const deleteLibraryDocument = (id: string) =>
  apiFetch<{ deleted: true }>(`/documents/${encodeURIComponent(id)}/delete`, { method: "POST", body: {} });
