import { Injectable, inject, signal } from "@angular/core";

import { isApiMode } from "@/lib/api/config";
import { ApiError } from "@/lib/api/client";
import { fetchAllPlots } from "@/lib/api/plots";
import {
  approveDossierOnApi,
  attachDocumentOnApi,
  createDossierOnApi,
  decideCorrectionOnApi,
  detachDocumentOnApi,
  fetchAllCorrections,
  fetchAllDossiers,
  fetchAllProducers,
  getProducer,
  producerApiMessage,
  producerFromApi,
  refuseDossierOnApi,
  requestComplementOnApi,
  revealCniOnApi,
  revealPhoneOnApi,
  sendRemindersOnApi,
  startReviewOnApi,
  submitCorrectionOnApi,
  submitDossierOnApi,
  updateDossierOnApi,
} from "@/lib/api/producers";
import type { ActionResult, DraftIssue } from "@/lib/dossiers";
import type { CorrectionChange, Producer } from "@/lib/mock/data";
import type { DocumentKind, DossierDraft, RefusalReason } from "@/lib/mock/cooperative";
import { LocaleService } from "./locale.service";
import { StoreService } from "./store.service";

type DocumentInput = { kind: DocumentKind; name: string; sizeKb: number; mime: string; sensitive?: boolean };

/**
 * Producteurs, corrections et dossiers d'adhésion : une seule porte d'entrée pour les écrans.
 * En démonstration, chaque méthode appelle le store local ; en mode API, elle appelle l'API puis range la réponse
 * dans le store (les écrans lisent toujours le store). Toutes les méthodes sont asynchrones et rendent le même
 * `ActionResult` que le store, avec un message déjà en français.
 */
@Injectable({ providedIn: "root" })
export class ProducerWorkflow {
  private readonly store = inject(StoreService);
  private readonly locale = inject(LocaleService);

  private get actions() {
    return this.store.actions;
  }

  /** Échec d'un appel API : le message du serveur (en français), les contrôles bloquants à part. */
  private failure(error: unknown): { ok: false; error: string; issues?: DraftIssue[] } {
    const fallback = this.locale.tNow("errors.users.api");
    const issues = error instanceof ApiError ? (error.details as { issues?: DraftIssue[] } | undefined)?.issues : undefined;
    return { ok: false, error: producerApiMessage(error, fallback), ...(issues?.length && { issues }) };
  }

  // ------------------------------------------------------------- Chargement

  /**
   * Mode API : charge les producteurs, dossiers et corrections du périmètre du compte (ce que son rôle permet de lire),
   * puis les parcelles (import Kobo) une fois les producteurs rangés : la campagne d'une parcelle vient de son producteur.
   */
  /** Incrémenté quand les données serveur changent (fusion, transfert…) : les listes paginées se relisent. */
  readonly refreshTick = signal(0);
  private fullListsLoaded = false;
  private hydratedOnce = false;
  private fullListsPromise: Promise<void> | null = null;

  async hydrate(): Promise<void> {
    if (!isApiMode()) return;
    const [dossiers, corrections] = await Promise.allSettled([
      fetchAllDossiers(),
      this.store.can("correction.manage") ? fetchAllCorrections() : Promise.resolve(null),
    ]);
    if (dossiers.status === "fulfilled") this.actions.setDossiersFromApi(dossiers.value);
    if (corrections.status === "fulfilled" && corrections.value) this.actions.setCorrectionsFromApi(corrections.value);
    // Les écrans déjà passés au chargement complet le relisent ; la page Producteurs se relit par page.
    if (this.fullListsLoaded) await this.loadFullLists();
    // Premier chargement : rien n'a changé pour les listes paginées. Ensuite (fusion, transfert…), elles se relisent.
    if (this.hydratedOnce) this.refreshTick.update((n) => n + 1);
    this.hydratedOnce = true;
  }

