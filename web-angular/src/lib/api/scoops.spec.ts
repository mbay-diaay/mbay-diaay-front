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

import { scoopFromApi, type ApiScoop } from "./scoops";

const base: ApiScoop = {
  id: "s12",
  name: "SCOOP Test",
  code: "TST",
  commune: "Thiès",
  region: null,
  createdAt: "2026-11-01T00:00:00.000Z",
  archived: false,
};

describe("scoopFromApi", () => {
  it("rend absolu le lien relatif du logo envoyé par l'API", () => {
    const scoop = scoopFromApi({ ...base, logoUrl: "/v1/media/abc?exp=1&sig=2" });
    expect(scoop.logoUrl).toBe("https://api.mbaydiaay.com/v1/media/abc?exp=1&sig=2");
  });

  it("laisse passer un aperçu local (data:) et l'absence de logo", () => {
    expect(scoopFromApi({ ...base, logoUrl: "data:image/png;base64,AAA" }).logoUrl).toBe("data:image/png;base64,AAA");
    expect(scoopFromApi(base).logoUrl).toBeUndefined();
  });
});

describe("transfert vers une coopérative", () => {
  it("donne un message français pour chaque refus du serveur", async () => {
    const { ApiError } = await import("./client");
    const { transferErrorKey } = await import("./scoops");
    expect(transferErrorKey(new ApiError(409, "CONFLICT", "x", { code: "TRANSFER_ALREADY_THERE" }))).toBe("transfert.err.alreadyThere");
    expect(transferErrorKey(new ApiError(409, "CONFLICT", "x", { code: "TRANSFER_MERGED_PRODUCER" }))).toBe("transfert.err.merged");
    expect(transferErrorKey(new ApiError(409, "CONFLICT", "x", { code: "ORG_NAME_TAKEN" }))).toBe("transfert.err.nameTaken");
    expect(transferErrorKey(new ApiError(409, "CONFLICT", "x", { code: "SCOOP_ARCHIVED" }))).toBe("transfert.err.archived");
    expect(transferErrorKey(new ApiError(404, "NOT_FOUND", "x"))).toBe("transfert.err.notFound");
    expect(transferErrorKey(new ApiError(403, "FORBIDDEN", "x"))).toBe("transfert.err.forbidden");
    expect(transferErrorKey(new Error("autre"))).toBe("transfert.err.generic");
  });

  it("la coopérative technique est reconnue par l'indicateur du serveur", () => {
    expect(scoopFromApi({ ...base, id: "hcr", technical: true }).technical).toBe(true);
    expect(scoopFromApi(base).technical).toBeUndefined();
  });
});
