import type { MessageKey } from "@/lib/i18n";
import type { TranslateParams } from "@/lib/i18n/translate";
import type { Producer } from "@/lib/mock/data";

/**
 * Origine d'une donnée (colonne « Source » de l'espace Qualité) : base Kobo apurée du CRADESC, saisie dans
 * l'application, base consolidée des SCOOP (prévue, pas encore utilisée) ou administration CRADESC (demandes).
 * Fonctions pures : aucune lecture du store, aucune donnée de démonstration.
 */

export type DataSourceId = "kobo" | "consolidee" | "application" | "cradesc";

export interface DataSource {
  id: DataSourceId;
  labelKey: MessageKey;
  detailKey: MessageKey;
  /** Paramètres du détail (ex. `{ batch }` pour le lot d'import Kobo). */
  detailParams?: TranslateParams;
  icon: "database" | "edit" | "hub" | "account_balance";
  /** Pastille : jetons `--v2-*` uniquement. */
  bg: string;
  fg: string;
}

/** Plusieurs sources dans un même groupe : la liste des sources distinctes sert au détail. */
export interface DataSourceSummary {
  id: DataSourceId | "mixte";
  labelKey: MessageKey;
  /** Détail : celui de la source unique, ou « Fiches de plusieurs bases : … » (voir `describeSource`). */
  detailKey: MessageKey;
  detailParams?: TranslateParams;
  icon: DataSource["icon"] | "layers";
  bg: string;
  fg: string;
  /** Sources distinctes, dans l'ordre de première apparition. */
  parts: DataSource[];
}

const BASE: Record<DataSourceId, Omit<DataSource, "detailParams">> = {
  kobo: {
    id: "kobo",
    labelKey: "qualite.source.kobo",
    detailKey: "qualite.source.detail.koboNoBatch",
    icon: "database",
    bg: "var(--v2-sauge)",
    fg: "var(--v2-vert-pousse)",
  },
  consolidee: {
    id: "consolidee",
    labelKey: "qualite.source.consolidee",
    detailKey: "qualite.source.detail.consolidee",
    icon: "hub",
    bg: "var(--v2-culture-bg)",
    fg: "var(--v2-culture-fg)",
  },
  application: {
    id: "application",
    labelKey: "qualite.source.application",
    detailKey: "qualite.source.detail.application",
    icon: "edit",
    bg: "var(--v2-info-bg)",
    fg: "var(--v2-info-fg)",
  },
  cradesc: {
    id: "cradesc",
    labelKey: "qualite.source.cradesc",
    detailKey: "qualite.source.detail.cradesc",
    icon: "account_balance",
    bg: "var(--v2-foret)",
    fg: "var(--v2-citron)",
  },
};

/** Source par identifiant (filtres, pastilles). */
export function dataSourceOf(id: DataSourceId, batch?: string | null): DataSource {
  const base = BASE[id];
  if (id === "kobo" && batch) {
    return { ...base, detailKey: "qualite.source.detail.kobo", detailParams: { batch } };
  }
  return { ...base };
}

/** Source d'un producteur : `kobo` si la fiche vient de l'import Kobo (`koboUuid`), sinon `application`. */
export function sourceOfProducer(producer: Pick<Producer, "koboUuid" | "survey">): DataSource {
  const fromKobo = typeof producer.koboUuid === "string" && producer.koboUuid.trim() !== "";
  if (!fromKobo) return dataSourceOf("application");
  return dataSourceOf("kobo", producer.survey?.batch);
}

/** Source d'une demande envoyée par l'administration du CRADESC. */
export function sourceOfCoopRequest(): DataSource {
  return dataSourceOf("cradesc");
}

/** Source d'un groupe de fiches : la source commune, ou « Sources mélangées » quand les bases diffèrent. */
export function sourceOfGroup(producers: ReadonlyArray<Pick<Producer, "koboUuid" | "survey">>): DataSourceSummary {
  const parts: DataSource[] = [];
  for (const producer of producers) {
    const source = sourceOfProducer(producer);
    if (!parts.some((part) => part.id === source.id)) parts.push(source);
  }
  if (parts.length === 0) return { ...dataSourceOf("application"), parts: [dataSourceOf("application")] };
  if (parts.length === 1) return { ...parts[0]!, parts };
  return {
    id: "mixte",
    labelKey: "qualite.source.mixed",
    detailKey: "qualite.source.detail.mixed",
    icon: "layers",
    bg: "var(--v2-attente-bg)",
    fg: "var(--v2-attente-fg)",
    parts,
  };
}

/** Identifiants des sources utilisables comme filtre. */
export const SOURCE_FILTER_IDS: readonly DataSourceId[] = ["kobo", "application", "consolidee"];

type Translate = (key: MessageKey, params?: TranslateParams) => string;

/** Phrase de détail traduite ; pour un groupe mélangé, la liste « base : détail » de chaque source. */
export function describeSource(source: DataSource | DataSourceSummary, t: Translate): string {
  if ("parts" in source && source.id === "mixte") {
    const list = source.parts.map((part) => `${t(part.labelKey)} (${t(part.detailKey, part.detailParams)})`).join(" ; ");
    return t(source.detailKey, { list });
  }
  return t(source.detailKey, source.detailParams);
}
