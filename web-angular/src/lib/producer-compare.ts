import type { Plot, Producer } from "@/lib/mock/data";
import { identicalSubsets, normalizedPersonName, producerAlertTexts } from "@/lib/quality-real";

/**
 * Comparaison de fiches producteur (page « Comparer les fiches ») : logique pure, sans framework.
 * Les valeurs comparées sont celles qui s'affichent (déjà masquées pour le téléphone et la CNI).
 */

/** `same` : valeurs renseignées et égales ; `different` : renseignées et distinctes ; `missing` : au moins une fiche sans valeur. */
export type CompareStatus = "same" | "different" | "missing";

export interface CompareRow {
  label: string;
  /** Valeur affichée par fiche (« » si non renseignée). */
  values: string[];
  status: CompareStatus;
}

export interface CompareSummary {
  same: number;
  different: number;
  missing: number;
}

/** Texte comparable : sans accents, sans casse ni espaces en trop. */
export function normalizeForCompare(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Statut d'une ligne : une valeur vide sur une fiche rend la ligne « manquante », sauf si toutes sont vides. */
export function compareStatus(values: (string | null | undefined)[]): CompareStatus {
  const normalized = values.map(normalizeForCompare);
  const filled = normalized.filter(Boolean);
  if (!filled.length) return "missing";
  if (filled.length < normalized.length) return "missing";
  return new Set(filled).size === 1 ? "same" : "different";
}

export function buildCompareRow(label: string, values: (string | null | undefined)[]): CompareRow {
  return { label, values: values.map((value) => (value ?? "").trim()), status: compareStatus(values) };
}

export function summarizeRows(rows: CompareRow[]): CompareSummary {
  const summary: CompareSummary = { same: 0, different: 0, missing: 0 };
  for (const row of rows) summary[row.status] += 1;
  return summary;
}

export type SimilarityReason = "name" | "phone";

/** Motifs du rapprochement : même nom normalisé, téléphone partagé (alertes de l'import). Une même CNI n'en est pas un (Q-12). */
export function similarityReasons(members: Producer[]): SimilarityReason[] {
  const reasons: SimilarityReason[] = [];
  const texts = members.flatMap((member) => producerAlertTexts(member));
  const names = members.map((member) => normalizedPersonName(member)).filter(Boolean);
  if (new Set(names).size < names.length) reasons.push("name");
  if (texts.some((text) => /t[ée]l[ée]phone partag[ée]/i.test(text))) reasons.push("phone");
  return reasons;
}

/**
 * `same` : toutes les fiches sont la même personne ; `partial` : une partie seulement ;
 * `different` : personnes distinctes (un téléphone partagé seul ne suffit pas).
 */
export type Verdict = "same" | "partial" | "different";

export function verdictOf(members: Producer[]): { kind: Verdict; subsets: Producer[][] } {
  const subsets = identicalSubsets(members);
  const covered = new Set(subsets.flat().map((member) => member.id));
  if (!subsets.length) return { kind: "different", subsets };
  const everyone = covered.size === members.length && subsets.length === 1;
  return { kind: everyone ? "same" : "partial", subsets };
}

export interface ClosePlotPair {
  first: Plot;
  second: Plot;
  distanceM: number;
}

function plotCenter(plot: Plot): [number, number] | null {
  const ring = plot.repaired?.length ? plot.repaired : plot.raw;
  if (ring.length) {
    const lat = ring.reduce((sum, point) => sum + point[0], 0) / ring.length;
    const lng = ring.reduce((sum, point) => sum + point[1], 0) / ring.length;
    return [lat, lng];
  }
  return plot.centroid ? [plot.centroid.lat, plot.centroid.lng] : null;
}

/** Distance en mètres entre deux points (formule de haversine). */
export function distanceMeters(first: [number, number], second: [number, number]): number {
  const radius = 6371000;
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(second[0] - first[0]);
  const dLng = toRad(second[1] - first[1]);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(first[0])) * Math.cos(toRad(second[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Parcelles de fiches différentes dont les centres sont à moins de `thresholdM` mètres (chevauchement possible). */
export function closePlotPairs(plots: Plot[], thresholdM = 50): ClosePlotPair[] {
  const pairs: ClosePlotPair[] = [];
  for (let first = 0; first < plots.length; first += 1) {
    for (let second = first + 1; second < plots.length; second += 1) {
      const plotA = plots[first]!;
      const plotB = plots[second]!;
      if (plotA.producerId === plotB.producerId) continue;
      const centerA = plotCenter(plotA);
      const centerB = plotCenter(plotB);
      if (!centerA || !centerB) continue;
      const distanceM = distanceMeters(centerA, centerB);
      if (distanceM <= thresholdM) pairs.push({ first: plotA, second: plotB, distanceM });
    }
  }
  return pairs.sort((left, right) => left.distanceM - right.distanceM);
}
