import { apiFetch, apiFetchBlob } from "./client";
import { type Page, type PageQuery, withPage } from "./pagination";

/** Un type de rapport proposé par le serveur (`GET /reports/kinds`), selon les droits de la session. */
export type ReportKind = { kind: string; label: string };

/** Un rapport généré, tel que conservé dans l'historique du serveur. */
export type ApiReport = {
  id: string;
  kind: string;
  label: string;
  scoopId: string | null;
  createdAt: string;
  createdByName: string;
  rows: number;
  fileName: string;
};

export type GenerateReportBody = { kind: string; scoopId?: string; from?: string; to?: string };

export function listReportKinds() {
  return apiFetch<ReportKind[]>("/reports/kinds");
}

/** Génère le rapport : le serveur le calcule, le conserve et l'inscrit au journal d'audit. */
export function generateReportOnApi(body: GenerateReportBody) {
  return apiFetch<ApiReport>("/reports", { method: "POST", body });
}

/** Une page de l'historique (les plus récents d'abord). */
export function listReports(query: PageQuery = {}) {
  return apiFetch<Page<ApiReport>>(withPage("/reports", query));
}

/** Le fichier CSV d'un rapport (le téléchargement est audité par le serveur). */
export function downloadReportBlob(id: string) {
  return apiFetchBlob(`/reports/${encodeURIComponent(id)}/download`);
}

/** Corps de la demande de génération : seules les valeurs renseignées partent. */
export function buildGenerateBody(kind: string, scoopId: string, from = "", to = ""): GenerateReportBody {
  return {
    kind,
    ...(scoopId ? { scoopId } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
}

/** Nombre de rapports créés dans les `days` derniers jours (par rapport à `now`). */
export function countRecentReports(reports: readonly ApiReport[], now: number, days = 30): number {
  const limit = now - days * 86_400_000;
  return reports.filter((report) => new Date(report.createdAt).getTime() >= limit).length;
}

/** Le rapport le plus récent d'une liste, ou `undefined`. */
export function latestReport(reports: readonly ApiReport[]): ApiReport | undefined {
  return reports.reduce<ApiReport | undefined>(
    (best, report) => (!best || report.createdAt > best.createdAt ? report : best),
    undefined,
  );
}

/** Nom de fichier sûr (sans chemin) pour l'enregistrement ; repli sur le libellé du rapport. */
export function safeReportFileName(report: Pick<ApiReport, "fileName" | "label">): string {
  const raw = (report.fileName || "").split(/[\\/]/).pop()?.trim() ?? "";
  if (raw) return raw;
  const base = report.label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "rapport";
  return `${base}.csv`;
}

/** Enregistre un blob comme fichier téléchargé (navigateur seulement). */
export function saveBlobAsFile(blob: Blob, fileName: string): void {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);
}
