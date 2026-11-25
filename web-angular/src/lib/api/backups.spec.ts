import { describe, expect, it } from "vitest";

import { backupFileName, formatBackupSize, isRestoreConfirmed } from "./backups";

describe("isRestoreConfirmed", () => {
  const id = "11111111-1111-1111-1111-111111111111";
  it("exige le mot exact et l'identifiant retapé", () => {
    expect(isRestoreConfirmed(id, "RESTAURER", id)).toBe(true);
    expect(isRestoreConfirmed(id, "restaurer", id)).toBe(false);
    expect(isRestoreConfirmed(id, "RESTAURER ", id)).toBe(false);
    expect(isRestoreConfirmed(id, "RESTAURER", "autre")).toBe(false);
    expect(isRestoreConfirmed(id, "", "")).toBe(false);
  });
});

describe("formatBackupSize", () => {
  it("choisit l'unité", () => {
    expect(formatBackupSize(512)).toBe("512 o");
    expect(formatBackupSize(2048)).toBe("2 Ko");
    expect(formatBackupSize(5 * 1024 * 1024)).toBe("5.0 Mo");
  });
});

describe("backupFileName", () => {
  it("contient la date et le début de l'identifiant", () => {
    expect(backupFileName({ id: "abcdef12-0000", createdAt: "2026-11-25T10:00:00.000Z" })).toBe(
      "mbay_diaay_sauvegarde_2026-11-25_abcdef12.json",
    );
  });
});
