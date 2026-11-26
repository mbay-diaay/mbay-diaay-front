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

/** Une ligne du panneau « Données d'origine du fichier » : colonne du fichier reçu et valeur exacte. */
export type SourceRow = { column: string; value: string };

/**
 * Lignes d'origine renvoyées par l'API (`sourceValues` du détail d'une fiche) : un objet « colonne → valeur » ou une
 * liste `{ column, value }`. Les valeurs sont recopiées telles quelles (aucune normalisation, Q-17) ; une forme
 * inconnue ne donne aucune ligne plutôt qu'une valeur inventée.
 */
export function sourceRowsOf(raw: unknown): SourceRow[] {
  const text = (value: unknown): string =>
    value === null || value === undefined ? "" : typeof value === "string" ? value : typeof value === "object" ? JSON.stringify(value) : String(value);
  if (Array.isArray(raw)) {
    return raw.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const item = entry as Record<string, unknown>;
      const column = item["column"] ?? item["colonne"] ?? item["name"];
      return typeof column === "string" ? [{ column, value: text(item["value"] ?? item["valeur"]) }] : [];
    });
  }
  if (raw && typeof raw === "object") return Object.entries(raw as Record<string, unknown>).map(([column, value]) => ({ column, value: text(value) }));
  return [];
}
