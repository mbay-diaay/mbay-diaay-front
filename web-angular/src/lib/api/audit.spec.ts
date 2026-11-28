import { describe, expect, it } from "vitest";

import { auditEntryFromApi, filterAuditEntries } from "./audit";

const entries = [
  auditEntryFromApi({ id: "1", at: "2026-11-02T10:00:00Z", actor: "Awa Ndiaye", action: "Révélation CNI", target: "Producteur P1", detail: "Motif contrôle", scoopId: "s1" }),
  auditEntryFromApi({ id: "2", at: "2026-11-10T08:00:00Z", actor: "Moussa Fall", action: "Connexion", target: "Session", detail: "", scoopId: null }),
];

describe("auditEntryFromApi", () => {
  it("convertit acteur et cible, et normalise la SCOOP absente", () => {
    expect(entries[0]).toMatchObject({ user: "Awa Ndiaye", entity: "Producteur P1", scoopId: "s1" });
    expect(entries[1]!.scoopId).toBeUndefined();
    expect(entries[1]!.detail).toBe("");
  });
});

describe("filterAuditEntries", () => {
  it("cherche sans tenir compte des accents ni de la casse", () => {
    expect(filterAuditEntries(entries, { search: "revelation" }).map((entry) => entry.id)).toEqual(["1"]);
  });
  it("filtre par utilisateur et par période incluse", () => {
    expect(filterAuditEntries(entries, { user: "Moussa Fall" })).toHaveLength(1);
    expect(filterAuditEntries(entries, { from: "2026-11-02", to: "2026-11-02" })).toHaveLength(1);
    expect(filterAuditEntries(entries, { from: "2026-11-11" })).toHaveLength(0);
  });
});
