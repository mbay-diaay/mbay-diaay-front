/**
 * Rideau « site en construction » : tant que le code d'accès n'a pas été saisi dans ce navigateur, le site affiche
 * l'écran `/construction`. Ce n'est pas une sécurité (le code est dans le site publié) : la vraie protection reste la
 * connexion (mot de passe + code e-mail). Pour retirer le rideau à l'ouverture, passer `VITE_SITE_GATE=false`.
 *
 * Restent ouverts sans code : le rapport `/architecture` et les liens de paiement `/payer/…` envoyés aux adhérents.
 */

/** Code demandé. Se change par `VITE_SITE_ACCESS_CODE` au build (`.env.production`). */
export const SITE_ACCESS_CODE: string =
  ((import.meta.env["VITE_SITE_ACCESS_CODE"] as string | undefined) ?? "").trim() || "CRADESC-NIAYES";

/** Rideau actif sauf `VITE_SITE_GATE=false`. */
export const SITE_GATE_ENABLED: boolean =
  ((import.meta.env["VITE_SITE_GATE"] as string | undefined) ?? "true").trim().toLowerCase() !== "false";

export const SITE_GATE_PAGE = "/construction";
const STORAGE_KEY = "mbay.site-access";

/** Chemins ouverts sans code (préfixes). */
const OPEN_PATHS = ["/architecture", "/payer/", SITE_GATE_PAGE];

export function isOpenPath(url: string): boolean {
  const path = url.split(/[?#]/)[0] || "/";
  return OPEN_PATHS.some((prefix) => path === prefix || path.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`) || path === prefix.replace(/\/$/, ""));
}

/** Comparaison tolérante : majuscules, espaces et tirets ignorés (« cradesc niayes » vaut « CRADESC-NIAYES »). */
const normalize = (code: string) => code.toUpperCase().replace(/[\s\-_]/g, "");

export function isAccessCode(input: string, expected = SITE_ACCESS_CODE): boolean {
  const given = normalize(input);
  return given.length > 0 && given === normalize(expected);
}

/** Valeur gardée : liée au code, pour qu'un changement de code redemande l'accès à tout le monde. */
const marker = (expected = SITE_ACCESS_CODE) => `ok:${normalize(expected)}`;

export function isUnlocked(storage: Pick<Storage, "getItem"> | null = safeStorage()): boolean {
  if (!SITE_GATE_ENABLED) return true;
  try {
    return storage?.getItem(STORAGE_KEY) === marker();
  } catch {
    return false;
  }
}

export function unlock(storage: Pick<Storage, "setItem"> | null = safeStorage()): void {
  try {
    storage?.setItem(STORAGE_KEY, marker());
  } catch {
    // Stockage bloqué (navigation privée) : l'accès vaut pour cette visite seulement.
  }
  sessionUnlocked = true;
}

/** Repli quand le navigateur refuse le stockage : l'accès tient jusqu'au rechargement. */
let sessionUnlocked = false;
export const isUnlockedForSession = () => sessionUnlocked || isUnlocked();

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Adresse de retour après saisie du code : seulement un chemin interne, jamais un autre site. */
export function safeRedirect(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith(SITE_GATE_PAGE)) return "/";
  return raw;
}
