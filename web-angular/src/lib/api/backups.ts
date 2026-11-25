import type { MessageKey } from "../i18n";
import { ApiError, apiFetch, apiFetchBlob } from "./client";

/** Mot à saisir à l'identique pour confirmer une restauration (le serveur le revérifie). */
export const RESTORE_CONFIRM_WORD = "RESTAURER";

export type BackupTableInfo = {
  table: string;
  label: string;
  /** Remise en place par une restauration. */
  restorable: boolean;
  notRestoredReason?: string;
};

/** Une sauvegarde du serveur (sans son contenu). */
export type ApiBackup = {
  id: string;
  kind: "manuelle" | "securite" | string;
  label: string;
  createdAt: string;
  createdByName: string;
  sizeBytes: number;
  tableRows: Record<string, number>;
  restoredAt: string | null;
  restoredByName: string | null;
  /** Une simulation récente de cette personne autorise la restauration réelle. */
  simulationValid: boolean;
};

export type BackupList = { items: ApiBackup[]; tables: BackupTableInfo[] };

export type RestoreTableResult = {
  table: string;
  label: string;
  snapshotRows: number;
  currentRows: number;
  replaced: number;
  recreated: number;
};

export type RestoreResult = {
  backupId: string;
  dryRun: boolean;
  tables: RestoreTableResult[];
  notRestored: BackupTableInfo[];
  safetyBackupId?: string;
};

export function listBackups() {
  return apiFetch<BackupList>("/backups");
}

export function createBackup(label?: string) {
  return apiFetch<ApiBackup>("/backups", { method: "POST", body: label ? { label } : {} });
}

/** Le fichier JSON d'une sauvegarde (le téléchargement est audité par le serveur). */
export function downloadBackupBlob(id: string) {
  return apiFetchBlob(`/backups/${encodeURIComponent(id)}/download`);
}

/** Simulation : aucune écriture, le serveur compte les lignes par table. Obligatoire avant la restauration réelle. */
export function simulateRestore(id: string) {
  return apiFetch<RestoreResult>(`/backups/${encodeURIComponent(id)}/restore`, {
    method: "POST",
    body: { dryRun: true },
  });
}

/** Restauration réelle : le serveur revérifie le mot et l'identifiant, sauvegarde l'état courant puis restaure. */
export function restoreBackup(id: string, confirm: string, confirmBackupId: string) {
  return apiFetch<RestoreResult>(`/backups/${encodeURIComponent(id)}/restore`, {
    method: "POST",
    body: { confirm, confirmBackupId },
  });
}

/** Vrai quand la saisie de confirmation est exacte (le serveur refuse de toute façon le reste). */
export function isRestoreConfirmed(backupId: string, typedWord: string, typedId: string): boolean {
  return typedWord === RESTORE_CONFIRM_WORD && typedId.trim() === backupId;
}

/** Nom de fichier de l'enregistrement local. */
export function backupFileName(backup: Pick<ApiBackup, "id" | "createdAt">): string {
  return `mbay_diaay_sauvegarde_${backup.createdAt.slice(0, 10)}_${backup.id.slice(0, 8)}.json`;
}

/** Taille lisible (Ko ou Mo). */
export function formatBackupSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

/** Message général d'une erreur de l'API des sauvegardes. */
export function backupApiError(error: unknown): MessageKey {
  if (error instanceof ApiError) {
    const cause = (error.details as { code?: string } | undefined)?.code ?? error.code;
    if (cause === "BACKUP_TOO_LARGE" || error.code === "PAYLOAD_TOO_LARGE") return "sauvegarde.server.error.tooLarge";
    if (cause === "DRY_RUN_REQUIRED") return "sauvegarde.server.error.dryRun";
    if (cause === "CONFIRMATION_REQUIRED") return "sauvegarde.server.error.confirmation";
    if (cause === "RESTORE_FAILED") return "sauvegarde.server.error.restoreFailed";
    if (cause === "BACKUP_INVALID") return "sauvegarde.server.error.invalid";
    if (error.code === "FORBIDDEN") return "sauvegarde.server.error.forbidden";
    if (error.code === "NOT_FOUND") return "sauvegarde.server.error.notFound";
  }
  return "errors.users.api";
}
