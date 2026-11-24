import { Injectable, signal } from "@angular/core";

import { listCoopRequests } from "@/lib/api/coop-requests";
import { isApiMode } from "@/lib/api/config";

/**
 * Compteur des demandes du CRADESC encore ouvertes (mode API) : lu sur le serveur, partagé entre la page
 * des demandes et la tuile de l'accueil Qualité. Un échec laisse le compteur à 0 (jamais de chiffre inventé).
 */
@Injectable({ providedIn: "root" })
export class CoopRequestsService {
  private readonly openTotal = signal(0);
  readonly openCount = this.openTotal.asReadonly();

  async refreshOpenCount(): Promise<void> {
    if (!isApiMode()) return;
    try {
      const page = await listCoopRequests({ status: "ouverte", limit: 1 });
      this.openTotal.set(page.total);
    } catch {
      // Silencieux : la tuile s'affiche à 0.
    }
  }

  /** Après un règlement, une annulation ou un envoi : la page connaît déjà le bon total. */
  setOpenCount(total: number): void {
    this.openTotal.set(total);
  }
}
