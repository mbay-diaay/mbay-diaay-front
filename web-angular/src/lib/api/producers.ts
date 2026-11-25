import type { MessageKey } from "../i18n";
import type {
  CorrectionChange,
  CorrectionRequest,
  CorrectionStatus,
  Producer,
  ProducerSurvey,
} from "../mock/data";
import type {
  DossierDecision,
  DossierDraft,
  DossierEvent,
  DossierStatus,
  ProducerDossier,
  RefusalReason,
} from "../mock/cooperative";
import { apiFetch, ApiError } from "./client";
import { originFromApi, type ApiOrigin } from "./origin";
import { mediaSrc } from "./media";
import { fetchAllPages, type Page, type PageQuery, withPage } from "./pagination";

/**
 * Producteurs, corrections et dossiers d'adhésion lus et écrits sur l'API (`docs/API_ROUTES_M1.md`, section
 * « Producteurs, corrections et dossiers d'adhésion »). La CNI et le téléphone arrivent masqués (« 1•••••••460 »,
 * « 77 ••• •• 85 ») : le clair ne passe que par les routes `reveal`.
 */

// ---------------------------------------------------------------- Producteurs

export type ApiProducer = ApiOrigin & {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  sex: "F" | "H";
  age: number | null;
  handicap: boolean;
  phoneMasked: string;
  cniMasked: string;
  village: string;
  scoopId: string;
  orgId: string;
  status: Producer["status"];
  quality: Producer["quality"];
  crops: Producer["crops"];
  createdAt: string;
  enumerator: string;
  history: Producer["history"];
  mergedInto: string | null;
  photoUrl: string | null;
  /** Fiche Kobo d'origine (import Kobo) ; absent sur une API plus ancienne. */
  koboUuid?: string | null;
  /** Enquête socio-économique Kobo (import Kobo). */
  survey?: ProducerSurvey | null;
};

/**
 * Fiche de l'écran à partir de la fiche de l'API. `cni` et `phone` portent la forme masquée : les masques de l'écran
 * (`maskCni`, `maskPhone`) gardent le premier et les derniers chiffres, ils la rendent donc à l'identique.
 */
export function producerFromApi(row: ApiProducer): Producer {
  const photoUrl = mediaSrc(row.photoUrl);
  return {
    id: row.id,
    code: row.code,
    firstName: row.firstName,
    lastName: row.lastName,
    sex: row.sex,
    age: row.age,
    handicap: row.handicap,
    phone: row.phoneMasked,
    cni: row.cniMasked,
    village: row.village,
    scoopId: row.scoopId,
    orgId: row.orgId,
    status: row.status,
    quality: row.quality,
    crops: row.crops,
    createdAt: row.createdAt,
    enumerator: row.enumerator,
    history: row.history,
    ...(row.mergedInto && { mergedInto: row.mergedInto }),
    ...(photoUrl && { photoUrl }),
    ...(row.koboUuid && { koboUuid: row.koboUuid }),
    ...(row.survey && { survey: surveyFromApi(row.survey) }),
    ...originFromApi(row),
  };
}

/** Listes de l'enquête toujours présentes (une API ancienne ou une ligne incomplète peut les omettre). */
function surveyFromApi(survey: ProducerSurvey): ProducerSurvey {
  return {
    ...survey,
    cropsPracticed: survey.cropsPracticed ?? [],
    difficulties: survey.difficulties ?? [],
    needs: survey.needs ?? [],
    alerts: survey.alerts ?? [],
    needsText: survey.needsText ?? "",
    observations: survey.observations ?? "",
  };
}

export const listProducers = (query: PageQuery & Record<string, string | number | undefined> = {}) =>
  apiFetch<Page<ApiProducer>>(withPage("/producers", query));

export const getProducer = (id: string) => apiFetch<ApiProducer>(`/producers/${encodeURIComponent(id)}`);

/** Toutes les fiches du périmètre du compte (paquets de 200). */
export async function fetchAllProducers(): Promise<Producer[]> {
  const rows = await fetchAllPages((page) => listProducers(page));
  return rows.map(producerFromApi);
}

export const revealCniOnApi = (id: string, reason: string) =>
  apiFetch<{ id: string; cni: string }>(`/producers/${encodeURIComponent(id)}/cni/reveal`, {
    method: "POST",
    body: { reason },
  });

export const revealPhoneOnApi = (id: string) =>
  apiFetch<{ id: string; phone: string }>(`/producers/${encodeURIComponent(id)}/phone/reveal`, {
    method: "POST",
    body: {},
  });

// ---------------------------------------------------------------- Corrections

export type ApiCorrection = {
  id: string;
  producerId: string;
  scoopId: string;
  requester: string;
  requestedAt: string;
  motif: string;
  changes: CorrectionChange[];
  status: CorrectionStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionComment: string | null;
};

