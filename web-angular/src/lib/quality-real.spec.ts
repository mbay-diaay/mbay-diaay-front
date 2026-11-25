import { describe, expect, it } from "vitest";

import type { Producer } from "@/lib/mock/data";
import { analyzeGroupConcordance, identicalSubsets, normalizedPersonName } from "@/lib/quality-real";

function producer(id: string, firstName: string, lastName: string, alerts: string[] = [], extra: Partial<Producer> = {}): Producer {
  return { id, code: id.toUpperCase(), firstName, lastName, history: [], survey: { alerts }, village: "Kayar", sex: "M", age: 40, scoopId: "sc1", ...extra } as unknown as Producer;
}

describe("identicalSubsets", () => {
  it("ne propose rien pour trois personnes différentes qui partagent un téléphone", () => {
    const members = [
      producer("a1", "Ibrahima", "Ba", ["Téléphone partagé avec : A2, A3"]),
      producer("a2", "Khardiata", "Sow", ["Téléphone partagé avec : A1, A3"]),
      producer("a3", "Libasse", "Ba", ["Téléphone partagé avec : A1, A2"]),
    ];
    expect(identicalSubsets(members)).toEqual([]);
  });

  it("ne propose rien pour une même CNI : une CNI répétée est normale (Q-12)", () => {
    const members = [
      producer("b1", "Moussa", "Diop", ["CNI identique à : B2"]),
      producer("b2", "Mamadou", "Diop"),
      producer("b3", "Awa", "Fall"),
    ];
    expect(identicalSubsets(members)).toEqual([]);
  });

  it("reconnaît le même nom malgré l'ordre inversé, les accents et la casse", () => {
    const members = [producer("c1", "Aïssatou", "Ndiaye"), producer("c2", "NDIAYE", "aissatou"), producer("c3", "Omar", "Sy")];
    const subsets = identicalSubsets(members);
    expect(subsets).toHaveLength(1);
    expect(subsets[0]!.map((member) => member.id)).toEqual(["c1", "c2"]);
    expect(normalizedPersonName(members[0]!)).toBe(normalizedPersonName(members[1]!));
  });
});

describe("analyzeGroupConcordance", () => {
  it("détecte des fiches 100% concordantes pour un même producteur (téléphone partagé)", () => {
    const group = {
      id: "phone-0",
      reason: "phone" as const,
      members: [
        producer("p1", "Moussa", "Diop", [], { cni: "12345", village: "Kayar", age: 45 }),
        producer("p2", "moussa", "diop", [], { cni: "12345", village: "Kayar", age: 45 }),
      ],
    };
    const res = analyzeGroupConcordance(group);
    expect(res.kind).toBe("identical");
    expect(res.toneKey).toBe("succes");
    expect(res.diffFields).toEqual([]);
  });

  it("détecte des écarts quand le téléphone est partagé, le nom identique et le village différent", () => {
    const group = {
      id: "phone-2",
      reason: "phone" as const,
      members: [
        producer("p1", "Moussa", "Diop", [], { cni: "12345", village: "Kayar" }),
        producer("p2", "Moussa", "Diop", [], { cni: "12345", village: "Mboro" }),
      ],
    };
    const res = analyzeGroupConcordance(group);
    expect(res.kind).toBe("differences");
    expect(res.toneKey).toBe("attente");
    expect(res.diffFields).toContain("village");
  });

  it("détecte des personnes distinctes quand un téléphone est partagé entre des noms différents", () => {
    const group = {
      id: "phone-1",
      reason: "phone" as const,
      members: [
        producer("p1", "Alioune", "Fall", [], { phone: "771234567" }),
        producer("p2", "Awa", "Fall", [], { phone: "771234567" }),
      ],
    };
    const res = analyzeGroupConcordance(group);
    expect(res.kind).toBe("distinct");
    expect(res.toneKey).toBe("info");
  });
});
