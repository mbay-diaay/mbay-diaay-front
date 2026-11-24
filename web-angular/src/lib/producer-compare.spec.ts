import { describe, expect, it } from "vitest";

import type { Plot, Producer } from "@/lib/mock/data";
import {
  buildCompareRow,
  closePlotPairs,
  compareStatus,
  similarityReasons,
  summarizeRows,
  verdictOf,
} from "@/lib/producer-compare";

function producer(id: string, firstName: string, lastName: string, alerts: string[] = []): Producer {
  return { id, code: id.toUpperCase(), firstName, lastName, history: [], survey: { alerts } } as unknown as Producer;
}

function plot(id: string, producerId: string, lat: number, lng: number): Plot {
  return { id, code: id, producerId, raw: [[lat, lng]] } as unknown as Plot;
}

describe("compareStatus", () => {
  it("reconnaît des valeurs identiques malgré les accents, la casse et les espaces", () => {
    expect(compareStatus(["Thiès ", "thies"])).toBe("same");
  });

  it("repère une différence", () => {
    expect(compareStatus(["Pikine", "Thiès"])).toBe("different");
  });

  it("marque comme manquante une valeur vide sur une des fiches, ou sur toutes", () => {
    expect(compareStatus(["Pikine", ""])).toBe("missing");
    expect(compareStatus([null, undefined])).toBe("missing");
  });

  it("compare plus de deux fiches", () => {
    expect(compareStatus(["a", "a", "a"])).toBe("same");
    expect(compareStatus(["a", "a", "b"])).toBe("different");
  });
});

describe("summarizeRows", () => {
  it("compte les lignes par statut", () => {
    const rows = [buildCompareRow("Nom", ["A", "A"]), buildCompareRow("Village", ["X", "Y"]), buildCompareRow("Âge", ["", "30"])];
    expect(summarizeRows(rows)).toEqual({ same: 1, different: 1, missing: 1 });
  });
});

describe("verdictOf et similarityReasons", () => {
  it("dit « même personne » quand toutes les fiches ont la même CNI", () => {
    const members = [producer("a1", "Moussa", "Diop", ["CNI identique à : A2"]), producer("a2", "Mamadou", "Diop")];
    expect(verdictOf(members).kind).toBe("same");
    expect(similarityReasons(members)).toContain("cni");
  });

  it("dit « personnes différentes » pour un simple téléphone partagé", () => {
    const members = [
      producer("b1", "Ibrahima", "Ba", ["Téléphone partagé avec : B2"]),
      producer("b2", "Khardiata", "Sow", ["Téléphone partagé avec : B1"]),
    ];
    expect(verdictOf(members).kind).toBe("different");
    expect(similarityReasons(members)).toEqual(["phone"]);
  });

  it("dit « en partie » quand seule une partie des fiches est identique", () => {
    const members = [producer("c1", "Awa", "Fall"), producer("c2", "FALL", "awa"), producer("c3", "Omar", "Sy")];
    const verdict = verdictOf(members);
    expect(verdict.kind).toBe("partial");
    expect(similarityReasons(members)).toContain("name");
  });
});

describe("closePlotPairs", () => {
  it("relie des parcelles proches de fiches différentes, pas celles d'une même fiche", () => {
    const plots = [
      plot("p1", "a", 15.0, -16.0),
      plot("p2", "b", 15.0001, -16.0),
      plot("p3", "a", 15.0001, -16.0),
      plot("p4", "b", 15.5, -16.5),
    ];
    const pairs = closePlotPairs(plots);
    expect(pairs.map((pair) => [pair.first.id, pair.second.id])).toEqual([
      ["p2", "p3"],
      ["p1", "p2"],
    ]);
  });
});
