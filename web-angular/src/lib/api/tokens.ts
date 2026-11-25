/**
 * Jeton d'accès : uniquement en mémoire (variable de module). Rien n'est écrit dans le navigateur
 * (aucun stockage du navigateur, aucun cookie lisible par le JavaScript). Le jeton de renouvellement
 * est un cookie HttpOnly posé par l'API : le JavaScript ne le voit jamais.
 */
let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string): void {
  accessToken = token;
}

export function clearTokens(): void {
  accessToken = null;
}
