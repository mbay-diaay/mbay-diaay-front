import { describe, expect, it, vi } from "vitest";

vi.mock("./config", () => ({
  apiBaseUrl: () => "https://api.mbaydiaay.com/v1",
  isApiMode: () => true,
}));

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
