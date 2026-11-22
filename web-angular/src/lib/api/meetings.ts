import type { MessageKey } from "../i18n";
import type { ActionResult } from "../dossiers";
import type { DecisionStatus, Meeting, MeetingAudience, MeetingKind, MeetingMode } from "../mock/cooperative";
import { actions } from "../store";
import { ApiError, apiFetch } from "./client";
import { isApiMode } from "./config";
import { fetchAllPages, type Page, type PageQuery, withPage } from "./pagination";

/** Convocations envoyées par e-mail après une création, une modification ou une annulation. */
export type MeetingNotified = {
  /** `queue` : confiées au worker ; `inline` : parties tout de suite ; `off` : envoi d'e-mails non configuré. */
  mode: "queue" | "inline" | "off";
  queued: number;
  sent: number;
  failed: number;
  skipped: number;
};

/** Réunion telle que l'API la renvoie : même forme que celle du store (dates ISO), avec les convocations envoyées. */
export type ApiMeeting = Meeting & { notified?: MeetingNotified };

export function listMeetings(query: PageQuery = {}) {
  return apiFetch<Page<ApiMeeting>>(withPage("/meetings", query));
}

const path = (meetingId: string, suffix = "") => `/meetings/${encodeURIComponent(meetingId)}${suffix}`;

export type MeetingInput = {
  scoopId: string;
  kind: MeetingKind;
  title: string;
  date: string;
  place: string;
  agenda: string[];
  mode?: MeetingMode;
  onlineUrl?: string;
  audience?: MeetingAudience;
};
export type MeetingPatch = Partial<
  Pick<Meeting, "kind" | "title" | "date" | "place" | "agenda" | "mode" | "onlineUrl" | "audience">
>;

/** Code de l'API (`details.code` pour une erreur de règle, sinon le code HTTP) → message déjà traduit côté front. */
const ERROR_KEYS: Record<string, MessageKey> = {
  NOT_FOUND: "errors.meeting.notFound",
  FORBIDDEN: "errors.meeting.scope",
  SCOOP_ARCHIVED: "errors.scoop.archived",
  MEETING_FIELDS: "errors.meeting.fields",
  MEETING_LINK: "errors.meeting.link",
  MEETING_LOCKED: "errors.meeting.locked",
  MEETING_FUTURE: "errors.meeting.future",
  MEETING_ATTENDANCE: "errors.meeting.attendance",
  MEETING_CANCEL_REASON: "errors.meeting.cancelReason",
  MINUTES_LOCKED: "errors.meeting.minutesLocked",
  MINUTES_EMPTY: "errors.meeting.minutesEmpty",
  MINUTES_NONE: "errors.meeting.noMinutes",
  MINUTES_SELF_VALIDATION: "errors.meeting.selfValidation",
  MINUTES_DOCUMENT_EXISTS: "errors.meeting.docExists",
  DECISION_MEETING_NOT_HELD: "errors.decision.meetingNotHeld",
  DECISION_TEXT: "errors.decision.text",
  DECISION_OWNER: "errors.decision.owner",
  DECISION_DUE_DATE: "errors.decision.dueDate",
  DECISION_CLOSED: "errors.decision.closed",
  DECISION_CLOSING_NOTE: "errors.decision.closingNote",
};

export function meetingApiError(error: unknown): MessageKey {
  if (error instanceof ApiError) {
    const cause = (error.details as { code?: string } | undefined)?.code ?? error.code;
    return ERROR_KEYS[cause] ?? ERROR_KEYS[error.code] ?? "errors.users.api";
  }
  return "errors.users.api";
}

/** Appelle l'API, range la réunion renvoyée dans le store et rend le même résultat que les actions du store. */
async function call<T extends object>(
  request: Promise<ApiMeeting>,
  extra: (meeting: ApiMeeting) => T,
): Promise<ActionResult<T>> {
  try {
    const meeting = await request;
    actions.mergeMeetingFromApi(meeting);
    return { ok: true, ...extra(meeting) };
  } catch (error) {
    return { ok: false, error: meetingApiError(error) };
  }
}

/** Charge toutes les réunions du périmètre dans le store (mode API). Silencieux si l'API ne répond pas. */
export async function loadMeetingsIntoStore(): Promise<void> {
  if (!isApiMode()) return;
  try {
    actions.replaceMeetingsFromApi(await fetchAllPages(listMeetings));
  } catch {
    // Les réunions déjà en mémoire restent affichées ; l'erreur se verra à la prochaine action.
  }
}

