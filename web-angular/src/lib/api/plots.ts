import type {
  KoboPhoto,
  PhotoRole,
  Plot,
  PlotCropDetail,
  PlotSeason,
  PlotStatus,
} from "../mock/data";
import { apiFetch } from "./client";
import { mediaSrc } from "./media";
import { type Page, type PageQuery, withPage } from "./pagination";

/**
 * Parcelles, cultures, photos et rapport de l'import Kobo lus sur l'API (contrat d'import Kobo, routes `GET /plots`,
 * `GET /producers/:id/photos`, `GET /imports/kobo`). Les écrans lisent toujours le store : ces fonctions convertissent
 * les réponses vers les types de l'écran (`Plot`, `KoboPhoto`).
 */

// ------------------------------------------------------------------ Réponses

export type ApiSeason = PlotSeason;

export type ApiPlotCrop = {
  id: string;
  plotId: string;
  crop: string;
  cropRaw: string | null;
  sharePct: number | null;
  areaHa: number | null;
  variety: string | null;
  potentialYieldKgHa: number | null;
  potentialProductionKg: number | null;
  agroecologyUsed: boolean | null;
  agroecology: string[] | null;
  seasons: { chn: ApiSeason | null; cs: ApiSeason | null } | null;
  difficulties: string[] | null;
  alerts: string[] | null;
  observations: string | null;
};

export type ApiPhoto = {
  id: string;
  producerId: string | null;
  plotId: string | null;
  role: PhotoRole;
  takenAt: string | null;
  sizeBytes: number | null;
  /** URL absolue signée, valable 1 h. */
  url: string;
};

export type ApiPlot = {
  id: string;
  code: string;
  producerId: string;
  scoopId: string;
  orgId: string;
  number: number | null;
  landmark: string | null;
  village: string | null;
  centroid: { lat: number; lng: number; precisionM: number | null } | null;
  areaHa: number | null;
  declaredAreaHa: number | null;
  areaGapPct: number | null;
  cultivatedAreaHa: number | null;
  perimeterM: number | null;
  contourPoints: number | null;
  contourPrecisionM: number | null;
  contourValid: boolean | null;
  contourRepaired: boolean | null;
  distanceNeighbourKm: number | null;
  /** Anneau extérieur, points [lat, lng]. */
  contour: [number, number][] | null;
  status: PlotStatus;
  landStatus: string | null;
  landDocument: boolean | null;
  waterSource: string | null;
  exploitationState: string | null;
  infrastructures: string[] | null;
  mainCrop: string | null;
  alerts: string[] | null;
  observations: string | null;
  createdAt: string;
  crops: ApiPlotCrop[] | null;
  photos: ApiPhoto[] | null;
};

export type ApiKoboReport = {
  batch: { id: string; importedAt: string; counts: Record<string, number> };
  sheets: { sheet: string; rows: number }[];
  orphans: {
    geojsonPoints: { ref: string; data: Record<string, unknown> }[];
    photoFolders: { folder: string; files: number }[];
    unidentifiedPhotos: number;
    plotsWithoutCrop: string[];
    producersWithoutPhoto: string[];
    sharedCni: string[][];
    sharedPhone: string[][];
  };
};

// ---------------------------------------------------------------- Conversions

/** L'API renvoie les colonnes `numeric` tantôt en nombre, tantôt en texte : on ramène tout en nombre (ou null). */
const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toList = (value: string[] | null | undefined): string[] => (Array.isArray(value) ? value.filter(Boolean) : []);

const seasonFromApi = (season: ApiSeason | null | undefined): PlotSeason | null =>
  season
    ? {
        produced: !!season.produced,
        quantityKg: toNumber(season.quantityKg),
        yieldKgHa: toNumber(season.yieldKgHa),
        pricePerKg: toNumber(season.pricePerKg),
        valueFcfa: toNumber(season.valueFcfa),
        destinations: toList(season.destinations),
      }
    : null;

export function plotCropFromApi(row: ApiPlotCrop): PlotCropDetail {
  return {
    id: row.id,
    plotId: row.plotId,
    crop: row.crop,
    cropRaw: row.cropRaw ?? "",
    sharePct: toNumber(row.sharePct),
    areaHa: toNumber(row.areaHa),
    variety: row.variety ?? "",
    potentialYieldKgHa: toNumber(row.potentialYieldKgHa),
    potentialProductionKg: toNumber(row.potentialProductionKg),
    agroecologyUsed: row.agroecologyUsed,
    agroecology: toList(row.agroecology),
    seasons: { chn: seasonFromApi(row.seasons?.chn), cs: seasonFromApi(row.seasons?.cs) },
    difficulties: toList(row.difficulties),
    alerts: toList(row.alerts),
    observations: row.observations ?? "",
  };
}