export function correctionFromApi(row: ApiCorrection): CorrectionRequest {
  return {
    id: row.id,
    producerId: row.producerId,
    requester: row.requester,
    requestedAt: row.requestedAt,
    motif: row.motif,
    changes: row.changes,
    status: row.status,
    ...(row.decidedBy && { decidedBy: row.decidedBy }),
    ...(row.decidedAt && { decidedAt: row.decidedAt }),
    ...(row.decisionComment && { decisionComment: row.decisionComment }),
  };
}

export const fetchAllCorrections = async (): Promise<CorrectionRequest[]> =>
  (await fetchAllPages((page) => apiFetch<Page<ApiCorrection>>(withPage("/corrections", page)))).map(correctionFromApi);

export const submitCorrectionOnApi = (producerId: string, changes: CorrectionChange[], motif: string) =>
  apiFetch<ApiCorrection>(`/producers/${encodeURIComponent(producerId)}/corrections`, {
    method: "POST",
    body: { changes, motif },
  }).then(correctionFromApi);

export const decideCorrectionOnApi = (id: string, approved: boolean, comment: string) =>
  apiFetch<ApiCorrection>(`/corrections/${encodeURIComponent(id)}/decide`, {
    method: "POST",
    body: { approved, comment },
  }).then(correctionFromApi);

// -------------------------------------------------------------------- Dossiers

export type ApiDossier = {
  id: string;
  scoopId: string;
  createdBy: string;
  createdByEmail: string;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  submittedByEmail: string | null;
  status: DossierStatus;
  draft: DossierDraft;
  documentIds: string[];
  history: DossierEvent[];
  possibleDuplicateOf: string | null;
  producerId: string | null;
  decision: DossierDecision | null;
  remindedAt: string | null;
};

export const dossierFromApi = (row: ApiDossier): ProducerDossier => ({ ...row });

export const fetchAllDossiers = async (): Promise<ProducerDossier[]> =>
  (await fetchAllPages((page) => apiFetch<Page<ApiDossier>>(withPage("/dossiers", page)))).map(dossierFromApi);

/** L'aperçu local de la photo (`data:`) ne part pas : la photo se téléverse à part, après l'enregistrement. */
const draftBody = (draft: Partial<DossierDraft>) => {
  const { photoUrl: _photo, ...fields } = draft;
  return fields;
};

const dossierPath = (id: string, suffix = "") => `/dossiers/${encodeURIComponent(id)}${suffix}`;

export const createDossierOnApi = (scoopId: string, draft: DossierDraft) =>
  apiFetch<ApiDossier>("/dossiers", { method: "POST", body: { scoopId, draft: draftBody(draft) } }).then(dossierFromApi);

export const updateDossierOnApi = (id: string, draft: Partial<DossierDraft>) =>
  apiFetch<ApiDossier>(dossierPath(id), { method: "PUT", body: { draft: draftBody(draft) } }).then(dossierFromApi);

export const attachDocumentOnApi = (id: string, documentId: string) =>
  apiFetch<ApiDossier>(dossierPath(id, "/documents"), { method: "POST", body: { documentId } }).then(dossierFromApi);

export const detachDocumentOnApi = (id: string, documentId: string) =>
  apiFetch<ApiDossier>(dossierPath(id, `/documents/${encodeURIComponent(documentId)}`), { method: "DELETE" }).then(
    dossierFromApi,
  );

export const submitDossierOnApi = (id: string) =>
  apiFetch<ApiDossier>(dossierPath(id, "/submit"), { method: "POST", body: {} }).then(dossierFromApi);

export const startReviewOnApi = (id: string) =>
  apiFetch<ApiDossier>(dossierPath(id, "/review"), { method: "POST", body: {} }).then(dossierFromApi);

export const requestComplementOnApi = (id: string, message: string) =>
  apiFetch<ApiDossier>(dossierPath(id, "/complement"), { method: "POST", body: { message } }).then(dossierFromApi);

export const refuseDossierOnApi = (id: string, reason: RefusalReason, comment?: string) =>
  apiFetch<ApiDossier>(dossierPath(id, "/refuse"), {
    method: "POST",
    body: { reason, ...(comment?.trim() && { comment: comment.trim() }) },
  }).then(dossierFromApi);

export type ApproveResult = {
  dossier: ProducerDossier;
  producerId: string;
  selfApproved: boolean;
  memberRequested: boolean;
};

export const approveDossierOnApi = (
  id: string,
  options: { duplicate?: "lié" | "distinct"; createMember?: boolean; comment?: string },
) =>
  apiFetch<{ dossier: ApiDossier; producerId: string; selfApproved: boolean; memberRequested: boolean }>(
    dossierPath(id, "/approve"),
    { method: "POST", body: options },
  ).then((res) => ({ ...res, dossier: dossierFromApi(res.dossier) }) satisfies ApproveResult);

