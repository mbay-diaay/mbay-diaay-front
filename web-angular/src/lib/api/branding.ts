import type { MessageKey } from "../i18n";
import { ApiError, apiFetch } from "./client";

/** `color` : logo pour fonds clairs (connexion, e-mails). `inverse` : logo pour fonds foncés (menu). */
export type LogoVariant = "color" | "inverse";

/** Logos en vigueur (`GET /branding`, public). */
export type Branding = {
  logoUrl: string;
  logoInverseUrl: string;
  custom: { color: boolean; inverse: boolean };
  updatedAt: string | null;
  updatedBy: string | null;
};

export const MAIL_SAMPLE_TYPES = ["invitation", "meeting", "cancelled", "login", "technician"] as const;
export type MailSampleType = (typeof MAIL_SAMPLE_TYPES)[number];

export const fetchBranding = () => apiFetch<Branding>("/branding", { auth: false });

/** Super administrateur : remplace un logo (PNG ou JPEG, 2 Mo au plus). */
export function uploadBrandLogo(variant: LogoVariant, file: Blob) {
  const form = new FormData();
  form.append("file", file, "logo");
  return apiFetch<Branding>(`/branding/logo/${variant}`, { method: "PUT", body: form });
}

export const resetBrandLogo = (variant: LogoVariant) =>
  apiFetch<Branding>(`/branding/logo/${variant}/reset`, { method: "POST", body: {} });

export const fetchMailPreview = (type: MailSampleType) =>
  apiFetch<{ subject: string; html: string }>(`/branding/email-preview?type=${type}`);

export const sendMailTest = (type: MailSampleType) =>
  apiFetch<{ sent: boolean; to: string }>("/branding/email-test", { method: "POST", body: { type } });

/** Message d'une erreur de l'API sur l'identité visuelle. */
export function brandingApiError(error: unknown): MessageKey {
  if (error instanceof ApiError) {
    const cause = (error.details as { code?: string } | undefined)?.code ?? error.code;
    if (cause === "IMAGE_FORMAT") return "settings.err.format";
    if (cause === "IMAGE_TOO_LARGE" || error.status === 413) return "settings.err.size";
    if (cause === "MAIL_DISABLED") return "settings.err.mailDisabled";
    if (cause === "STORAGE_UNAVAILABLE" || error.status === 503) return "settings.err.storage";
    if (error.code === "FORBIDDEN") return "settings.err.forbidden";
  }
  return "settings.err.api";
}