  /**
   * Chargement COMPLET des producteurs et des parcelles, à la demande et une seule fois par session. Réservé aux écrans
   * qui lisent encore la liste entière ; la page Producteurs, elle, demande une page à la fois au serveur.
   */
  ensureFullLists(): Promise<void> {
    if (!isApiMode()) return Promise.resolve();
    this.fullListsPromise ??= this.loadFullListsWithRetry().then((done) => {
      this.fullListsLoaded = done;
      // Échec définitif : la prochaine ouverture d'un écran réessaiera.
      if (!done) this.fullListsPromise = null;
    });
    return this.fullListsPromise;
  }

  /** Réessaie après une erreur passagère (trop de requêtes, serveur qui redémarre) : jusqu'à 4 essais, de plus en plus espacés. */
  private async loadFullListsWithRetry(): Promise<boolean> {
    for (let attempt = 0; attempt < 4; attempt++) {
      if (await this.loadFullLists()) return true;
      await new Promise((resolve) => setTimeout(resolve, 4000 * (attempt + 1)));
    }
    return false;
  }

  private async loadFullLists(): Promise<boolean> {
    if (!this.store.can("producer.read")) return true;
    try {
      this.actions.setProducersFromApi(await fetchAllProducers());
    } catch {
      return false;
    }
    try {
      this.actions.setPlotsFromApi(await fetchAllPlots());
    } catch {
      return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- Dossiers

  async createDossier(scoopId: string, draft: DossierDraft): Promise<ActionResult<{ id: string }>> {
    if (!isApiMode()) return this.actions.createDossier(scoopId, draft);
    try {
      const dossier = await createDossierOnApi(scoopId, draft);
      this.actions.upsertDossierFromApi(dossier);
      return { ok: true, id: dossier.id };
    } catch (error) {
      return this.failure(error);
    }
  }

  async updateDossier(id: string, patch: Partial<DossierDraft>): Promise<ActionResult> {
    if (!isApiMode()) return this.actions.updateDossier(id, patch);
    try {
      this.actions.upsertDossierFromApi(await updateDossierOnApi(id, patch));
      return { ok: true };
    } catch (error) {
      return this.failure(error);
    }
  }

  /** Pièce déposée : enregistrée localement (le fichier relève de la bibliothèque), puis rattachée au dossier sur l'API. */
  async addDocument(dossierId: string, input: DocumentInput): Promise<ActionResult<{ id: string }>> {
    const local = this.actions.addDocument(dossierId, input);
    if (!isApiMode() || !local.ok) return local;
    try {
      this.actions.upsertDossierFromApi(await attachDocumentOnApi(dossierId, local.id));
      return local;
    } catch (error) {
      this.actions.removeDocument(local.id);
      return this.failure(error);
    }
  }

  async removeDocument(docId: string): Promise<ActionResult> {
    const dossierId = this.store.state().documents.find((doc) => doc.id === docId)?.ownerId;
    const local = this.actions.removeDocument(docId);
    if (!isApiMode() || !local.ok || !dossierId) return local;
    try {
      this.actions.upsertDossierFromApi(await detachDocumentOnApi(dossierId, docId));
      return local;
    } catch (error) {
      return this.failure(error);
    }
  }

  async submitDossier(id: string): Promise<ActionResult<{ possibleDuplicateOf: string | null }>> {
    if (!isApiMode()) return this.actions.submitDossier(id);
    try {
      const dossier = await submitDossierOnApi(id);
      this.actions.upsertDossierFromApi(dossier);
      return { ok: true, possibleDuplicateOf: dossier.possibleDuplicateOf };
    } catch (error) {
      return this.failure(error);
    }
  }

  async startReview(id: string): Promise<ActionResult> {
    if (!isApiMode()) return this.actions.startReview(id);
    try {
      this.actions.upsertDossierFromApi(await startReviewOnApi(id));
      return { ok: true };
    } catch (error) {
      return this.failure(error);
    }
  }

  async requestComplement(id: string, message: string): Promise<ActionResult> {
    if (!isApiMode()) return this.actions.requestComplement(id, message);
    try {
      this.actions.upsertDossierFromApi(await requestComplementOnApi(id, message));
      return { ok: true };
    } catch (error) {
      return this.failure(error);
    }
  }

  async refuseDossier(id: string, reason: RefusalReason, comment?: string): Promise<ActionResult> {
    if (!isApiMode()) return this.actions.refuseDossier(id, reason, comment);
    try {
      this.actions.upsertDossierFromApi(await refuseDossierOnApi(id, reason, comment));
      return { ok: true };
    } catch (error) {
      return this.failure(error);
    }
  }

  async approveDossier(
    id: string,
    options: { duplicate?: "lié" | "distinct"; createMember?: boolean; comment?: string } = {},
  ): Promise<ActionResult<{ producerId: string; memberId: string | null; selfApproved: boolean }>> {
    if (!isApiMode()) return this.actions.approveDossier(id, options);
    try {
      const result = await approveDossierOnApi(id, options);
      this.actions.upsertDossierFromApi(result.dossier);
      this.actions.reassignDossierDocuments(id, result.producerId);
      // La fiche créée (ou liée) arrive aussi dans l'annuaire ; le membre relève du domaine « membres ».
      this.actions.upsertProducerFromApi(producerFromApi(await getProducer(result.producerId)));
      return { ok: true, producerId: result.producerId, memberId: null, selfApproved: result.selfApproved };
    } catch (error) {
      return this.failure(error);
    }
  }

  async sendDossierReminders(): Promise<number> {
    if (!isApiMode()) return this.actions.sendDossierReminders();
    try {
      const { reminded } = await sendRemindersOnApi();
      if (reminded) this.actions.setDossiersFromApi(await fetchAllDossiers());
      return reminded;
    } catch {
      return 0;
    }
  }

  // ------------------------------------------------------------ Producteurs

  /** CNI complète : motif d'au moins 3 caractères, tracé. En mode API, le clair vient du serveur. */
  async revealCni(producer: Producer, reason: string): Promise<ActionResult> {
    const motif = reason.trim();
    if (!isApiMode()) {
      try {
        this.actions.revealCni(producer, motif);
        return { ok: true };
      } catch {
        return { ok: false, error: this.locale.tNow("producteurs.detail.cniDialog.tooShort") };
      }
    }
    if (motif.length < 3) return { ok: false, error: this.locale.tNow("producteurs.detail.cniDialog.tooShort") };
    try {
      const { cni } = await revealCniOnApi(producer.id, motif);
      this.actions.revealProducerFromApi(producer.id, { cni });
      return { ok: true };
    } catch (error) {
      return this.failure(error);
    }
  }

  async revealPhone(producer: Producer): Promise<ActionResult> {
    if (!isApiMode()) {
      this.actions.revealPhone(producer);
      return { ok: true };
    }
    try {
      const { phone } = await revealPhoneOnApi(producer.id);
      this.actions.revealProducerFromApi(producer.id, { phone });
      return { ok: true };
    } catch (error) {
      return this.failure(error);
    }
  }

  // ------------------------------------------------------------ Corrections

  async submitCorrection(producerId: string, changes: CorrectionChange[], motif: string): Promise<ActionResult> {
    if (!isApiMode()) {
      this.actions.submitCorrection(producerId, changes, motif);
      return { ok: true };
    }
    try {
      this.actions.upsertCorrectionFromApi(await submitCorrectionOnApi(producerId, changes, motif));
      return { ok: true };
    } catch (error) {
      return this.failure(error);
    }
  }

  /** Approuvée, la correction change la fiche sur le serveur : on relit la fiche pour l'afficher à jour. */
  async decideCorrection(id: string, approved: boolean, comment: string): Promise<ActionResult> {
    if (!isApiMode()) {
      this.actions.decideCorrection(id, approved, comment);
      return { ok: true };
    }
    try {
      const decided = await decideCorrectionOnApi(id, approved, comment);
      this.actions.upsertCorrectionFromApi(decided);
      if (approved) this.actions.upsertProducerFromApi(producerFromApi(await getProducer(decided.producerId)));
      return { ok: true };
    } catch (error) {
      return this.failure(error);
    }
  }
}
