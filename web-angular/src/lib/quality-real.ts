import { sourceOfProducer, type DataSourceId } from "@/lib/data-source";
import type { MessageKey } from "@/lib/i18n";
import type { Plot, Producer } from "@/lib/mock/data";
import { inScope } from "@/lib/scope";
import type { State } from "@/lib/store";

/**
 * Qualité des données réelle (mode API) : points signalés par le CRADESC à l'import Kobo
 * (fiches, parcelles, cultures) et groupes de doublons possibles déduits des alertes
 * « CNI identique à » / « Téléphone partagé avec ». Aucune donnée de démonstration ici.
 */

export type QualityPointKind = "fiche" | "parcelle" | "culture";

export interface QualityPoint {
  id: string;
  producerId: string;
  producerName: string;
  producerCode: string;
  scoopId: string;
  quality: Producer["quality"];
  /** Base d'origine de la fiche (colonne « Source »). */
  sourceId: DataSourceId;
  kind: QualityPointKind;
  /** Précision du lieu : « P1 », « Tomate · P1 » ; vide pour la fiche. */
  place: string;
  /** Texte du CRADESC, conservé tel quel (vide : fiche à vérifier sans motif détaillé). */
  text: string;
}

/** Motifs connus : texte du CRADESC → explication en langage simple. */
const REASONS: { pattern: RegExp; key: MessageKey }[] = [
  { pattern: /dur[ée]e d.entretien/i, key: "qualite.real.why.shortInterview" },
  { pattern: /[âa]ge manquant/i, key: "qualite.real.why.ageMissing" },
  { pattern: /pr[ée]cision gps/i, key: "qualite.real.why.gpsPrecision" },
  { pattern: /rendement.*aberrant|aberrant.*rendement/i, key: "qualite.real.why.yieldOutlier" },
  { pattern: /cni identique/i, key: "qualite.real.why.cniSame" },
  { pattern: /t[ée]l[ée]phone partag[ée]/i, key: "qualite.real.why.phoneShared" },
  { pattern: /cni.*(invalide|format)/i, key: "qualite.real.why.cniInvalid" },
  { pattern: /t[ée]l[ée]phone.*(invalide|format)/i, key: "qualite.real.why.phoneInvalid" },
  { pattern: /superficie.*(écart|ecart|aberrant)|(écart|ecart).*superficie/i, key: "qualite.real.why.areaGap" },
];

/** Explication simple d'un motif connu, sinon `null` (l'écran garde alors le texte brut). */
export function explainAlert(text: string): MessageKey | null {
  return REASONS.find((reason) => reason.pattern.test(text))?.key ?? null;
}

const LINK_PATTERNS = {
  cni: /CNI identique [àa]\s*:?\s*(.+)$/i,
  phone: /T[ée]l[ée]phone partag[ée] avec\s*:?\s*(.+)$/i,
} as const;

/** Alertes de la fiche : enquête Kobo, plus les mentions « doublon » gardées dans l'historique. */
export function producerAlertTexts(producer: Producer): string[] {
  const texts = new Set<string>(producer.survey?.alerts ?? []);
  for (const entry of producer.history ?? []) {
    for (const value of [entry.to, entry.from, entry.field]) {
      if (typeof value === "string" && (LINK_PATTERNS.cni.test(value) || LINK_PATTERNS.phone.test(value))) {
        texts.add(value.trim());
      }
    }
  }
  return [...texts];
}

function plotPoints(producer: Producer, plot: Plot, out: QualityPoint[]): void {
  const base = {
    producerId: producer.id,
    producerName: `${producer.firstName} ${producer.lastName}`.trim(),
    producerCode: producer.code,
    scoopId: producer.scoopId,
    quality: producer.quality,
    sourceId: sourceOfProducer(producer).id,
  };
  (plot.alerts ?? []).forEach((text, index) =>
    out.push({ ...base, id: `${plot.id}-${index}`, kind: "parcelle", place: plot.code, text }),
  );
  for (const crop of plot.cropDetails ?? []) {
    crop.alerts.forEach((text, index) =>
      out.push({
        ...base,
        id: `${crop.id}-${index}`,
        kind: "culture",
        place: `${crop.crop} · ${plot.code}`,
        text,
      }),
    );
  }
}

