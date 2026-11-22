import { Injectable, signal } from "@angular/core";

import { fetchBranding, type Branding } from "@/lib/api/branding";
import { isApiMode } from "@/lib/api/config";

/**
 * Identité visuelle de la plateforme (logo choisi par le super administrateur), lue une fois au démarrage et partagée
 * par tous les écrans : menu, connexion, pages publiques, icône de l'onglet. Sans logo choisi, le logo d'origine reste.
 */
@Injectable({ providedIn: "root" })
export class BrandingService {
  readonly branding = signal<Branding | null>(null);
  private loading: Promise<void> | null = null;

  constructor() {
    void this.load();
  }

  /** Relit les logos en vigueur (après un changement dans les réglages). */
  load(force = false): Promise<void> {
    if (!isApiMode() || typeof window === "undefined") return Promise.resolve();
    if (this.loading && !force) return this.loading;
    this.loading = fetchBranding()
      .then((value) => this.apply(value))
      .catch(() => undefined);
    return this.loading;
  }

  apply(value: Branding): void {
    this.branding.set(value);
    this.updateFavicon(value);
  }

  /** Logo choisi pour un fond clair, ou null (logo d'origine). */
  colorLogo(): string | null {
    const value = this.branding();
    return value?.custom.color ? value.logoUrl : null;
  }

  /** Logo choisi pour un fond foncé, ou null (logo d'origine). */
  inverseLogo(): string | null {
    const value = this.branding();
    return value?.custom.inverse ? value.logoInverseUrl : null;
  }

  private updateFavicon(value: Branding): void {
    if (typeof document === "undefined" || !value.custom.color) return;
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.type = "image/png";
    link.href = value.logoUrl;
  }
}
