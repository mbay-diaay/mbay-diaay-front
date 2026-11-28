/**
 * Barrel i18n : seuls les exports indépendants du framework sont conservés ; la langue en cours
 * se lit via LocaleService (src/app/shared/locale.service.ts). Plusieurs fichiers src/lib/*.ts
 * importent `tNow`/`MessageKey`/`TranslateParams` depuis ce chemin.
 *
 * Wolof is lazy-loaded via `ensureWolofLoaded` (not re-exported as a static `wo`).
 */
export { fr, type MessageKey, type Messages } from "./fr";
export {
  translate,
  translateEnum,
  tNow,
  setCurrentLocale,
  interpolate,
  missingWolofKeys,
  ensureWolofLoaded,
  type Locale,
  type TranslateParams,
} from "./translate";
export { formatNumber, formatDate } from "./format";
export { initialLocale, isLocale } from "./storage";
