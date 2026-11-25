import { DOCUMENT, Injectable, computed, effect, inject, signal, untracked } from "@angular/core";
import { formatDate, formatNumber } from "@/lib/i18n/format";
import { initialLocale, isLocale } from "@/lib/i18n/storage";
import { PreferencesService } from "./preferences.service";
import {
  ensureWolofLoaded,
  setCurrentLocale,
  translate,
  translateEnum,
  type Locale,
  type TranslateParams,
} from "@/lib/i18n/translate";
import type { MessageKey } from "@/lib/i18n/fr";

/**
 * Angular replacement for the React app's LocaleProvider/I18nContext
 * (src/lib/i18n/context.ts, LocaleProvider.tsx, use-i18n.ts). Wraps the same
 * framework-agnostic translate()/formatNumber()/formatDate() functions copied
 * verbatim into src/lib/i18n/ — only the reactive binding changes (Angular
 * signal instead of a React context).
 */
@Injectable({ providedIn: "root" })
export class LocaleService {
  private readonly localeSignal = signal<Locale>(initialLocale());
  readonly locale = this.localeSignal.asReadonly();
  /**
   * Incrémenté quand le dictionnaire wolof (chargé à la demande) arrive. Sans lui, un rechargement
   * en wolof posait `localeSignal` à "wo" avant le chargement, puis `set("wo")` ne changeait rien :
   * l'écran restait en français.
   */
  private readonly dictionaryVersion = signal(0);

  private readonly document = inject(DOCUMENT);
  private readonly preferences = inject(PreferencesService);

  constructor() {
    // `<html lang>` suit la langue affichée : lecteurs d'écran et césure (WCAG 3.1.1).
    effect(() => {
      this.document.documentElement.lang = this.localeSignal();
    });
    // Après connexion, la langue enregistrée sur le serveur s'applique (sans la réécrire).
    effect(() => {
      const saved = this.preferences.preferences().locale;
      if (saved && saved !== untracked(this.localeSignal)) this.applyLocale(saved);
    });
    const initial = this.localeSignal();
    setCurrentLocale(initial);
    if (initial === "wo") {
      void ensureWolofLoaded().then(() => this.dictionaryVersion.update((v) => v + 1));
    }
  }

  /** Choix de l'utilisateur : appliqué, puis enregistré sur le serveur (silencieux si non connecté). */
  setLocale(locale: Locale): void {
    if (!isLocale(locale)) return;
    this.applyLocale(locale);
    this.preferences.update({ locale });
  }

  private applyLocale(locale: Locale): void {
    if (locale === "wo") {
      void ensureWolofLoaded().then(() => {
        this.dictionaryVersion.update((v) => v + 1);
        this.localeSignal.set("wo");
        setCurrentLocale("wo");
      });
      return;
    }
    this.localeSignal.set(locale);
    setCurrentLocale(locale);
  }

  readonly t = computed(() => {
    this.dictionaryVersion();
    const locale = this.localeSignal();
    return (key: MessageKey, params?: TranslateParams) => translate(locale, key, params);
  });

  tNow(key: MessageKey, params?: TranslateParams): string {
    return translate(this.localeSignal(), key, params);
  }

  tEnum(domain: string, value: string): string {
    return translateEnum(this.localeSignal(), domain, value);
  }

  formatNumber(value: number): string {
    return formatNumber(value, this.localeSignal());
  }

  formatDate(value: Date | string | number, options?: Intl.DateTimeFormatOptions): string {
    return formatDate(value, this.localeSignal(), options);
  }
}
