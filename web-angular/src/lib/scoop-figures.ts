import { isApiMode } from "./api/config";
import { ageAtMost } from "./format";
import type { State } from "./store";

/**
 * Chiffres d'une coopérative, dans la présentation de la base Kobo du CRADESC : producteurs (dont femmes, jeunes),
 * parcelles et superficie en hectares. `null` = inconnu : l'écran affiche « — ».
 * Mode API : uniquement `GET /scoops/stats` (jamais un calcul sur des données locales). Mode démonstration : calcul
 * sur les données fictives du store.
 */
export type ScoopFigures = {
  producers: number | null;
  women: number | null;
  youth: number | null;
  validated: number | null;
  toCheck: number | null;
  organisations: number | null;
  members: number | null;
  plots: number | null;
  plotAreaHa: number | null;
};

const UNKNOWN: ScoopFigures = {
  producers: null,
  women: null,
  youth: null,
  validated: null,
  toCheck: null,
  organisations: null,
  members: null,
  plots: null,
  plotAreaHa: null,
};

export function scoopFigures(state: State, scoopId: string): ScoopFigures {
  if (isApiMode()) {
    const stats = state.scoopStats[scoopId];
    if (!stats) return UNKNOWN;
    return {
      producers: stats.producers,
      women: stats.women,
      youth: stats.youth,
      validated: stats.producersValidated,
      toCheck: stats.producersToCheck,
      organisations: stats.organisations,
      members: stats.members,
      plots: stats.plots,
      plotAreaHa: stats.plotAreaHa,
    };
  }
  const producers = state.producers.filter((producer) => producer.scoopId === scoopId && !producer.mergedInto);
  const producerIds = new Set(producers.map((producer) => producer.id));
  const plots = state.plots.filter((plot) => producerIds.has(plot.producerId));
  return {
    producers: producers.length,
    women: producers.filter((producer) => producer.sex === "F").length,
    youth: producers.filter((producer) => ageAtMost(producer.age, state.youthMaxAge)).length,
    validated: producers.filter((producer) => producer.quality === "validé").length,
    toCheck: producers.filter((producer) => producer.quality === "à vérifier").length,
    organisations: state.orgs.filter((org) => org.scoopId === scoopId).length,
    members: state.members.filter((member) => member.scoopId === scoopId && member.status === "membre").length,
    plots: plots.length,
    plotAreaHa: plots.reduce((total, plot) => total + (plot.measured || plot.declared || 0), 0),
  };
}

/** Somme de chiffres connus ; `null` si aucun n'est connu (« — » plutôt qu'un faux zéro). */
export function sumKnown(values: (number | null)[]): number | null {
  const known = values.filter((value): value is number => value !== null);
  return known.length ? known.reduce((total, value) => total + value, 0) : null;
}
