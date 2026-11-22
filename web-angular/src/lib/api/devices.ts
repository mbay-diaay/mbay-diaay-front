import type { MessageKey } from "../i18n";
import type { RoleId } from "../permissions";
import { ApiError, apiFetch } from "./client";

/** Appareil tel que l'API le renvoie (`GET /devices`). */
export type ApiDevice = {
  id: string;
  userId: string;
  label: string;
  platform: string;
  appVersion: string;
  installationId: string;
  registeredAt: string;
  lastActiveAt: string;
  active: boolean;
  revokedAt: string | null;
  signOutRequestedAt: string | null;
};

export type ApiDeviceOwner = {
  id: string;
  name: string;
  email: string;
  role: RoleId;
  scoopIds: string[];
};

export type DevicesOverview = { devices: ApiDevice[]; owners: ApiDeviceOwner[] };

const path = (id: string, action = "") => `/devices/${encodeURIComponent(id)}${action}`;

/** Appareils des comptes du périmètre, avec leurs propriétaires. */
export const fetchDevices = () => apiFetch<DevicesOverview>("/devices");

export const renameDeviceOnApi = (id: string, label: string) =>
  apiFetch<ApiDevice>(path(id), { method: "PATCH", body: { label } });

/** Révoque : l'appareil ne peut plus renouveler sa session. */
export const revokeDeviceOnApi = (id: string) => apiFetch<ApiDevice>(path(id, "/revoke"), { method: "POST", body: {} });

export const reactivateDeviceOnApi = (id: string) =>
  apiFetch<ApiDevice>(path(id, "/reactivate"), { method: "POST", body: {} });

/** Déconnexion forcée : refusé jusqu'à la prochaine connexion de l'appareil. */
export const signOutDeviceOnApi = (id: string) => apiFetch<ApiDevice>(path(id, "/sign-out"), { method: "POST", body: {} });

/** Demande de resynchronisation : l'application l'apprend à sa prochaine inscription. */
export const resyncDeviceOnApi = (id: string) => apiFetch<ApiDevice>(path(id, "/resync"), { method: "POST", body: {} });

/** Message d'une erreur de l'API sur un appareil. */
export function deviceApiError(error: unknown): MessageKey {
  if (error instanceof ApiError) {
    if (error.code === "NOT_FOUND") return "appareils.err.notFound";
    if (error.code === "FORBIDDEN") return "appareils.err.forbidden";
  }
  return "appareils.err.api";
}
