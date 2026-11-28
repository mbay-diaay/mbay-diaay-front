import { apiFetch } from "./client";
import { withPage, type Page, type PageQuery } from "./pagination";

export type CampaignStatusDto = "planifiée" | "en cours" | "clôturée";
export type CalendarStatusDto = "brouillon" | "validé" | "remplacé";
export type PlanStatusDto = "brouillon" | "validé" | "à jour";
export type OperationKindDto =
  | "préparation du sol"
  | "semis"
  | "repiquage"
  | "fertilisation"
  | "irrigation"
  | "désherbage"
  | "traitement"
  | "récolte";

export const OPERATION_KINDS: OperationKindDto[] = [
  "préparation du sol",
  "semis",
  "repiquage",
  "fertilisation",
  "irrigation",
  "désherbage",
  "traitement",
  "récolte",
];

export type HistoryEntryDto = { at: string; by: string; action: string };

export type CampaignDto = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: CampaignStatusDto;
  history: HistoryEntryDto[];
};

export type CalendarStepDto = {
  id: string;
  kind: OperationKindDto;
  offsetDays: number;
  durationDays: number;
  note: string;
};

export type CalendarDto = {
  id: string;
  crop: string;
  version: number;
  status: CalendarStatusDto;
  steps: CalendarStepDto[];
  createdBy: string;
  validatedBy: string | null;
  validatedAt: string | null;
};

export type PlanLineDto = { plotId: string | null; crop: string; areaHa: number; sowingMonth: string | null };

export type PlanDto = {
  id: string;
  scoopId: string;
  producerId: string | null;
  producerName: string;
  campaign: string;
  lines: PlanLineDto[];
  notes: string;
  status: PlanStatusDto;
  updatedAt: string;
};

export type OperationDto = {
  id: string;
  scoopId: string;
  planId: string;
  lineIndex: number;
  stepId: string | null;
  kind: OperationKindDto;
  doneAt: string;
  note: string;
};

export type AgronomyStatsDto = {
  campaigns: number;
  runningCampaign: string | null;
  validatedCalendars: number;
  plans: { total: number; brouillon: number; validé: number; "à jour": number };
  operations: number;
};

type Filters = PageQuery & Record<string, string | number | undefined>;

const query = (filters: Filters) => withPage("", filters);

export const getAgronomyStats = () => apiFetch<AgronomyStatsDto>("/agronomy/stats");

export const listCampaigns = (filters: Filters = {}) =>
  apiFetch<Page<CampaignDto>>(`/agronomy/campaigns${query(filters)}`);
export const createCampaign = (body: { name: string; startDate: string; endDate: string }) =>
  apiFetch<CampaignDto>("/agronomy/campaigns", { method: "POST", body });
export const setCampaignStatus = (id: string, status: CampaignStatusDto) =>
  apiFetch<CampaignDto>(`/agronomy/campaigns/${id}/status`, { method: "PATCH", body: { status } });
export const updateCampaign = (
  id: string,
  body: { name?: string; startDate?: string; endDate?: string },
) => apiFetch<CampaignDto>(`/agronomy/campaigns/${id}`, { method: "PATCH", body });

export const listCalendars = (filters: Filters = {}) =>
  apiFetch<Page<CalendarDto>>(`/agronomy/calendars${query(filters)}`);
export const createCalendar = (body: {
  crop: string;
  steps: { id: string; kind: OperationKindDto; offsetDays: number; durationDays: number; note?: string }[];
}) => apiFetch<CalendarDto>("/agronomy/calendars", { method: "POST", body });
export const validateCalendar = (id: string) =>
  apiFetch<CalendarDto>(`/agronomy/calendars/${id}/validate`, { method: "POST", body: {} });
export const updateCalendar = (
  id: string,
  body: {
    crop?: string;
    steps?: { id: string; kind: OperationKindDto; offsetDays: number; durationDays: number; note?: string }[];
  },
) => apiFetch<CalendarDto>(`/agronomy/calendars/${id}`, { method: "PATCH", body });

export const listPlans = (filters: Filters = {}) => apiFetch<Page<PlanDto>>(`/agronomy/plans${query(filters)}`);
export const createPlan = (body: {
  scoopId: string;
  producerId?: string;
  producerName: string;
  campaign: string;
  lines: { crop: string; areaHa: number; sowingMonth?: string }[];
  notes?: string;
}) => apiFetch<PlanDto>("/agronomy/plans", { method: "POST", body });
export const validatePlan = (id: string) =>
  apiFetch<PlanDto>(`/agronomy/plans/${id}/validate`, { method: "POST", body: {} });
export const updatePlan = (
  id: string,
  body: {
    campaign?: string;
    lines?: { crop: string; areaHa: number; sowingMonth?: string }[];
    notes?: string;
  },
) => apiFetch<PlanDto>(`/agronomy/plans/${id}`, { method: "PATCH", body });

export const listOperations = (filters: Filters = {}) =>
  apiFetch<Page<OperationDto>>(`/agronomy/operations${query(filters)}`);
export const createOperation = (body: {
  planId: string;
  lineIndex: number;
  stepId?: string;
  kind: OperationKindDto;
  doneAt: string;
  note?: string;
}) => apiFetch<OperationDto>("/agronomy/operations", { method: "POST", body });
export const updateOperation = (
  id: string,
  body: { kind?: OperationKindDto; doneAt?: string; note?: string },
) => apiFetch<OperationDto>(`/agronomy/operations/${id}`, { method: "PATCH", body });
export const deleteOperation = (id: string) =>
  apiFetch<{ deleted: boolean; id: string }>(`/agronomy/operations/${id}`, { method: "DELETE" });