export function photoFromApi(row: ApiPhoto): KoboPhoto {
  return {
    id: row.id,
    producerId: row.producerId,
    plotId: row.plotId,
    role: row.role,
    takenAt: row.takenAt,
    sizeBytes: row.sizeBytes ?? 0,
    url: mediaSrc(row.url) ?? row.url,
  };
}

/**
 * Parcelle de l'écran à partir de la parcelle de l'API. La campagne n'est pas portée par l'API : elle est complétée
 * par le store (campagne des cultures du producteur). Sans superficie déclarée, `declared` reprend la superficie
 * mesurée et `declaredKnown` vaut false.
 */
export function plotFromApi(row: ApiPlot): Plot {
  const measured = toNumber(row.areaHa) ?? 0;
  const declared = toNumber(row.declaredAreaHa);
  const precision = toNumber(row.contourPrecisionM) ?? toNumber(row.centroid?.precisionM) ?? 0;
  const versions: Plot["versions"] = [{ at: row.createdAt, label: "Relevé GPS (import Kobo)" }];
  if (row.contourRepaired) versions.push({ at: row.createdAt, label: "Contour réparé à l'import" });
  return {
    id: row.id,
    code: row.code,
    producerId: row.producerId,
    declared: declared ?? measured,
    measured,
    gpsPrecision: precision,
    status: row.status,
    raw: Array.isArray(row.contour) ? row.contour : [],
    crop: row.mainCrop || "Non renseignée",
    campaign: "",
    versions,
    scoopId: row.scoopId,
    orgId: row.orgId,
    number: toNumber(row.number) ?? undefined,
    landmark: row.landmark ?? "",
    village: row.village ?? "",
    centroid: row.centroid,
    declaredKnown: declared !== null,
    areaGapPct: toNumber(row.areaGapPct),
    cultivatedAreaHa: toNumber(row.cultivatedAreaHa),
    perimeterM: toNumber(row.perimeterM),
    contourPoints: toNumber(row.contourPoints),
    contourPrecisionM: toNumber(row.contourPrecisionM),
    contourValid: row.contourValid ?? undefined,
    contourRepaired: row.contourRepaired ?? undefined,
    distanceNeighbourKm: toNumber(row.distanceNeighbourKm),
    landStatus: row.landStatus ?? "",
    landDocument: row.landDocument,
    waterSource: row.waterSource ?? "",
    exploitationState: row.exploitationState ?? "",
    infrastructures: toList(row.infrastructures),
    alerts: toList(row.alerts),
    observations: row.observations ?? "",
    cropDetails: (row.crops ?? []).map(plotCropFromApi),
    photos: (row.photos ?? []).map(photoFromApi),
  };
}

// --------------------------------------------------------------------- Routes

/** Taille des paquets de `GET /plots` (le serveur accepte jusqu'à 500). */
export const PLOTS_PAGE_SIZE = 500;

export const listPlots = (query: PageQuery & Record<string, string | number | undefined> = {}) =>
  apiFetch<Page<ApiPlot>>(withPage("/plots", query));

export const getPlot = (id: string) => apiFetch<ApiPlot>(`/plots/${encodeURIComponent(id)}`);

/** Toutes les parcelles du périmètre du compte (paquets de 500). */
export async function fetchAllPlots(): Promise<Plot[]> {
  const rows: ApiPlot[] = [];
  for (let page = 1; ; page++) {
    const result = await listPlots({ page, limit: PLOTS_PAGE_SIZE });
    rows.push(...result.items);
    if (result.page >= result.pages || !result.items.length) break;
  }
  return rows.map(plotFromApi);
}

/** Toutes les photos d'un producteur et de ses parcelles. */
export const fetchProducerPhotos = async (producerId: string): Promise<KoboPhoto[]> =>
  (await apiFetch<ApiPhoto[]>(`/producers/${encodeURIComponent(producerId)}/photos`)).map(photoFromApi);

/** Rapport du dernier import Kobo : compteurs, feuilles et orphelins (aucune donnée sensible, seulement des codes). */
export const fetchKoboReport = () => apiFetch<ApiKoboReport>("/imports/kobo");
