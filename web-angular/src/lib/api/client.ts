import { apiBaseUrl } from "./config";
import { clearTokens, getAccessToken, setAccessToken } from "./tokens";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type RequestOpts = {
  method?: string;
  /** Objet JSON, ou `FormData` pour un envoi de fichier. */
  body?: unknown;
  auth?: boolean;
  /** Évite une boucle infinie sur refresh. */
  _retry?: boolean;
};

async function parseError(res: Response): Promise<ApiError> {
  try {
    const data = (await res.json()) as {
      code?: string;
      message?: string;
      details?: unknown;
    };
    return new ApiError(
      res.status,
      data.code ?? "HTTP_ERROR",
      data.message ?? res.statusText,
      data.details,
    );
  } catch {
    return new ApiError(res.status, "HTTP_ERROR", res.statusText);
  }
}

export async function apiFetch<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const base = apiBaseUrl();
  if (!base) throw new ApiError(0, "NO_API", "VITE_API_URL non configurée");

  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Client": "web",
  };
  const isForm = typeof FormData !== "undefined" && opts.body instanceof FormData;
  // FormData : le navigateur pose lui-même le Content-Type multipart (avec sa frontière).
  if (opts.body !== undefined && !isForm) headers["Content-Type"] = "application/json";
  if (opts.auth !== false) {
    const token = getAccessToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const init: RequestInit = {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    credentials: "include",
  };
  if (opts.body !== undefined) init.body = isForm ? (opts.body as FormData) : JSON.stringify(opts.body);

  const res = await fetch(`${base}${path.startsWith("/") ? path : `/${path}`}`, init);

  if (res.status === 401 && opts.auth !== false && !opts._retry) {
    const refreshed = await refreshSession();
    if (refreshed) return apiFetch<T>(path, { ...opts, _retry: true });
    clearTokens();
  }

  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Récupère un fichier (réponse non JSON) en `Blob`, avec le jeton d'accès et le renouvellement de session. */
export async function apiFetchBlob(path: string, _retry = false): Promise<Blob> {
  const base = apiBaseUrl();
  if (!base) throw new ApiError(0, "NO_API", "VITE_API_URL non configurée");
  const headers: Record<string, string> = { "X-Client": "web" };
  const token = getAccessToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${base}${path.startsWith("/") ? path : `/${path}`}`, {
    method: "GET",
    headers,
    credentials: "include",
  });
  if (res.status === 401 && !_retry) {
    if (await refreshSession()) return apiFetchBlob(path, true);
    clearTokens();
  }
  if (!res.ok) throw await parseError(res);
  return res.blob();
}

/** Renouvellement en cours : partagé entre toutes les requêtes et les onglets de la page (anti-course). */
let refreshInFlight: Promise<boolean> | null = null;

/**
 * Retrouve la session avec le cookie HttpOnly `mbd_refresh` (POST /auth/refresh sans corps).
 * Une seule requête à la fois : les appels simultanés attendent la même réponse.
 */
export function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function doRefresh(): Promise<boolean> {
  const base = apiBaseUrl();
  if (!base) return false;
  try {
    const res = await fetch(`${base}/auth/refresh`, {
      method: "POST",
      headers: { Accept: "application/json", "X-Client": "web" },
      credentials: "include",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { accessToken?: string };
    if (!data.accessToken) return false;
    setAccessToken(data.accessToken);
    return true;
  } catch {
    return false;
  }
}
