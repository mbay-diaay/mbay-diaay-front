import { describe, expect, it } from "vitest";

import { sourceRowsOf } from "./origin";

describe("données d'origine du fichier", () => {
  it("recopie les valeurs telles quelles, sans les modifier", () => {
    expect(sourceRowsOf({ "Prénom": " Awa  Ndiaye ", "Âge": 45, "Vide": null })).toEqual([
      { column: "Prénom", value: " Awa  Ndiaye " },
      { column: "Âge", value: "45" },
      { column: "Vide", value: "" },
    ]);
    expect(sourceRowsOf([{ column: "Village", value: "Kayar" }, 3])).toEqual([{ column: "Village", value: "Kayar" }]);
  });

  it("ne produit aucune ligne pour une forme inconnue", () => {
    expect(sourceRowsOf(undefined)).toEqual([]);
    expect(sourceRowsOf("texte")).toEqual([]);
  });
});
