import { describe, expect, it } from "vitest";

import {
  dataSourceOf,
  describeSource,
  describeSourceFact,
  describeSourcePlace,
  sourceOfCoopRequest,
  sourceOfGroup,
  sourceOfProducer,
  sourceOfRecord,
} from "@/lib/data-source";

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

describe("origine lue sur le serveur (colonnes source_*)", () => {
  const t = (key: string, params?: Record<string, string | number>) => `${key}${params ? JSON.stringify(params) : ""}`;

  it("lit la base enregistrée, sans la déduire de l'identifiant Kobo", () => {
    // Une fiche consolidée garde sa base même si elle porte un identifiant Kobo (jamais de mélange silencieux).
    expect(sourceOfRecord({ sourceBase: "CONSOLIDE", koboUuid: "uuid-fictif" }).id).toBe("consolidee");
    expect(sourceOfRecord({ sourceBase: "KOBO" }).id).toBe("kobo");
    // Base nulle = créée sur la plateforme, même avec un identifiant Kobo parasite.
    expect(sourceOfRecord({ sourceBase: null, koboUuid: "uuid-fictif" }).id).toBe("application");
  });

  it("n'utilise la trace Kobo que si le serveur ne renvoie aucune origine", () => {
    expect(sourceOfRecord({ koboUuid: "uuid-fictif" }).id).toBe("kobo");
    expect(sourceOfRecord({}).id).toBe("application");
  });

  it("donne la feuille, la ligne et le fichier enregistrés", () => {
    const place = describeSourcePlace({ sourceBase: "CONSOLIDE", sourceSheet: "Membres", sourceRow: 12, sourceFile: "liste.xlsx" }, t as never);
    expect(place).toBe('source.place.sheet{"sheet":"Membres"} · source.place.row{"row":12} · source.place.file{"file":"liste.xlsx"}');
    expect(describeSourcePlace({ sourceBase: null }, t as never)).toBe("");
    expect(describeSourceFact({ sourceBase: "KOBO", sourceSheet: "Producteurs", sourceRow: 3 }, t as never)).toBe(
      'source.short.kobo · source.place.sheet{"sheet":"Producteurs"} · source.place.row{"row":3}',
    );
  });
});

describe("compteurs par base d'origine (Q-13 : aucun lien entre les bases)", () => {
  it("compte chaque base séparément", async () => {
    const { countBySource } = await import("./data-source");
    expect(
      countBySource([{ sourceBase: "KOBO" }, { sourceBase: "KOBO" }, { sourceBase: "CONSOLIDE" }, { sourceBase: null }]),
    ).toEqual({ kobo: 2, consolidee: 1, application: 1, cradesc: 0 });
  });
});
