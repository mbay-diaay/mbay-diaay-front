import type { CoopRequestItem, CoopRequestKind } from "./api/coop-requests";
import { COOP_REQUEST_MESSAGE_MAX, COOP_REQUEST_SUBJECT_MAX } from "./api/coop-requests";
import { translate, type TranslateParams } from "./i18n/translate";
import type { MessageKey } from "./i18n";
import { explainAlert } from "./quality-real";

/**
 * Modèles de messages des demandes du CRADESC aux coopératives (fonctions pures).
 * Le message part par e-mail au gestionnaire : il est toujours écrit en français (jamais pseudo-wolof),
 * en langage simple, avec les codes producteur. Jamais de téléphone ni de CNI.
 */

const fr = (key: MessageKey, params?: TranslateParams): string => translate("fr", key, params);

/** Brouillon proposé à l'administrateur : modifiable avant l'envoi. */
export type CoopRequestDraft = { subject: string; message: string };

/** Série de 8 chiffres ou plus (téléphone, CNI), avec ou sans séparateurs : masquée par précaution. */
const LONG_NUMBER = /(?:\+?\d[\s.-]?){8,}/g;

/** Retire tout numéro long d'un texte avant de l'écrire dans un message. */
export function withoutPersonalNumbers(text: string): string {
  return text.replace(LONG_NUMBER, "[numéro masqué]");
}

/** Borne un texte à `max` caractères (avec « … »). */
export function clampText(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

const bulletList = (lines: readonly string[]): string => lines.map((line) => `- ${line}`).join("\n");

const finish = (draft: CoopRequestDraft): CoopRequestDraft => ({
  subject: clampText(draft.subject.trim(), COOP_REQUEST_SUBJECT_MAX),
  message: clampText(draft.message.trim(), COOP_REQUEST_MESSAGE_MAX),
});

/**
 * Doublon : « Les fiches A, B semblent concerner la même personne… ». Une seule fiche dans la coopérative
 * (l'autre est ailleurs) : un message adapté, car la fusion se fait au sein d'une même coopérative.
 */
export function duplicateDraft(input: { codes: readonly string[] }): CoopRequestDraft {
  const codes = input.codes.join(", ");
  return finish({
    subject: fr("demandes.tpl.doublon.subject", { codes }),
    message: fr(input.codes.length > 1 ? "demandes.tpl.doublon.message" : "demandes.tpl.doublon.messageOne", { codes }),
  });
}

/** Point signalé : texte d'alerte brut, avec le lieu (« P1 », « Tomate · P1 ») pour une parcelle ou une culture. */
export type CoopRequestPoint = string | { text: string; place?: string };

/** Fiche (ou parcelle, culture) à vérifier : la liste des points signalés, en langage simple. */
export function sheetDraft(input: {
  code: string;
  name: string;
  /** Textes d'alerte bruts du CRADESC ; les motifs connus sont expliqués simplement. */
  points: readonly CoopRequestPoint[];
}): CoopRequestDraft {
  const explained = input.points
    .map((point) => (typeof point === "string" ? { text: point.trim(), place: "" } : { text: point.text.trim(), place: (point.place ?? "").trim() }))
    .filter((point) => point.text || point.place)
    .map((point) => {
      const key = explainAlert(point.text);
      const line = withoutPersonalNumbers(key ? fr(key) : point.text);
      return point.place ? `${point.place} : ${line}` : line;
    });
  const unique = [...new Set(explained)];
  const who = { code: input.code, name: input.name.trim() };
  return finish({
    subject: fr("demandes.tpl.fiche.subject", who),
    message: unique.length
      ? fr("demandes.tpl.fiche.message", { ...who, points: bulletList(unique) })
      : fr("demandes.tpl.fiche.messageNoPoint", who),
  });
}

/** Alerte sur un producteur : même message qu'une fiche à vérifier, sujet « alerte ». */
export function alertDraft(input: { code: string; name: string; points: readonly CoopRequestPoint[] }): CoopRequestDraft {
  const sheet = sheetDraft(input);
  return finish({ subject: fr("demandes.tpl.alerte.subject", { code: input.code }), message: sheet.message });
}

/** Organisation à qualifier : le type n'est pas connu. */
export function organisationDraft(input: { name: string }): CoopRequestDraft {
  const name = input.name.trim();
  return finish({
    subject: fr("demandes.tpl.organisation.subject", { name }),
    message: fr("demandes.tpl.organisation.message", { name }),
  });
}

/** Demande libre. */
export function otherDraft(): CoopRequestDraft {
  return finish({ subject: fr("demandes.tpl.autre.subject"), message: fr("demandes.tpl.autre.message") });
}

/** Libellé d'un élément concerné : « Nom (CODE) » pour un producteur, sinon le nom seul. */
export function producerItem(producer: { id: string; code: string; firstName: string; lastName: string }): CoopRequestItem {
  return { type: "producer", id: producer.id, label: `${producer.firstName} ${producer.lastName}`.trim() + ` (${producer.code})` };
}

/** Répartit des éléments par coopérative (ordre d'apparition conservé). */
export function groupByScoop<T extends { scoopId: string }>(entries: readonly T[]): { scoopId: string; entries: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const entry of entries) groups.set(entry.scoopId, [...(groups.get(entry.scoopId) ?? []), entry]);
  return [...groups.entries()].map(([scoopId, list]) => ({ scoopId, entries: list }));
}

/** Seuls les chemins internes du tableau de bord sont acceptés comme lien (le serveur applique la même règle). */
export function isDashboardLink(link: string): boolean {
  return link.startsWith("/dashboard/") && !link.includes("//") && !/[\s\\]/.test(link);
}

export const KIND_LABEL_KEY: Record<CoopRequestKind, MessageKey> = {
  doublon: "demandes.kind.doublon",
  alerte: "demandes.kind.alerte",
  organisation: "demandes.kind.organisation",
  fiche: "demandes.kind.fiche",
  autre: "demandes.kind.autre",
};
