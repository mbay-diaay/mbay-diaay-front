/**
 * Rappels de la coopérative : logique pure de la création pas à pas (types, destinataires autorisés, modèles de
 * message, phrases de règle, exemples datés, validation des étapes). Aucune donnée personnelle : les modèles sont
 * génériques. L'envoi réel relève du serveur (module `reminders`).
 */
import type { MessageKey } from "./i18n";
import type { ReminderChannel } from "./reminders";

export type ReminderRuleKind = "meeting" | "decision" | "dossier" | "contribution" | "custom";
export type ReminderAudience = "members" | "responsible" | "bureau" | "unpaid" | "manager" | "staff";

export const REMINDER_RULE_KINDS: readonly ReminderRuleKind[] = [
  "meeting",
  "decision",
  "dossier",
  "contribution",
  "custom",
];

export const REMINDER_AUDIENCES: readonly ReminderAudience[] = [
  "members",
  "responsible",
  "bureau",
  "unpaid",
  "manager",
  "staff",
];

export const REMINDER_CHANNEL_CHOICES: readonly ReminderChannel[] = ["app", "sms", "email"];

/** Bornes du nombre de jours (API : 0 à 60) ; un dossier sans réponse demande au moins un jour. */
export const REMINDER_DAYS_MAX = 60;
export const REMINDER_TITLE_MAX = 120;
export const REMINDER_MESSAGE_MAX = 1000;
/** Nombre maximal de personnes du personnel choisies pour un rappel (API : 100). */
export const REMINDER_RECIPIENTS_MAX = 100;
export const reminderDaysMin = (kind: ReminderRuleKind): number => (kind === "dossier" ? 1 : 0);

/** Destinataires permis par type de rappel, le premier étant proposé par défaut. */
export const AUDIENCES_BY_KIND: Record<ReminderRuleKind, readonly ReminderAudience[]> = {
  meeting: ["members", "bureau", "staff"],
  decision: ["responsible", "bureau", "members", "staff"],
  dossier: ["bureau", "manager", "members", "staff"],
  contribution: ["unpaid", "members", "staff"],
  custom: ["members", "responsible", "bureau", "unpaid", "manager", "staff"],
};

export const audiencesOf = (kind: ReminderRuleKind): readonly ReminderAudience[] => AUDIENCES_BY_KIND[kind];
export const defaultAudienceOf = (kind: ReminderRuleKind): ReminderAudience => AUDIENCES_BY_KIND[kind][0]!;
export const isAudienceAllowed = (kind: ReminderRuleKind, audience: ReminderAudience): boolean =>
  AUDIENCES_BY_KIND[kind].includes(audience);

/** Le choix des personnes n'existe que pour « mon personnel » avec une seule coopérative. */
export const canChooseRecipients = (draft: Pick<ReminderDraft, "audience" | "scoopIds">): boolean =>
  draft.audience === "staff" && draft.scoopIds.length === 1;

/** Personnes réellement envoyées à l'API : la liste choisie, ou vide (tout le personnel) hors du cas ci-dessus. */
export const recipientIdsOf = (draft: Pick<ReminderDraft, "audience" | "scoopIds" | "recipientIds">): string[] =>
  canChooseRecipients(draft) ? [...new Set(draft.recipientIds)] : [];

/** Nombre de personnes choisies d'un rappel (0 si tout le personnel ou une autre audience), tolérant un champ absent. */
export const recipientCountOf = (reminder: { audience: ReminderAudience; recipientIds?: readonly string[] | undefined }): number =>
  reminder.audience === "staff" ? (reminder.recipientIds?.length ?? 0) : 0;

/** Nombre de jours proposé au départ pour chaque type. */
export const DEFAULT_DAYS: Record<ReminderRuleKind, number> = {
  meeting: 3,
  decision: 3,
  dossier: 14,
  contribution: 7,
  custom: 1,
};

/** Modèles d'objet et de message (français, sans donnée personnelle), modifiables par l'utilisateur. */
const TEMPLATES: Record<ReminderRuleKind, { title: string; message: string }> = {
  meeting: {
    title: "Rappel : réunion de la coopérative",
    message:
      "Bonjour, une réunion de la coopérative approche. Merci de vous rendre disponible et de prévenir le bureau en cas d'empêchement.",
  },
  decision: {
    title: "Rappel : décision à rendre",
    message:
      "Bonjour, une décision prise en réunion arrive à échéance. Merci de faire le point et de tenir le bureau informé de son avancement.",
  },
  dossier: {
    title: "Rappel : dossier d'adhésion sans réponse",
    message:
      "Bonjour, un dossier d'adhésion attend une réponse depuis plusieurs jours. Merci de l'examiner et de donner suite.",
  },
  contribution: {
    title: "Rappel : cotisation à régler",
    message:
      "Bonjour, l'échéance de la cotisation approche. Merci de régler votre cotisation auprès de la coopérative dans les délais.",
  },
  custom: {
    title: "Rappel de la coopérative",
    message: "Bonjour, ceci est un rappel de la coopérative. Merci d'en prendre connaissance.",
  },
};

export const reminderTemplate = (kind: ReminderRuleKind): { title: string; message: string } => ({
  ...TEMPLATES[kind],
});

/** Brouillon de la création pas à pas (champs de saisie en texte). */
export interface ReminderDraft {
  kind: ReminderRuleKind | null;
  daysBefore: string;
  scoopIds: string[];
  audience: ReminderAudience | null;
  /** Comptes du personnel prévenus (audience « mon personnel », une seule coopérative) ; vide = tout le personnel. */
  recipientIds: string[];
  channels: ReminderChannel[];
  title: string;
  message: string;
}

