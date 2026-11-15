import { describe, expect, it } from "vitest";

import { DOC_ROLES, MATRIX_COLUMNS, ROLE_DOCS, TOTAL_PERMISSIONS, matrixRow, permissionCount } from "./architecture-l2";

const cell = (role: (typeof DOC_ROLES)[number], key: string) =>
  matrixRow(role)[MATRIX_COLUMNS.findIndex((c) => c.key === key)]!;

describe("rapport L2", () => {
  it("présente 10 rôles, sans rôle réservé à l'administration de la plateforme", () => {
    expect(DOC_ROLES).toHaveLength(10);
    expect(DOC_ROLES as readonly string[]).not.toContain("superadmin");
    for (const role of DOC_ROLES) expect(ROLE_DOCS[role].compte.email).toMatch(/\.example$/);
  });

  it("calcule le tableau « Qui fait quoi » depuis les droits", () => {
    expect(cell("technicien", "dossiers").label).toBe("Crée");
    expect(cell("gestionnaire", "dossiers").label).toBe("Décide");
    expect(cell("admin", "producteurs").label).toBe("Gère + CNI");
    expect(cell("admin", "journal").label).toBe("Tout");
    expect(cell("surveillance", "journal").tone).toBe("scope");
    expect(cell("ventes", "producteurs").tone).toBe("none");
  });

  it("compte les droits de chaque rôle sur le total", () => {
    for (const role of DOC_ROLES) {
      expect(permissionCount(role)).toBeGreaterThan(0);
      expect(permissionCount(role)).toBeLessThanOrEqual(TOTAL_PERMISSIONS);
    }
  });
});
