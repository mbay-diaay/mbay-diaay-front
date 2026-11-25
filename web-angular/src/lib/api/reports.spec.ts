import { describe, expect, it, vi } from "vitest";

vi.mock("./config", () => ({
  apiBaseUrl: () => "https://api.mbaydiaay.com/v1",
  isApiMode: () => true,
}));

import { buildGenerateBody, countRecentReports, latestReport, safeReportFileName, type ApiReport } from "./reports";
import { isEmailTakenError } from "./users";

const report = (id: string, createdAt: string, fileName = "rapport.csv"): ApiReport => ({
  id,
  kind: "effectifs",
  label: "Synthèse des effectifs",
  scoopId: null,
  createdAt,
  createdByName: "Personne Test",
  rows: 12,
  fileName,
});

describe("rapports : logique pure", () => {
  it("n'envoie que les champs renseignés", () => {
    expect(buildGenerateBody("effectifs", "")).toEqual({ kind: "effectifs" });
    expect(buildGenerateBody("effectifs", "s1", "2026-01-01", "2026-06-30")).toEqual({
      kind: "effectifs",
      scoopId: "s1",
      from: "2026-01-01",
      to: "2026-06-30",
    });
  });

  it("compte les rapports des 30 derniers jours", () => {
    const now = new Date("2026-11-25T10:00:00Z").getTime();
    const list = [report("a", "2026-11-20T10:00:00Z"), report("b", "2026-09-01T10:00:00Z")];
    expect(countRecentReports(list, now)).toBe(1);
  });

  it("trouve le rapport le plus récent", () => {
    const list = [report("a", "2026-11-01T10:00:00Z"), report("b", "2026-11-20T10:00:00Z")];
    expect(latestReport(list)?.id).toBe("b");
    expect(latestReport([])).toBeUndefined();
  });

  it("assainit le nom de fichier", () => {
    expect(safeReportFileName(report("a", "2026-11-01T10:00:00Z", "../../x.csv"))).toBe("x.csv");
    expect(safeReportFileName(report("a", "2026-11-01T10:00:00Z", ""))).toBe("synth_se_des_effectifs.csv");
  });

  it("reconnaît l'erreur EMAIL_TAKEN", () => {
    expect(isEmailTakenError({ status: 409, code: "EMAIL_TAKEN" })).toBe(true);
    expect(isEmailTakenError({ status: 409, code: "CONFLICT", details: { code: "EMAIL_TAKEN" } })).toBe(true);
    expect(isEmailTakenError({ status: 500, code: "X" })).toBe(false);
    expect(isEmailTakenError(null)).toBe(false);
  });
});
