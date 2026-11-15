/**
 * Images de fiche (logo de coopérative, photo de producteur, de personnel ou de technicien).
 * L'image est réduite dans le navigateur avant tout envoi : un téléphone produit des photos de plusieurs Mo,
 * l'API n'en accepte que 2 Mo (JPEG, PNG ou WebP).
 */

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
/** Fichier choisi, avant réduction. */
export const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
/** Plafond de l'API : ce que l'on envoie ne doit jamais le dépasser. */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
/** Plus grand côté après réduction (logo comme photo d'identité). */
export const MAX_SIDE = 512;

export type ImageProblem = "type" | "size";

/** Contrôle d'un fichier choisi ; renvoie le problème, ou null s'il est acceptable. */
export function imageProblem(file: { type: string; size: number }): ImageProblem | null {
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) return "type";
  if (file.size > MAX_SOURCE_BYTES) return "size";
  return null;
}

/** Dimensions après réduction : le plus grand côté ne dépasse pas `max`, jamais d'agrandissement. */
export function fitWithin(width: number, height: number, max = MAX_SIDE): { width: number; height: number } {
  const ratio = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
}

export type PreparedImage = {
  /** Fichier à envoyer à l'API. */
  blob: Blob;
  /** Aperçu immédiat, et valeur gardée dans la fiche. */
  dataUrl: string;
};

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

const readAsDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

/** Réduit l'image (côté 512 px au plus) et la ré-encode en WebP, ou en JPEG si le navigateur ne sait pas. */
export async function prepareImage(file: File): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas indisponible");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  let blob = await toBlob(canvas, "image/webp", 0.85);
  if (!blob || blob.type !== "image/webp") blob = await toBlob(canvas, "image/jpeg", 0.88);
  if (!blob || blob.size > MAX_UPLOAD_BYTES) throw new Error("image trop lourde après réduction");
  return { blob, dataUrl: await readAsDataUrl(blob) };
}
