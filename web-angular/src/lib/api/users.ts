import type { RoleId } from "../permissions";
import { apiFetch } from "./client";
import { type Page, type PageQuery, withPage } from "./pagination";

export type ApiUser = {
  id: string;
  email: string;
  name: string;
  role: RoleId;
  scoopId: string | null;
  /** Coopératives liées (technicien et faîtière : plusieurs). */
  scoopIds?: string[];
  phone: string | null;
  active: boolean;
  /** Technicien : sexe et âge saisis à la création. */
  sex?: "F" | "H" | null;
  age?: number | null;
  photoUrl?: string | null;
  /** Technicien : vrai tant qu'il n'a pas utilisé son code temporaire pour choisir son mot de passe. */
  activationPending?: boolean;
};

/** Une page d'utilisateurs (tri par nom). */
export function listUsers(query: PageQuery = {}) {
  return apiFetch<Page<ApiUser>>(withPage("/users", query));
}

export function createUser(body: {
  name: string;
  email: string;
  role: RoleId;
  scoopId?: string;
  scoopIds?: string[];
  phone?: string;
  password?: string;
}) {
  return apiFetch<ApiUser>("/users", { method: "POST", body });
}

export function toggleUserActive(id: string) {
  return apiFetch<ApiUser>(`/users/${id}/toggle-active`, { method: "POST", body: {} });
}

/** Modifie un compte (rôle, SCOOP…). Attribuer ou retirer le rôle super administrateur exige `role.configure`. */
export function updateUser(
  id: string,
  body: { role?: RoleId; scoopId?: string | null; scoopIds?: string[]; name?: string; phone?: string | null },
) {
  return apiFetch<ApiUser>(`/users/${id}`, { method: "PATCH", body });
}

/** Supprime définitivement un compte (droit `user.manage`, adresse e-mail retapée pour confirmer). */
export function deleteUser(id: string, confirmEmail: string) {
  return apiFetch<{ deleted: true }>(`/users/${id}/delete`, { method: "POST", body: { confirmEmail } });
}

/** Un gestionnaire crée un compte dans SA coopérative (rôle de coopérative ou sous-rôle de cette coopérative). */
export function createScoopAccount(
  scoopId: string,
  body: { name: string; email: string; role: RoleId; phone?: string },
) {
  return apiFetch<ApiUser>(`/scoops/${encodeURIComponent(scoopId)}/accounts`, { method: "POST", body });
}

/** Lie à la coopérative un technicien déjà inscrit ailleurs, par son adresse e-mail. */
export function linkTechnicianToScoop(scoopId: string, email: string) {
  return apiFetch<ApiUser>(`/scoops/${encodeURIComponent(scoopId)}/technicians/link`, {
    method: "POST",
    body: { email },
  });
}

/** Réponse de la création d'un technicien ou d'un nouveau code : le code n'est montré qu'ici, une seule fois. */
export type TechnicianCodeResult = {
  user: ApiUser;
  /** Code temporaire à 5 chiffres, à usage unique. */
  code: string;
  expiresAt: string;
  emailSent: boolean;
};

/** Ajoute un technicien à une coopérative : l'API génère le code temporaire et n'en garde que l'empreinte. */
export function createTechnician(
  scoopId: string,
  body: { name: string; phone: string; sex: "F" | "H"; age: number; email?: string },
) {
  return apiFetch<TechnicianCodeResult>(`/scoops/${encodeURIComponent(scoopId)}/technicians`, {
    method: "POST",
    body,
  });
}

/** Nouveau code (perdu ou expiré) : l'ancien cesse de marcher et le mot de passe déjà choisi est annulé. */
export function regenerateTechnicianCode(scoopId: string, userId: string) {
  return apiFetch<TechnicianCodeResult>(
    `/scoops/${encodeURIComponent(scoopId)}/technicians/${encodeURIComponent(userId)}/code`,
    { method: "POST", body: {} },
  );
}

/** Adresse technique donnée à un technicien créé par téléphone seul : elle ne s'affiche jamais. */
export function isTechnicalEmail(email: string): boolean {
  return email.endsWith("@technicien.mbaydiaay.local");
}
