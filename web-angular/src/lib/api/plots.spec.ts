import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { environment } from "../../environments/environment";

let previousApiUrl: string | null = null;
beforeAll(() => {
  previousApiUrl = environment.apiUrl;
  environment.apiUrl = "https://api.mbaydiaay.com/v1";
});
afterAll(() => {
  environment.apiUrl = previousApiUrl;
});

import { plotFromApi, type ApiPlot } from "./plots";

/** Parcelle fictive (aucune donnée réelle). */
const base: ApiPlot = {
  id: "NIA-S-TST-0001-P1",
  code: "NIA-S-TST-0001-P1",
  producerId: "NIA-S-TST-0001",
  scoopId: "s1",
  orgId: "op-s1-1",
  number: 1,
  landmark: "Près du puits",
  village: "Village test",
  centroid: { lat: 15.1, lng: -16.8, precisionM: 4 },
  areaHa: 0.42,
  declaredAreaHa: null,
  areaGapPct: null,
  cultivatedAreaHa: 0.3,
  perimeterM: 260,
  contourPoints: 12,
  contourPrecisionM: null,
  contourValid: true,
  contourRepaired: false,
  distanceNeighbourKm: 0.2,
  contour: [
    [15.1, -16.8],
    [15.101, -16.8],
    [15.101, -16.801],
  ],
  status: "validée",
  landStatus: "Propriétaire",
  landDocument: false,
  waterSource: "Puits",
  exploitationState: "Exploitée",
  infrastructures: ["Clôture", "Bassin"],
  mainCrop: "Oignon",
  alerts: [],
  observations: "",
  createdAt: "2026-10-05T00:00:00.000Z",
  crops: [
    {
      id: "NIA-S-TST-0001-P1-C1",
      plotId: "NIA-S-TST-0001-P1",
      crop: "Oignon",
      cropRaw: "oignon",
      sharePct: 100,
      areaHa: 0.42,
      variety: "Violet de Galmi",
      potentialYieldKgHa: 25000,
      potentialProductionKg: 10500,
      agroecologyUsed: true,
      agroecology: ["Rotation"],
      seasons: {
        chn: {
          produced: true,
          quantityKg: 8000,
          yieldKgHa: 19000,
          pricePerKg: 250,
          valueFcfa: 2000000,
          destinations: ["Vente via la SCOOP"],
        },
        cs: null,
      },
      difficulties: ["Intrants"],
      alerts: null,
      observations: null,
    },
  ],
  photos: [
    {
      id: "photo-1",
      producerId: "NIA-S-TST-0001",
      plotId: "NIA-S-TST-0001-P1",
      role: "parcelle",
      takenAt: null,
      sizeBytes: 1000,
      url: "/v1/photos/photo-1/file?exp=1&sig=2",
    },
  ],
};

describe("plotFromApi", () => {
  it("convertit la parcelle Kobo vers la parcelle de l'écran", () => {
    const plot = plotFromApi(base);
    expect(plot.measured).toBe(0.42);
    // Sans superficie déclarée, la déclarée reprend la mesurée et le drapeau le signale.
    expect(plot.declared).toBe(0.42);
    expect(plot.declaredKnown).toBe(false);
    // Précision du contour absente : celle du centre prend le relais.
    expect(plot.gpsPrecision).toBe(4);
    expect(plot.raw).toHaveLength(3);
    expect(plot.crop).toBe("Oignon");
    expect(plot.infrastructures).toEqual(["Clôture", "Bassin"]);
    expect(plot.cropDetails?.[0]?.seasons.chn?.valueFcfa).toBe(2000000);
    expect(plot.cropDetails?.[0]?.alerts).toEqual([]);
    expect(plot.photos?.[0]?.url).toBe("https://api.mbaydiaay.com/v1/photos/photo-1/file?exp=1&sig=2");
  });

  it("accepte les nombres envoyés en texte et un contour absent", () => {
    const plot = plotFromApi({
      ...base,
      areaHa: "1.5" as unknown as number,
      declaredAreaHa: "2" as unknown as number,
      contour: null,
      crops: null,
      photos: null,
    });
    expect(plot.measured).toBe(1.5);
    expect(plot.declared).toBe(2);
    expect(plot.declaredKnown).toBe(true);
    expect(plot.raw).toEqual([]);
    expect(plot.cropDetails).toEqual([]);
  });
});
