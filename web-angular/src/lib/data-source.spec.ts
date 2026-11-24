import { describe, expect, it } from "vitest";

import { dataSourceOf, describeSource, sourceOfCoopRequest, sourceOfGroup, sourceOfProducer } from "@/lib/data-source";

const fromKobo = { koboUuid: "uuid-fictif-1", survey: { batch: "kobo-lot-test" } } as never;
const fromKoboNoBatch = { koboUuid: "uuid-fictif-2" } as never;
const fromApplication = {} as never;

describe("sourceOfProducer", () => {
  it("reconnaît une fiche venue de l'import Kobo et cite le lot", () => {
    const source = sourceOfProducer(fromKobo);
    expect(source.id).toBe("kobo");
    expect(source.labelKey).toBe("qualite.source.kobo");
    expect(source.detailKey).toBe("qualite.source.detail.kobo");
    expect(source.detailParams).toEqual({ batch: "kobo-lot-test" });
  });

  it("garde un détail sans lot quand l'enquête n'est pas connue", () => {
    const source = sourceOfProducer(fromKoboNoBatch);
    expect(source.id).toBe("kobo");
    expect(source.detailKey).toBe("qualite.source.detail.koboNoBatch");
    expect(source.detailParams).toBeUndefined();
  });

  it("classe en « application » une fiche sans identifiant Kobo (ou vide)", () => {
    expect(sourceOfProducer(fromApplication).id).toBe("application");
    expect(sourceOfProducer({ koboUuid: "  " } as never).id).toBe("application");
  });
});

describe("sourceOfGroup", () => {
  it("rend la source commune quand toutes les fiches viennent de la même base", () => {
    const group = sourceOfGroup([fromKobo, fromKoboNoBatch]);
    expect(group.id).toBe("kobo");
    expect(group.parts).toHaveLength(1);
  });

  it("annonce des sources mélangées avec le détail de chaque base", () => {
    const group = sourceOfGroup([fromKobo, fromApplication, fromKobo]);
    expect(group.id).toBe("mixte");
    expect(group.labelKey).toBe("qualite.source.mixed");
    expect(group.parts.map((part) => part.id)).toEqual(["kobo", "application"]);
    const text = describeSource(group, (key, params) => `${key}${params ? JSON.stringify(params) : ""}`);
    expect(text).toContain("qualite.source.kobo");
    expect(text).toContain("qualite.source.application");
  });

  it("retombe sur « application » pour un groupe vide", () => {
    expect(sourceOfGroup([]).id).toBe("application");
  });
});

describe("autres sources", () => {
  it("prévoit la base consolidée et l'administration CRADESC", () => {
    expect(dataSourceOf("consolidee").labelKey).toBe("qualite.source.consolidee");
    expect(sourceOfCoopRequest().id).toBe("cradesc");
  });
});
