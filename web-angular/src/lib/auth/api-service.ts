import { apiFetch, ApiError } from "../api/client";
import { clearTokens, setAccessToken } from "../api/tokens";
import type { RoleId } from "../permissions";
import { AuthError, type AuthService, type AuthUser, type CodeSent } from "./types";

type SignInResponse = CodeSent & { challengeId: string; demoHint?: string };
type TokenResponse = {
  accessToken: string;
  user: { id: string; email: string; name: string; role: RoleId; scoopId: string | null };
};

/** Code métier d'une erreur 400 : l'API le met dans `details.code` (le code de premier niveau vaut BAD_REQUEST). */
function detailCode(e: ApiError): string | undefined {
  const details = e.details;
  return details && typeof details === "object" && "code" in details
    ? String((details as { code: unknown }).code)
    : undefined;
}

function mapAuthError(e: unknown): never {
  if (e instanceof ApiError) {
    const map: Record<string, ConstructorParameters<typeof AuthError>[0]> = {
      INVALID_CREDENTIALS: "invalid_credentials",
      ACCOUNT_LOCKED: "locked",
      OTP_INVALID: "otp_invalid",
      OTP_EXPIRED: "otp_expired",
      OTP_ATTEMPTS: "otp_attempts",
      RATE_LIMITED: "rate_limited",
      REFRESH_INVALID: "reset_expired",
    };
    // L'API met le code métier dans `details.code` (le code de premier niveau est générique : UNAUTHORIZED, BAD_REQUEST…).
    const code =
      map[detailCode(e) ?? ""] ??
      map[e.code] ??
      (e.status === 429 ? "rate_limited" : "unavailable");
    const detail: { retryAfterMs?: number; attemptsLeft?: number } = {};
    if (e.details && typeof e.details === "object" && "retryAfterMs" in e.details) {
      detail.retryAfterMs = Number((e.details as { retryAfterMs: number }).retryAfterMs);
    }
    throw new AuthError(code, detail);
  }
  throw new AuthError("unavailable");
}

/**
 * Implémentation AuthService → API NestJS (`mbay-diaay-api`).
 * Les écrans login / OTP restent inchangés.
 */
export function createApiAuthService(): AuthService {
  return {
    async signIn(email, password) {
      try {
        return await apiFetch<SignInResponse>("/auth/sign-in", {
          method: "POST",
          body: { email, password },
          auth: false,
        });
      } catch (e) {
        mapAuthError(e);
      }
    },

    async verifyOtp(challengeId, code) {
      try {
        const data = await apiFetch<TokenResponse>("/auth/otp/verify", {
          method: "POST",
          body: { challengeId, code },
          auth: false,
        });
        setAccessToken(data.accessToken);
        const user: AuthUser = {
          email: data.user.email,
          name: data.user.name,
          role: data.user.role,
        };
        return user;
      } catch (e) {
        mapAuthError(e);
      }
    },

    async resendOtp(challengeId) {
      try {
        return await apiFetch<CodeSent>("/auth/otp/resend", {
          method: "POST",
          body: { challengeId },
          auth: false,
        });
      } catch (e) {
        mapAuthError(e);
      }
    },

    async requestPasswordReset(_email) {
      // Pas encore exposé côté API lot 1 — réponse neutre.
      const now = Date.now();
      return {
        maskedEmail: "***",
        expiresAt: now + 600_000,
        resendAvailableAt: now + 30_000,
      };
    },

    async verifyResetCode() {
      throw new AuthError("unavailable");
    },

    async resetPassword() {
      throw new AuthError("unavailable");
    },

    async invitationInfo(token) {
      try {
        return await apiFetch<{ name: string; email: string; maskedEmail: string }>(
          "/auth/invitation/info",
          {
            method: "POST",
            body: { token },
            auth: false,
          },
        );
      } catch (e) {
        if (e instanceof ApiError && e.status === 400) throw new AuthError("invitation_invalid");
        mapAuthError(e);
      }
    },

    async acceptInvitation(token, newPassword) {
      try {
        return await apiFetch<{ email: string; name: string; role: AuthUser["role"] }>(
          "/auth/invitation/accept",
          {
            method: "POST",
            body: { token, password: newPassword },
            auth: false,
          },
        );
      } catch (e) {
        // Mot de passe refusé par le serveur (règles de complexité) : message dédié plutôt que « indisponible ».
        if (e instanceof ApiError && e.status === 400)
          throw new AuthError(
            detailCode(e) === "INVITATION_INVALID" ? "invitation_invalid" : "weak_password",
          );
        mapAuthError(e);
      }
    },
  };
}

export function apiLogout() {
  // Le serveur efface le cookie de renouvellement (credentials inclus) ; ici on oublie le jeton en mémoire.
  clearTokens();
  void apiFetch("/auth/logout", { method: "POST", body: {}, auth: false }).catch(() => undefined);
}
