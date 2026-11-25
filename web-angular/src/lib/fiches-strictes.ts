import type { MessageKey } from "./i18n";
import type { Plot, Producer } from "./mock/data";

/**
 * Règle stricte de fusion (décision Q-02) pour le mode démonstration : deux fiches ne se fusionnent que si **toutes**
 * leurs informations sont strictement identiques, parcelles et données spatiales comprises. Le serveur applique la même
 * règle en mode API (`GET /producers/:keepId/compare`) ; ceci évite qu'une voie locale la contourne.
 * « Exact, c'est exact » : seules les espaces de bord sont ignorées (casse, accents et espaces internes comptent).
 */

export type FicheField =
  | "firstName"
  | "lastName"
  | "sex"
  | "age"
  | "handicap"
  | "phone"
  | "cni"
  | "village"
  | "scoopId"
  | "orgId"
  | "status"
  | "crops"
  | "enumerator"
  | "survey"
  | "plots";

/** Libellé français de chaque champ comparé. */
export const FICHE_FIELD_LABEL: Record<FicheField, MessageKey> = {
  firstName: "qualite.strict.field.firstName",
  lastName: "qualite.strict.field.lastName",
  sex: "qualite.strict.field.sex",
  age: "qualite.strict.field.age",
  handicap: "qualite.strict.field.handicap",
  phone: "qualite.strict.field.phone",
  cni: "qualite.strict.field.cni",
  village: "qualite.strict.field.village",
  scoopId: "qualite.strict.field.scoopId",
  orgId: "qualite.strict.field.orgId",
  status: "qualite.strict.field.status",
  crops: "qualite.strict.field.crops",
  enumerator: "qualite.strict.field.enumerator",
  survey: "qualite.strict.field.survey",
  plots: "qualite.strict.field.plots",
};

const text = (value: string | null | undefined): string => (value ?? "").trim();

/** Représentation stable d'une valeur : clés triées, listes dans l'ordre (triées à part quand l'ordre ne compte pas). */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([first], [second]) => first.localeCompare(second));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`).join(",")}}`;
  }
  return typeof value === "string" ? JSON.stringify(value.trim()) : JSON.stringify(value ?? null);
}

/** Parcelle comparée : ni son identifiant, ni son code, ni son propriétaire ne sont de l'information. */
function plotContent(plot: Plot): string {
  const { id: _id, code: _code, producerId: _producerId, versions: _versions, ...content } = plot;
  return stable(content);
}

const plotsContent = (plots: readonly Plot[]): string => stable(plots.map(plotContent).sort());

/** Champs qui diffèrent entre deux fiches (liste vide : strictement identiques). Jamais de valeur renvoyée. */
export function differingFicheFields(
  first: Producer,
  second: Producer,
  firstPlots: readonly Plot[],
  secondPlots: readonly Plot[],
): FicheField[] {
  const differing: FicheField[] = [];
  const check = (field: FicheField, left: unknown, right: unknown) => {
    if (stable(left) !== stable(right)) differing.push(field);
  };
  check("firstName", text(first.firstName), text(second.firstName));
  check("lastName", text(first.lastName), text(second.lastName));
  check("sex", first.sex, second.sex);
  check("age", first.age, second.age);
  check("handicap", first.handicap, second.handicap);
  check("phone", text(first.phone), text(second.phone));
  check("cni", text(first.cni), text(second.cni));
  check("village", text(first.village), text(second.village));
  check("scoopId", first.scoopId, second.scoopId);
  check("orgId", text(first.orgId), text(second.orgId));
  check("status", first.status, second.status);
  check("crops", [...first.crops].map(stable).sort(), [...second.crops].map(stable).sort());
  check("enumerator", text(first.enumerator), text(second.enumerator));
  check("survey", first.survey ?? null, second.survey ?? null);
  if (plotsContent(firstPlots) !== plotsContent(secondPlots)) differing.push("plots");
  return differing;
}
