import { apiFetch } from "./client";
import { withPage, type PageMeta } from "./pagination";

export type SigFeature = {
  type: "Feature";
  id: string;
  geometry: { type: string; coordinates: unknown } | null;
  properties: {
    code: string;
    producerId: string;
    scoopId: string;
    village: string | null;
    crop: string | null;
    areaHa: number | null;
    status: string | null;
    precision: "contour" | "point" | "aucune";
    distanceM?: number;
  };
};

export type SigCollection = PageMeta & { type: "FeatureCollection"; features: SigFeature[] };

export type SigStatsDto = {
  plots: number;
  withContour: number;
  pointOnly: number;
  unlocated: number;
  mappedAreaHa: number;
  bbox: [number, number, number, number] | null;
  byScoop: { scoopId: string; plots: number; located: number }[];
};

export type SigCooperativeDto = {
  scoopId: string;
  name: string;
  producers: number;
  members: number;
  organisations: number;
  plots: number;
  located: number;
  areaHa: number;
  center: [number, number] | null;
  /** Cœur de la coopérative (là où ses parcelles sont les plus serrées) : la carte s'y pose à l'ouverture. */
  focus: [number, number] | null;
  bbox: [number, number, number, number] | null;
  hull: { type: string; coordinates: unknown } | null;
};

export const listSigCooperatives = () => apiFetch<{ items: SigCooperativeDto[] }>("/sig/cooperatives");

export type SigPlotDetailDto = {
  id: string;
  code: string;
  producer: { id: string; name: string; portraitUrl: string | null };
  scoopId: string;
  scoopName: string;
  village: string | null;
  landmark: string | null;
  crop: string | null;
  areaHa: number | null;
  status: string | null;
  photos: { id: string; role: string; url: string }[];
};

export const getSigPlot = (id: string) => apiFetch<SigPlotDetailDto>(`/sig/plots/${encodeURIComponent(id)}`);

export const getSigStats = () => apiFetch<SigStatsDto>("/sig/stats");

export const listSigPlots = (filters: {
  bbox?: string;
  scoopId?: string;
  organisationId?: string;
  producerId?: string;
  crop?: string;
  page?: number;
  limit?: number;
}) => apiFetch<SigCollection>(`/sig/plots${withPage("", filters)}`);

export const listSigNear = (filters: { lat: number; lng: number; radiusM?: number; page?: number; limit?: number }) =>
  apiFetch<SigCollection>(`/sig/plots/near${withPage("", filters)}`);

/** Toutes les pages d'une emprise (100 par page, plafond de sécurité), pour dessiner la couche. */
export async function loadSigViewport(
  filters: { bbox: string; scoopId?: string; organisationId?: string; producerId?: string; crop?: string },
  maxPages = 30,
  isStale: () => boolean = () => false,
): Promise<{ features: SigFeature[]; total: number }> {
  const features: SigFeature[] = [];
  let total = 0;
  for (let page = 1; page <= maxPages; page++) {
    const res = await listSigPlots({ ...filters, page, limit: 100 });
    if (isStale()) return { features, total };
    total = res.total;
    features.push(...res.features);
    if (res.page >= res.pages) break;
  }
  return { features, total };
}
