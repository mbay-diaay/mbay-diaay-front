import { describe, expect, it } from "vitest";

import { fr } from "@/lib/i18n/fr";
import { ORG_TYPES } from "@/lib/mock/data";

describe("types d'organisation (Q-18)", () => {
  it("reprennent exactement la liste de l'API, « Autre » et « À préciser » compris", () => {
    expect([...ORG_TYPES]).toEqual([
      "Individuel",
      "GIE",
      "Union",
      "Groupement",
      "Section",
      "Association",
      "OP",
      "Autre",
      "À préciser",
    ]);
  });

  it("ont tous un libellé et une aide d'une phrase en français", () => {
    for (const type of ORG_TYPES) {
      expect(`organisations.type.${type}` in fr).toBe(true);
      const helpKey = type === "À préciser" ? "orgtype.help.aPreciser" : `orgtype.help.${type}`;
      expect(helpKey in fr).toBe(true);
    }
  });
});