/**
 * Une ligne par point signalé, dans le périmètre de la session : fiches non validées (alertes de
 * l'enquête, ou ligne sans motif détaillé), alertes de parcelles et de cultures de tous les producteurs.
 */
export function collectQualityPoints(state: State): QualityPoint[] {
  const producers = inScope(
    state.producers.filter((producer) => !producer.mergedInto),
    state.session,
  );
  const plotsByProducer = new Map<string, Plot[]>();
  for (const plot of state.plots) {
    plotsByProducer.set(plot.producerId, [...(plotsByProducer.get(plot.producerId) ?? []), plot]);
  }
  const points: QualityPoint[] = [];
  for (const producer of producers) {
    if (producer.quality !== "validé") {
      const texts = producerAlertTexts(producer);
      const base = {
        producerId: producer.id,
        producerName: `${producer.firstName} ${producer.lastName}`.trim(),
        producerCode: producer.code,
        scoopId: producer.scoopId,
        quality: producer.quality,
        sourceId: sourceOfProducer(producer).id,
        kind: "fiche" as const,
        place: "",
      };
      if (texts.length) {
        texts.forEach((text, index) => points.push({ ...base, id: `${producer.id}-f${index}`, text }));
      } else {
        points.push({ ...base, id: `${producer.id}-f`, text: "" });
      }
    }
    for (const plot of plotsByProducer.get(producer.id) ?? []) plotPoints(producer, plot, points);
  }
  return points;
}

export type DuplicateReason = "cni" | "phone";

export interface DuplicateGroup {
  id: string;
  reason: DuplicateReason;
  members: Producer[];
}

/**
 * Groupes de doublons possibles : producteurs reliés entre eux par une alerte « CNI identique à : CODE1, CODE2 »
 * ou « Téléphone partagé avec : CODE1 ». Les liens sont regroupés (A→B et B→A donnent un seul groupe).
 */
export function duplicateGroups(state: State): DuplicateGroup[] {
  const producers = inScope(
    state.producers.filter((producer) => !producer.mergedInto),
    state.session,
  );
  const byCode = new Map(producers.map((producer) => [producer.code.trim().toUpperCase(), producer]));
  const groups: DuplicateGroup[] = [];
  for (const reason of ["cni", "phone"] as const) {
    const parent = new Map<string, string>();
    const find = (id: string): string => {
      let root = id;
      while ((parent.get(root) ?? root) !== root) root = parent.get(root)!;
      parent.set(id, root);
      return root;
    };
    const union = (first: string, second: string) => {
      parent.set(find(first), find(second));
    };
    for (const producer of producers) {
      for (const text of producerAlertTexts(producer)) {
        const match = LINK_PATTERNS[reason].exec(text);
        if (!match) continue;
        for (const code of (match[1] ?? "").split(/[,;]/)) {
          const linked = byCode.get(code.trim().toUpperCase());
          if (linked && linked.id !== producer.id) {
            if (!parent.has(producer.id)) parent.set(producer.id, producer.id);
            if (!parent.has(linked.id)) parent.set(linked.id, linked.id);
            union(producer.id, linked.id);
          }
        }
      }
    }
    const clusters = new Map<string, Producer[]>();
    for (const producer of producers) {
      if (!parent.has(producer.id)) continue;
      const root = find(producer.id);
      clusters.set(root, [...(clusters.get(root) ?? []), producer]);
    }
    for (const members of clusters.values()) {
      if (members.length < 2) continue;
      const sorted = [...members].sort((first, second) => first.code.localeCompare(second.code));
      groups.push({ id: `${reason}-${sorted.map((member) => member.code).join("-")}`, reason, members: sorted });
    }
  }
  return groups.sort((first, second) => second.members.length - first.members.length || first.id.localeCompare(second.id));
}

/** Groupe déjà fusionné : la fiche gardée et les fiches qui lui ont été rattachées (restées en base, marquées « doublon »). */
export interface MergedGroup {
  id: string;
  keep: Producer;
  merged: Producer[];
}

