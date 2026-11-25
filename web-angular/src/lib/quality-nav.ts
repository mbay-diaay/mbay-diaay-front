import { isApiMode } from "@/lib/api/config";
import { collectQualityPoints, duplicateGroups } from "@/lib/quality-real";
import { inScope, type State } from "@/lib/store";
import type { CorrectionRequest } from "@/lib/mock/data";
import type { Permission } from "@/lib/permissions";

/** Sections de l'espace « Qualité des données », dans l'ordre du menu à plat. */
export const QUALITY_SECTIONS: { to: string; perm: Permission | readonly Permission[] }[] = [
  { to: "/dashboard/qualite/doublons", perm: "quality.review" },
  // Alertes : `quality.review` OU `alert.manage` (le gestionnaire voit les alertes de sa coopérative, Q-10).
  { to: "/dashboard/qualite/alertes", perm: ["alert.manage", "quality.review"] },
  { to: "/dashboard/qualite/corrections", perm: "correction.manage" },
  // Mode API uniquement : l'accueil masque cette entrée sans serveur. Le volume vient du serveur (CoopRequestsService).
  { to: "/dashboard/qualite/demandes", perm: "coop_request.read" },
];

/** Permissions d'une section sous forme de liste. */
export const sectionPerms = (section: { perm: Permission | readonly Permission[] }): readonly Permission[] =>
  Array.isArray(section.perm) ? section.perm : [section.perm as Permission];

/**
 * Demandes de correction en attente sur une fiche du périmètre de la session : une seule définition, partagée
 * par le chiffre de l'accueil Qualité, le badge du menu et le tableau « À traiter ».
 */
export function pendingCorrections(state: State): CorrectionRequest[] {
  const mine = new Set(inScope(state.producers, state.session).map((producer) => producer.id));
  return state.corrections.filter((correction) => correction.status === "en attente" && mine.has(correction.producerId));
}

/**
 * Volumes « à traiter » de chaque section, dans le périmètre de la session.
 * Angular port: plain function of `State` instead of a `useStore()` hook —
 * call it from a computed signal (e.g. `computed(() => qualityCounts(store.state()))`).
 * `cniOpen` : alertes « CNI » ouvertes lues sur le serveur (mode API). Elles s'ajoutent aux points signalés à l'import
 * mais ne les remplacent pas, et les points Kobo ne sont jamais comptés comme des alertes CNI.
 */
export function qualityCounts(state: State, cniOpen = 0) {
  const { session, producers, plots, cases, alerts, corrections } = state;
  const mine = new Set(inScope(producers, session).map((p) => p.id));
  if (isApiMode()) {
    // Données réelles : groupes de doublons possibles et points signalés à l'import ; corrections lues sur l'API.
    return {
      doublons: duplicateGroups(state).length,
      alertes: collectQualityPoints(state).length + cniOpen,
      corrections: pendingCorrections(state).length,
    };
  }
  const minePlots = new Set(plots.filter((p) => mine.has(p.producerId)).map((p) => p.id));
  return {
    doublons: cases.filter((c) => c.status === "à examiner" && mine.has(c.aId)).length,
    alertes: alerts.filter(
      (a) => a.status === "ouvert" && (mine.has(a.entityId) || minePlots.has(a.entityId)),
    ).length,
    corrections: corrections.filter((c) => c.status === "en attente" && mine.has(c.producerId))
      .length,
  };
}
