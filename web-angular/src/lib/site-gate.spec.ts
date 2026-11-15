import { describe, expect, it } from "vitest";

import { isAccessCode, isOpenPath, isUnlocked, safeRedirect, unlock } from "./site-gate";

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
};

describe("site en construction", () => {
  it("accepte le code sans tenir compte des majuscules, espaces et tirets", () => {
    expect(isAccessCode("CRADESC-NIAYES", "CRADESC-NIAYES")).toBe(true);
    expect(isAccessCode(" cradesc niayes ", "CRADESC-NIAYES")).toBe(true);
    expect(isAccessCode("cradesc", "CRADESC-NIAYES")).toBe(false);
    expect(isAccessCode("", "CRADESC-NIAYES")).toBe(false);
  });

  it("laisse ouverts le rapport et les liens de paiement, bloque le reste", () => {
    expect(isOpenPath("/architecture")).toBe(true);
    expect(isOpenPath("/architecture#f3")).toBe(true);
    expect(isOpenPath("/payer/abc123")).toBe(true);
    expect(isOpenPath("/construction?redirect=/login")).toBe(true);
    expect(isOpenPath("/")).toBe(false);
    expect(isOpenPath("/login")).toBe(false);
    expect(isOpenPath("/dashboard/cooperatives")).toBe(false);
    expect(isOpenPath("/architecture-secrete")).toBe(false);
  });

  it("garde l'accès dans le navigateur une fois le code saisi", () => {
    const storage = memory();
    expect(isUnlocked(storage)).toBe(false);
    unlock(storage);
    expect(isUnlocked(storage)).toBe(true);
  });

  it("ne renvoie jamais vers un autre site après le code", () => {
    expect(safeRedirect("/dashboard/producteurs")).toBe("/dashboard/producteurs");
    expect(safeRedirect("https://exemple.com")).toBe("/");
    expect(safeRedirect("//exemple.com")).toBe("/");
    expect(safeRedirect("/construction")).toBe("/");
    expect(safeRedirect(null)).toBe("/");
  });
});