/** Groupes déjà fusionnés dans le périmètre de la session (fiche gardée connue du store), triés par code. */
export function mergedGroups(state: State): MergedGroup[] {
  const visible = inScope(state.producers, state.session);
  const byId = new Map(state.producers.map((producer) => [producer.id, producer]));
  const byKeep = new Map<string, Producer[]>();
  for (const producer of visible) {
    if (!producer.mergedInto || !byId.has(producer.mergedInto)) continue;
    byKeep.set(producer.mergedInto, [...(byKeep.get(producer.mergedInto) ?? []), producer]);
  }
  return [...byKeep.entries()]
    .map(([keepId, merged]) => ({
      id: `merged-${keepId}`,
      keep: byId.get(keepId)!,
      merged: [...merged].sort((first, second) => first.code.localeCompare(second.code)),
    }))
    .sort((first, second) => first.keep.code.localeCompare(second.keep.code));
}

/** Nombre de champs renseignés d'une fiche (sert à choisir la fiche la plus complète). */
export function filledFieldCount(producer: Producer): number {
  const values: unknown[] = [
    producer.phone,
    producer.cni,
    producer.village,
    producer.age,
    producer.photoUrl,
    producer.orgId,
    producer.enumerator,
    producer.survey,
    producer.crops.length ? producer.crops : null,
  ];
  return values.filter((value) => value !== null && value !== undefined && value !== "").length;
}

/** Fiche à garder par défaut : plus de parcelles, puis plus de champs renseignés, puis code le plus petit. */
export function suggestedKeepId(members: Producer[], plotCountOf: (producerId: string) => number): string {
  const ranked = [...members].sort(
    (first, second) =>
      plotCountOf(second.id) - plotCountOf(first.id) ||
      filledFieldCount(second) - filledFieldCount(first) ||
      first.code.localeCompare(second.code),
  );
  return ranked[0]?.id ?? "";
}

