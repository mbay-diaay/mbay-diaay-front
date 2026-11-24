import type { MessageKey } from "../i18n";
import type { ReminderAudience, ReminderRuleKind } from "../reminder-templates";
import type { ReminderChannel } from "../reminders";
import { ApiError, apiFetch } from "./client";
import { fetchAllPages, withPage, type Page, type PageQuery } from "./pagination";

/** Une ligne de l'historique d'un rappel. */
export type ReminderHistoryEntry = { at: string; by: string; action: string };

/** Rappel tel que l'API le renvoie (`GET /reminders`). */
export type ReminderDto = {
  id: string;
  scoopId: string;
  scoopName: string;
  kind: ReminderRuleKind;
  title: string;
  message: string;
  daysBefore: number;
  channels: ReminderChannel[];
  audience: ReminderAudience;
  /** Personnel choisi (audience « staff ») ; vide = tout le personnel. */
  recipientIds: string[];
  recipients: { id: string; name: string }[];
  enabled: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** L'envoi automatique n'existe pas encore côté serveur : reste `null`. */
  lastSentAt: string | null;
  history: ReminderHistoryEntry[];
};

export type ReminderStatsDto = {
  total: number;
  enabled: number;
  paused: number;
  byKind: Record<ReminderRuleKind, number>;
  byChannel: Record<ReminderChannel, number>;
  lastSentAt: string | null;
};

export type ReminderCreateBody = {
  scoopId: string;
  kind: ReminderRuleKind;
  title: string;
  message?: string;
  daysBefore: number;
  channels: ReminderChannel[];
  audience: ReminderAudience;
  /** Uniquement avec l'audience « staff » (100 au plus). */
  recipientIds?: string[];
  enabled?: boolean;
};

/** Champs modifiables : la coopérative ne change pas. */
export type ReminderUpdateBody = Partial<Omit<ReminderCreateBody, "scoopId">>;

export type ReminderListQuery = PageQuery & {
  scoopId?: string;
  kind?: ReminderRuleKind;
  enabled?: boolean;
  q?: string;
};

const path = (id: string, action = "") => `/reminders/${encodeURIComponent(id)}${action}`;

export const listReminders = ({ enabled, ...query }: ReminderListQuery = {}) =>
  apiFetch<Page<ReminderDto>>(withPage("/reminders", { ...query, enabled: enabled === undefined ? undefined : String(enabled) }));

/** Tous les rappels du périmètre (paquets de 200). */
export const fetchAllReminders = (query: Omit<ReminderListQuery, "page" | "limit"> = {}) =>
  fetchAllPages<ReminderDto>((page) => listReminders({ ...query, ...page }));

export const fetchReminderStats = (scoopId?: string) =>
  apiFetch<ReminderStatsDto>(withPage("/reminders/stats", scoopId ? { scoopId } : {}));

export const getReminder = (id: string) => apiFetch<ReminderDto>(path(id));

export const createReminder = (body: ReminderCreateBody) =>
  apiFetch<ReminderDto>("/reminders", { method: "POST", body });

export const updateReminder = (id: string, body: ReminderUpdateBody) =>
  apiFetch<ReminderDto>(path(id), { method: "PATCH", body });

export const deleteReminder = (id: string) =>
  apiFetch<{ deleted: boolean }>(path(id, "/delete"), { method: "POST", body: {} });

/** Message d'une erreur de l'API sur un rappel, en langage simple. */
export function reminderApiError(error: unknown): MessageKey {
  if (error instanceof ApiError) {
    if (error.code === "NOT_FOUND") return "rappels.apiErr.notFound";
    if (error.code === "FORBIDDEN") return "rappels.apiErr.forbidden";
    if (error.code === "INVALID_RECIPIENTS") return "rappels.apiErr.recipients";
    if (error.status === 400 || error.code === "VALIDATION_ERROR") return "rappels.apiErr.invalid";
  }
  return "rappels.apiErr.generic";
}