export const sendRemindersOnApi = () =>
  apiFetch<{ reminded: number }>("/dossiers/reminders", { method: "POST", body: {} });

// -------------------------------------------------------------------- Fusion

/** Fusionne la fiche `mergeId` dans `keepId` : parcelles, cultures, photos, adhésions et dossiers passent sur `keepId`. */
export const mergeProducers = (keepId: string, mergeId: string, comment?: string) =>
  apiFetch<ApiProducer>(`/producers/${encodeURIComponent(keepId)}/merge`, {
    method: "POST",
    body: { mergeId, ...(comment?.trim() && { comment: comment.trim() }) },
  }).then(producerFromApi);

/** Annule la fusion de `mergeId` dans `keepId`. */
export const unmergeProducers = (keepId: string, mergeId: string) =>
  apiFetch<ApiProducer>(`/producers/${encodeURIComponent(keepId)}/unmerge`, {
    method: "POST",
    body: { mergeId },
  }).then(producerFromApi);

/** Un champ qui diffère entre deux fiches (nom technique et libellé français ; jamais de valeur). */
export type DifferingField = { key: string; label: string };

/** Résultat de la comparaison stricte de deux fiches (`GET /producers/:keepId/compare`). */
export type StrictComparison = { identical: boolean; fields: DifferingField[] };

/**
 * Compare deux fiches avec la règle stricte de fusion : toutes les informations (identité, contact, CNI, coopérative,
 * parcelles et données spatiales…) doivent être identiques. Le serveur ne renvoie que les champs qui diffèrent.
 */
export const compareProducers = (keepId: string, mergeId: string) =>
  apiFetch<StrictComparison>(`/producers/${encodeURIComponent(keepId)}/compare?mergeId=${encodeURIComponent(mergeId)}`);

/** Champs d'une fiche corrigeables par `PATCH /producers/:id` (droit `producer.edit`) ; la CNI n'en fait pas partie. */
export type ProducerCorrection = {
  firstName?: string;
  lastName?: string;
  phone?: string;
  age?: number | null;
  status?: "recensé" | "membre";
  village?: string;
  orgId?: string;
  sex?: "F" | "H";
  handicap?: boolean;
};

/** Corrige une fiche après vérification : chaque champ changé laisse une ligne d'historique et d'audit côté serveur. */
export const correctProducerOnApi = (id: string, body: ProducerCorrection) =>
  apiFetch<ApiProducer>(`/producers/${encodeURIComponent(id)}`, { method: "PATCH", body }).then(producerFromApi);

/** Champs qui diffèrent dans une erreur `FICHES_DIFFERENTES` (libellés français du serveur), vide pour une autre erreur. */
export function differingFieldLabels(error: unknown): string[] {
  if (!(error instanceof ApiError)) return [];
  const details = error.details as { code?: string; labels?: unknown } | undefined;
  if ((details?.code ?? error.code) !== "FICHES_DIFFERENTES") return [];
  return Array.isArray(details?.labels) ? details.labels.filter((label): label is string => typeof label === "string") : [];
}

/** Clé de message française pour une erreur de fusion ou d'annulation de fusion. */
export function mergeErrorKey(error: unknown): MessageKey {
  if (error instanceof ApiError) {
    const cause = (error.details as { code?: string } | undefined)?.code ?? error.code;
    switch (cause) {
      case "FICHES_DIFFERENTES":
        return "qualite.merge.err.differentes";
      case "ALREADY_MERGED":
        return "qualite.merge.err.alreadyMerged";
      case "DIFFERENT_SCOOP":
        return "qualite.merge.err.differentScoop";
      case "ACCOUNT_LINK_CONFLICT":
        return "qualite.merge.err.accountLink";
      case "NOT_MERGED":
        return "qualite.merge.err.notMerged";
    }
    if (error.status === 0) return "qualite.merge.err.network";
    if (error.status === 403) return "qualite.merge.err.forbidden";
    if (error.status === 404) return "qualite.merge.err.notFound";
    if (error.status === 400 || error.status === 422) return "qualite.merge.err.invalid";
  }
  return "qualite.merge.err.generic";
}

// ------------------------------------------------------------------- Erreurs

/** Message français d'une erreur de l'API (le serveur écrit déjà ses messages en français). */
export function producerApiMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return fallback;
    const issues = (error.details as { issues?: { message: string }[] } | undefined)?.issues;
    if (issues?.length) return issues.map((issue) => issue.message).join(" ");
    if (error.message) return error.message;
  }
  return fallback;
}