/**
 * Actions « réunions » des écrans : en mode démonstration elles renvoient celles du store ; en mode API elles passent
 * par le serveur, qui garde le dernier mot (droits, périmètre, règles), et rendent le même résultat.
 */
export const meetingActions = {
  async create(input: MeetingInput): Promise<ActionResult<{ id: string; notified?: MeetingNotified }>> {
    if (!isApiMode()) return actions.createMeeting(input);
    return call(
      apiFetch<ApiMeeting>("/meetings", {
        method: "POST",
        body: { ...input, date: new Date(input.date).toISOString() },
      }),
      (meeting) => ({ id: meeting.id, ...(meeting.notified && { notified: meeting.notified }) }),
    );
  },
  async update(id: string, patch: MeetingPatch): Promise<ActionResult<{ notified?: MeetingNotified }>> {
    if (!isApiMode()) return actions.updateMeeting(id, patch);
    const body = { ...patch, ...(patch.date !== undefined && { date: new Date(patch.date).toISOString() }) };
    return call(apiFetch<ApiMeeting>(path(id), { method: "PATCH", body }), (meeting) => ({
      ...(meeting.notified && { notified: meeting.notified }),
    }));
  },
  async hold(id: string, presentIds: string[]): Promise<ActionResult> {
    if (!isApiMode()) return actions.holdMeeting(id, presentIds);
    return call(apiFetch<ApiMeeting>(path(id, "/hold"), { method: "POST", body: { presentIds } }), () => ({}));
  },
  async cancel(id: string, reason: string): Promise<ActionResult<{ notified?: MeetingNotified }>> {
    if (!isApiMode()) return actions.cancelMeeting(id, reason);
    return call(apiFetch<ApiMeeting>(path(id, "/cancel"), { method: "POST", body: { reason } }), (meeting) => ({
      ...(meeting.notified && { notified: meeting.notified }),
    }));
  },
  async saveMinutes(id: string, text: string): Promise<ActionResult> {
    if (!isApiMode()) return actions.saveMinutes(id, text);
    return call(apiFetch<ApiMeeting>(path(id, "/minutes"), { method: "PUT", body: { text } }), () => ({}));
  },
  async validateMinutes(id: string): Promise<ActionResult> {
    if (!isApiMode()) return actions.validateMinutes(id);
    return call(apiFetch<ApiMeeting>(path(id, "/minutes/validate"), { method: "POST", body: {} }), () => ({}));
  },
  /**
   * Rattache la version signée. Le document lui-même vit dans la bibliothèque (domaine « documents », branché à part) :
   * ici on garde l'ajout local du fichier puis on enregistre son identifiant côté réunion.
   */
  async attachMinutesDocument(
    id: string,
    input: { name: string; sizeKb: number; mime: string },
  ): Promise<ActionResult<{ id: string }>> {
    if (!isApiMode()) return actions.attachMinutesDocument(id, input);
    const local = actions.attachMinutesDocument(id, input);
    if (!local.ok) return local;
    return call(
      apiFetch<ApiMeeting>(path(id, "/minutes/document"), { method: "PUT", body: { documentId: local.id } }),
      () => ({ id: local.id }),
    );
  },
  async addDecision(
    meetingId: string,
    input: { text: string; ownerName: string; dueDate?: string | null },
  ): Promise<ActionResult<{ id: string }>> {
    if (!isApiMode()) return actions.addMeetingDecision(meetingId, input);
    return call(
      apiFetch<ApiMeeting>(path(meetingId, "/decisions"), { method: "POST", body: input }),
      (meeting) => ({ id: meeting.decisions[meeting.decisions.length - 1]?.id ?? "" }),
    );
  },
  async setDecisionStatus(
    meetingId: string,
    decisionId: string,
    status: DecisionStatus,
    closingNote = "",
  ): Promise<ActionResult> {
    if (!isApiMode()) return actions.setDecisionStatus(meetingId, decisionId, status, closingNote);
    return call(
      apiFetch<ApiMeeting>(path(meetingId, `/decisions/${encodeURIComponent(decisionId)}`), {
        method: "PATCH",
        body: { status, ...(closingNote && { closingNote }) },
      }),
      () => ({}),
    );
  },
};