/** Nom normalisé : minuscules, sans accents ni ponctuation, mots triés (l'ordre prénom / nom ne compte pas). */
export function normalizedPersonName(producer: Pick<Producer, "firstName" | "lastName">): string {
  return `${producer.firstName} ${producer.lastName}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

/**
 * Sous-ensembles de fiches « identiques » (la même personne) d'un groupe : reliées par une alerte « CNI identique à »,
 * ou de même nom normalisé. Composantes connexes ; seuls les sous-ensembles d'au moins 2 fiches sont rendus.
 * Un téléphone partagé seul ne suffit pas : c'est souvent un téléphone de famille.
 */
export function identicalSubsets(members: Producer[]): Producer[][] {
  const parent = new Map(members.map((member) => [member.id, member.id]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    return root;
  };
  const union = (first: string, second: string) => parent.set(find(first), find(second));
  const byCode = new Map(members.map((member) => [member.code.trim().toUpperCase(), member]));
  const byName = new Map<string, Producer>();
  for (const member of members) {
    for (const text of producerAlertTexts(member)) {
      const match = LINK_PATTERNS.cni.exec(text);
      if (!match) continue;
      for (const code of (match[1] ?? "").split(/[,;]/)) {
        const linked = byCode.get(code.trim().toUpperCase());
        if (linked && linked.id !== member.id) union(member.id, linked.id);
      }
    }
    const name = normalizedPersonName(member);
    if (!name) continue;
    const same = byName.get(name);
    if (same) union(member.id, same.id);
    else byName.set(name, member);
  }
  const clusters = new Map<string, Producer[]>();
  for (const member of members) clusters.set(find(member.id), [...(clusters.get(find(member.id)) ?? []), member]);
  return [...clusters.values()].filter((cluster) => cluster.length >= 2);
}

export type ConcordanceKind = "identical" | "differences" | "distinct";

export interface GroupConcordance {
  kind: ConcordanceKind;
  titleKey: MessageKey;
  badgeKey: MessageKey;
  hintKey: MessageKey;
  icon: "verified" | "warning" | "info" | "call";
  toneKey: "succes" | "attente" | "info";
  diffFields: string[];
}

function normField(val: string | null | undefined): string {
  return (val ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Analyse le niveau de concordance réel entre les fiches d'un groupe de doublons :
 * - "identical" : toutes les informations d'identité (nom, CNI, village, sexe, âge, coopérative) concordent à 100%.
 * - "differences" : même motif (ex: CNI identique) mais des données divergent (nom, village, âge...).
 * - "distinct" : personnes différentes (ex: téléphone partagé en famille).
 */
export function analyzeGroupConcordance(group: DuplicateGroup): GroupConcordance {
  const members = group.members;
  if (members.length < 2) {
    return {
      kind: "identical",
      titleKey: "qualite.real.dbl.reason.cni",
      badgeKey: "qualite.concordance.badgeIdentical",
      hintKey: "qualite.concordance.hintIdentical",
      icon: "verified",
      toneKey: "succes",
      diffFields: [],
    };
  }

  const names = new Set(members.map((m) => normalizedPersonName(m)).filter(Boolean));
  const sameName = names.size === 1;

  const cnis = new Set(members.map((m) => normField(m.cni)).filter(Boolean));
  const sameCni = cnis.size <= 1;

  const phones = new Set(members.map((m) => normField(m.phone)).filter(Boolean));
  const samePhone = phones.size <= 1;

  const villages = new Set(members.map((m) => normField(m.village)).filter(Boolean));
  const sameVillage = villages.size <= 1;

  const sexes = new Set(members.map((m) => m.sex).filter(Boolean));
  const sameSex = sexes.size <= 1;

  const ages = members.map((m) => m.age).filter((a): a is number => a !== null && a !== undefined);
  const maxAgeDiff = ages.length >= 2 ? Math.max(...ages) - Math.min(...ages) : 0;
  const sameAge = maxAgeDiff <= 1;

  const scoops = new Set(members.map((m) => m.scoopId).filter(Boolean));
  const sameScoop = scoops.size <= 1;

  const diffFields: string[] = [];
  if (!sameName) diffFields.push("nom");
  if (!sameCni && cnis.size > 1) diffFields.push("CNI");
  if (!samePhone && phones.size > 1) diffFields.push("téléphone");
  if (!sameVillage && villages.size > 1) diffFields.push("village");
  if (!sameSex && sexes.size > 1) diffFields.push("sexe");
  if (!sameAge && ages.length >= 2) diffFields.push("âge");
  if (!sameScoop && scoops.size > 1) diffFields.push("coopérative");

  // Cas 1 : Téléphone partagé entre personnes différentes (noms distincts)
  if (group.reason === "phone" && !sameName) {
    return {
      kind: "distinct",
      titleKey: "qualite.concordance.phoneDistinct",
      badgeKey: "qualite.concordance.badgeDistinct",
      hintKey: "qualite.concordance.hintPhoneDistinct",
      icon: "call",
      toneKey: "info",
      diffFields,
    };
  }

  // Cas 2 : Données 100% concordantes (même nom, même village, même sexe, âge et coopérative)
  if (sameName && sameVillage && sameSex && sameAge && sameScoop) {
    return {
      kind: "identical",
      titleKey:
        group.reason === "cni"
          ? "qualite.concordance.allIdenticalCni"
          : "qualite.concordance.allIdenticalPhone",
      badgeKey: "qualite.concordance.badgeIdentical",
      hintKey: "qualite.concordance.hintIdentical",
      icon: "verified",
      toneKey: "succes",
      diffFields: [],
    };
  }

  // Cas 3 : CNI identique mais écarts détectés
  if (group.reason === "cni") {
    return {
      kind: "differences",
      titleKey: "qualite.concordance.cniWithDiff",
      badgeKey: "qualite.concordance.badgeDiff",
      hintKey: "qualite.concordance.hintCniDiff",
      icon: "warning",
      toneKey: "attente",
      diffFields,
    };
  }

  // Cas 4 : Téléphone partagé avec même nom mais écarts (village, coopérative, etc.)
  return {
    kind: "differences",
    titleKey: "qualite.concordance.phoneWithDiff",
    badgeKey: "qualite.concordance.badgeDiff",
    hintKey: "qualite.concordance.hintPhoneDiff",
    icon: "info",
    toneKey: "attente",
    diffFields,
  };
}
