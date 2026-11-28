import { apiFetch, ApiError } from "./client";

export interface ConsolideCooperativeRow {
  id: string;
  name: string;
  code: string;
  producers: number;
  members: number;
  organisations: number;
  plots: number;
  areaHa: number;
}

export interface ApiPage<Item> {
  total: number;
  page: number;
  limit: number;
  pages: number;
  items: Item[];
}

export interface ApiConsolideReport {
  batch: {
    id: string;
    importedAt: string | null;
    sourceFile: string | null;
  };
  totals: {
    producers: number;
    plots: number;
    organisations: number;
    members: number;
    areaHa: number;
  };
  cooperatives: ApiPage<ConsolideCooperativeRow>;
  toAttach: {
    producers: number;
    organisations: number;
    members: number;
    placementToConfirm: number;
  };
  duplicates: {
    strictGroups: number;
    strictExtraRows: number;
  };
  koboLink: {
    exactMatches: number;
    consolideOnly: number;
    koboOnly: number;
  };
  quality: {
    cniFormatIssues: number;
    missingPhone: number;
    sharedPhoneGroups: number;
    plotsWithoutContour: number;
  };
}

export interface ConsolideOrphanItem {
  kind: "producer" | "organisation";
  id: string;
  code: string;
  label: string;
  type: string | null;
  scoopId: string;
  sourceSheet: string | null;
  sourceRow: number | null;
}

export interface ConsolideDuplicateItem {
  id: string;
  code: string;
  sourceSheet: string | null;
  sourceRow: number | null;
}

export interface ConsolideDuplicateGroup {
  signatureHash: string;
  scoopId: string;
  count: number;
  items: ConsolideDuplicateItem[];
}

export interface ConsolideQualityIssue {
  kind: "cni_format" | "missing_phone" | "shared_phone" | "plot_without_contour";
  entityType: "producer" | "plot";
  id: string;
  code: string;
  scoopId: string;
  detail: string;
}

function buildPageQuery(page: number, limit: number): string {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("limit", String(limit));
  return params.toString();
}

/** Rapport principal de la base consolidée (avec tableau des coopératives paginé côté serveur). */
export const fetchConsolideReport = (page = 1, limit = 10) =>
  apiFetch<ApiConsolideReport>(`/imports/consolide?${buildPageQuery(page, limit)}`);

/** Liste paginée des éléments consolidés dans « Hors coopérative » (`hcr`). */
export const fetchConsolideOrphans = (page = 1, limit = 10) =>
  apiFetch<ApiPage<ConsolideOrphanItem>>(`/imports/consolide/orphans?${buildPageQuery(page, limit)}`);

/** Liste paginée des groupes de doublons stricts (codes uniquement). */
export const fetchConsolideDuplicates = (page = 1, limit = 10) =>
  apiFetch<ApiPage<ConsolideDuplicateGroup>>(`/imports/consolide/duplicates?${buildPageQuery(page, limit)}`);

/** Liste paginée des anomalies de qualité de la base consolidée. */
export const fetchConsolideQuality = (page = 1, limit = 10) =>
  apiFetch<ApiPage<ConsolideQualityIssue>>(`/imports/consolide/quality?${buildPageQuery(page, limit)}`);

export function isRateLimitError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 429;
}
