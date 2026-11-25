import { Injectable, computed, inject, signal } from "@angular/core";

import { isApiMode } from "@/lib/api/config";
import { listFlaggedProducerIds, listQualityAlerts } from "@/lib/api/quality-alerts";
import { StoreService } from "./store.service";

/**
 * Fiches qui portent une alerte rouge « CNI proches : à vérifier » : la liste vient du serveur
 * (`GET /quality/alerts/flagged-producers`), jamais calculée dans le navigateur. Elle n'est lue que par un compte qui
 * a le droit de voir les alertes (`quality.review` ou `alert.manage`) et seulement en mode API ; sinon elle reste vide.
 * Une erreur de lecture laisse la liste vide et `failed` à vrai : l'écran n'affiche alors aucune pastille plutôt qu'une
 * pastille inventée.
 */
@Injectable({ providedIn: "root" })
export class CniAlertsService {
  private readonly store = inject(StoreService);
  private readonly flaggedIds = signal<ReadonlySet<string>>(new Set());
  private readonly failedState = signal(false);
  private readonly openTotal = signal(0);
  private loading: Promise<void> | null = null;

  /** Le compte peut-il voir ces alertes ? Toujours par permission, jamais par rôle. */
  readonly canView = computed(() => isApiMode() && (this.store.can("quality.review") || this.store.can("alert.manage")));
  readonly failed = this.failedState.asReadonly();
  /** Alertes ouvertes du périmètre (compteur du menu Qualité), lues sur le serveur. */
  readonly openCount = this.openTotal.asReadonly();
  readonly flagged = this.flaggedIds.asReadonly();

  isFlagged(producerId: string): boolean {
    return this.canView() && this.flaggedIds().has(producerId);
  }

  /** (Re)lit la liste sur le serveur ; les appels simultanés partagent la même lecture. */
  refresh(): Promise<void> {
    if (!this.canView()) {
      this.flaggedIds.set(new Set());
      this.openTotal.set(0);
      return Promise.resolve();
    }
    this.loading ??= (async () => {
      try {
        const [ids, page] = await Promise.all([listFlaggedProducerIds(), listQualityAlerts({ limit: 1 })]);
        this.flaggedIds.set(new Set(ids));
        this.openTotal.set(page.open);
        this.failedState.set(false);
      } catch {
        this.flaggedIds.set(new Set());
        this.openTotal.set(0);
        this.failedState.set(true);
      } finally {
        this.loading = null;
      }
    })();
    return this.loading;
  }
}