export const REMINDER_STEPS = [1, 2, 3, 4] as const;
export type ReminderStep = (typeof REMINDER_STEPS)[number];

export type ReminderIssueField = "kind" | "daysBefore" | "scoopIds" | "audience" | "recipients" | "channels" | "title" | "message";
export interface ReminderIssue {
  field: ReminderIssueField;
  key: MessageKey;
  params?: Record<string, string | number>;
}

/** Nombre de jours saisi : entier dans les bornes du type, sinon `null`. */
export function parseReminderDays(raw: string, kind: ReminderRuleKind): number | null {
  const text = raw.trim();
  if (!/^\d+$/.test(text)) return null;
  const days = Number(text);
  return days >= reminderDaysMin(kind) && days <= REMINDER_DAYS_MAX ? days : null;
}

/** Erreurs de l'étape donnée, en clés i18n de langage simple (liste vide = on peut avancer). */
export function validateReminderStep(step: ReminderStep, draft: ReminderDraft): ReminderIssue[] {
  const issues: ReminderIssue[] = [];
  if (step === 1) {
    if (!draft.kind) issues.push({ field: "kind", key: "rappels.err.kind" });
  } else if (step === 2) {
    const kind = draft.kind ?? "custom";
    if (parseReminderDays(draft.daysBefore, kind) === null) {
      issues.push({
        field: "daysBefore",
        key: "rappels.err.days",
        params: { min: reminderDaysMin(kind), max: REMINDER_DAYS_MAX },
      });
    }
  } else if (step === 3) {
    if (!draft.scoopIds.length) issues.push({ field: "scoopIds", key: "rappels.err.scoops" });
    if (!draft.audience || (draft.kind && !isAudienceAllowed(draft.kind, draft.audience))) {
      issues.push({ field: "audience", key: "rappels.err.audience" });
    }
    if (recipientIdsOf(draft).length > REMINDER_RECIPIENTS_MAX) {
      issues.push({ field: "recipients", key: "rappels.err.recipients", params: { max: REMINDER_RECIPIENTS_MAX } });
    }
    if (!draft.channels.length) issues.push({ field: "channels", key: "rappels.err.channels" });
  } else {
    const title = draft.title.trim();
    if (!title) issues.push({ field: "title", key: "rappels.err.title.empty" });
    else if (title.length > REMINDER_TITLE_MAX)
      issues.push({ field: "title", key: "rappels.err.title.long", params: { max: REMINDER_TITLE_MAX } });
    if (draft.message.trim().length > REMINDER_MESSAGE_MAX)
      issues.push({ field: "message", key: "rappels.err.message.long", params: { max: REMINDER_MESSAGE_MAX } });
  }
  return issues;
}

/** Première étape (1 à 4) qui comporte une erreur, ou `null` si tout le brouillon est valide. */
export function firstInvalidStep(draft: ReminderDraft): ReminderStep | null {
  for (const step of REMINDER_STEPS) if (validateReminderStep(step, draft).length) return step;
  return null;
}

/** Unité de jours à traduire avec `{ count: days }` (« jour » pour 0 et 1, « jours » au-delà). */
export const DAYS_UNIT_KEY: MessageKey = "rappels.unit.autre";

/**
 * Phrase de règle du tableau, à traduire avec `params` (`count` choisit `.un` ou `.autre`) :
 * « 3 jours avant la réunion », « Le jour de la réunion » pour un délai nul, « Dossier sans réponse depuis 14 jours ».
 */
export function reminderWhen(
  kind: ReminderRuleKind,
  days: number,
): { key: MessageKey; params: { count: number } } {
  const isSameDay = days === 0 && kind !== "dossier";
  const key = (isSameDay ? `rappels.when.${kind}.same` : `rappels.when.${kind}.autre`) as MessageKey;
  return { key, params: { count: days } };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDay = (time: number): string => new Date(time).toISOString().slice(0, 10);

/**
 * Dates de l'exemple de l'étape « Quand ? » (jours civils UTC, `AAAA-MM-JJ`).
 * Réunion, décision, cotisation, personnalisé : l'événement a lieu `days` + 7 jours après `today`, le rappel part
 * `days` jours avant. Dossier : déposé aujourd'hui, relancé `days` jours plus tard.
 */
export function reminderExampleDates(
  kind: ReminderRuleKind,
  days: number,
  today: Date,
): { eventDate: string; reminderDate: string } {
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (kind === "dossier") return { eventDate: isoDay(start), reminderDate: isoDay(start + days * DAY_MS) };
  const eventTime = start + (days + 7) * DAY_MS;
  return { eventDate: isoDay(eventTime), reminderDate: isoDay(eventTime - days * DAY_MS) };
}

/** « 7 décembre » à partir d'un jour `AAAA-MM-JJ`. */
export function formatExampleDay(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

/** Phrase d'exemple datée, prête à traduire : « Pour une réunion le 7 décembre, le rappel part le 4 décembre. » */
export function reminderExample(
  kind: ReminderRuleKind,
  days: number,
  today: Date,
): { key: MessageKey; params: { date: string; reminder: string } } {
  const dates = reminderExampleDates(kind, days, today);
  return {
    key: `rappels.example.${kind}` as MessageKey,
    params: { date: formatExampleDay(dates.eventDate), reminder: formatExampleDay(dates.reminderDate) },
  };
}

/** Met la première lettre en minuscule (pour insérer une phrase du tableau au milieu d'une autre). */
export const lowerFirst = (text: string): string => (text ? text.charAt(0).toLowerCase() + text.slice(1) : text);
