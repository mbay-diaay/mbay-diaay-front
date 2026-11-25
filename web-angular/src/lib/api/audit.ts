import type { AuditEntry } from "../store";
import { listAudit, type ApiAuditEntry } from "./admin";
import { fetchAllPages } from "./pagination";

/** Garde-fou : nombre maximal de pages (de 200 entrées) lues pour afficher le journal complet. */
export const AUDIT_MAX_PAGES = 50;

/** Entrée du journal serveur → entrée d'audit de l'interface (`actor` devient `user`, `target` devient `entity`). */
export function auditEntryFromApi(entry: ApiAuditEntry): AuditEntry {
  return {
    id: entry.id,
    at: entry.at,
    user: entry.actor || "—",
    action: entry.action,
    entity: entry.target || "—",
    detail: entry.detail ?? "",
    scoopId: entry.scoopId ?? undefined,
    category: entry.category ?? undefined,
  };
}

/** Texte sans accents ni majuscules, pour la recherche. */
export const normalizeAuditText = (value: string): string =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export type AuditFilters = {
  /** Recherche libre (action, utilisateur, entité, détail). */
  search?: string;
  /** Nom de l'utilisateur exact ; vide = tous. */
  user?: string;
  /** Date de début (AAAA-MM-JJ), incluse. */
  from?: string;
  /** Date de fin (AAAA-MM-JJ), incluse. */
  to?: string;
};

/** Filtre côté page les entrées déjà chargées (le serveur peut ignorer ces filtres). */
export function filterAuditEntries(entries: readonly AuditEntry[], filters: AuditFilters): AuditEntry[] {
  const needle = normalizeAuditText((filters.search ?? "").trim());
  return entries.filter(
    (entry) =>
      (!filters.user || entry.user === filters.user) &&
      (!filters.from || entry.at.slice(0, 10) >= filters.from) &&
      (!filters.to || entry.at.slice(0, 10) <= filters.to) &&
      (!needle ||
        normalizeAuditText(`${entry.action} ${entry.user} ${entry.entity} ${entry.detail}`).includes(needle)),
  );
}

/** Lit tout le journal du serveur (le serveur applique le périmètre de la session et l'audit). */
export async function fetchAuditJournal(): Promise<AuditEntry[]> {
  let pagesRead = 0;
  const rows = await fetchAllPages(async (query) => {
    pagesRead++;
    const result = await listAudit(query);
    // Au-delà du garde-fou, on arrête en prétendant être sur la dernière page.
    return pagesRead >= AUDIT_MAX_PAGES ? { ...result, page: result.pages } : result;
  });
  return rows.map(auditEntryFromApi);
}

/** Lit seulement les dernières entrées (activité récente). */
export async function fetchRecentAudit(limit = 6): Promise<AuditEntry[]> {
  const result = await listAudit({ page: 1, limit });
  return result.items.map(auditEntryFromApi);
}
