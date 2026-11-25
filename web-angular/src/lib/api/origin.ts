import type { RecordOrigin } from "../mock/data";

/** Colonnes d'origine telles que l'API les renvoie sur un producteur ou une organisation. */
export type ApiOrigin = {
  sourceBase?: "KOBO" | "CONSOLIDE" | null;
  sourceSheet?: string | null;
  sourceRow?: number | null;
  sourceFile?: string | null;
  importBatchId?: string | null;
  placementAConfirmer?: boolean;
  placementNote?: string | null;
};

/**
 * Origine de l'écran à partir de la réponse de l'API : les valeurs sont recopiées telles quelles. Un champ que le
 * serveur ne renvoie pas (serveur plus ancien) reste absent : l'écran ne le devine pas.
 */
export function originFromApi(row: ApiOrigin): RecordOrigin {
  return {
    ...(row.sourceBase !== undefined && { sourceBase: row.sourceBase }),
    ...(row.sourceSheet !== undefined && { sourceSheet: row.sourceSheet }),
    ...(row.sourceRow !== undefined && { sourceRow: row.sourceRow }),
    ...(row.sourceFile !== undefined && { sourceFile: row.sourceFile }),
    ...(row.placementAConfirmer && { placementAConfirmer: true }),
    ...(row.placementNote && { placementNote: row.placementNote }),
  };
}
