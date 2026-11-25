import { describe, expect, it } from "vitest";

import { differingFicheFields } from "./fiches-strictes";
import type { Plot, Producer } from "./mock/data";

const producer = (patch: Partial<Producer> = {}): Producer => ({
  id: "p-a",
  code: "NIA-S-TST-1",
  firstName: "Awa",
  lastName: "Fictive",
  sex: "F",
  age: 40,
  handicap: false,
  phone: "77 000 00 01",
  cni: "1000000000001",
  village: "Village test",
  scoopId: "s1",
  orgId: "o1",
  status: "recensé",
  quality: "validé",
  crops: [{ campaign: "2026", crop: "Oignon", area: 1 }],
  createdAt: "2026-01-01",
  enumerator: "Enquêteur test",
  history: [],
  ...patch,
});

const plot = (patch: Partial<Plot> = {}): Plot => ({
  id: "pl-a",
  code: "NIA-S-TST-1-P1",
  producerId: "p-a",
  declared: 1,
  measured: 1,
  gpsPrecision: 5,
  status: "relevée",
  raw: [
    [14.1, -16.1],
    [14.2, -16.2],
    [14.3, -16.1],
  ],
  crop: "Oignon",
  campaign: "2026",
  versions: [],
  ...patch,
});

describe("règle stricte de fusion (démonstration)", () => {
  it("deux fiches strictement identiques ne diffèrent sur aucun champ", () => {
    const first = producer();
    const second = producer({ id: "p-b", code: "NIA-S-TST-2" });
    expect(differingFicheFields(first, second, [plot()], [plot({ id: "pl-b", producerId: "p-b", code: "autre" })])).toEqual([]);
  });

  it("une seule différence, même d'un chiffre de CNI, bloque la fusion", () => {
    const differing = differingFicheFields(producer(), producer({ id: "p-b", cni: "1000000000002" }), [], []);
    expect(differing).toEqual(["cni"]);
  });

  it("la casse et les espaces internes comptent, pas les espaces de bord", () => {
    expect(differingFicheFields(producer(), producer({ id: "p-b", firstName: " Awa " }), [], [])).toEqual([]);
    expect(differingFicheFields(producer(), producer({ id: "p-b", firstName: "awa" }), [], [])).toEqual(["firstName"]);
    expect(differingFicheFields(producer(), producer({ id: "p-b", village: "Village  test" }), [], [])).toEqual(["village"]);
  });

  it("un point de contour différent ou une parcelle en plus bloque la fusion", () => {
    const moved = plot({
      id: "pl-b",
      producerId: "p-b",
      raw: [
        [14.1, -16.1],
        [14.2, -16.2],
        [14.31, -16.1],
      ],
    });
    expect(differingFicheFields(producer(), producer({ id: "p-b" }), [plot()], [moved])).toEqual(["plots"]);
    expect(differingFicheFields(producer(), producer({ id: "p-b" }), [plot()], [])).toEqual(["plots"]);
  });
});
