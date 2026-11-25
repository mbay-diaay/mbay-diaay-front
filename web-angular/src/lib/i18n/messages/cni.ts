/**
 * Alerte rouge « CNI proches : à vérifier », déplacement vers une organisation et aides des types d'organisation.
 * Règles : « REGLES.md » §4 (alerte sans fusion), §4 bis (la CNI n'est jamais modifiée ; une même CNI répétée est normale),
 * §3 (orphelins déplaçables) ; « DONNEES.md » §7 (types d'organisation).
 */
export const cni = {
  // ── Pastille et explication
  "cni.badge": "CNI proches : à vérifier",
  "cni.badge.title": "Deux fiches ont des CNI différentes mais proches. À vérifier par une personne : ce n'est pas un doublon.",
  "cni.explain.title": "CNI proches : à vérifier",
  "cni.explain.body":
    "Cette alerte ne veut PAS dire que deux fiches sont un doublon. Une même CNI sur plusieurs enregistrements est normale (une personne peut avoir plusieurs parcelles, saisies à des moments différents). Seules des CNI différentes mais proches (un caractère de différence, deux chiffres inversés ou une simple différence d'espaces) sont signalées, pour qu'une personne vérifie auprès de la coopérative. Aucune fiche n'est fusionnée ni modifiée à cause de cette alerte.",
  "cni.reason.format": "Même suite de caractères, écrite avec des espaces ou séparateurs différents",
  "cni.reason.un_caractere": "Un seul caractère de différence",
  "cni.reason.inversion": "Deux caractères inversés",
  "cni.reason.trop_court": "Moins de 13 chiffres",
  "cni.reason.trop_long": "Plus de 13 chiffres",
  "cni.reason.caracteres": "Contient autre chose que des chiffres",
  "cni.reason.short.format": "Format différent",
  "cni.reason.short.un_caractere": "Un caractère",
  "cni.reason.short.inversion": "Inversion",

  // ── CNI au format inhabituel (valeur autre que 13 chiffres) : signalement seulement
  "cni.format.badge": "CNI au format inhabituel",
  "cni.format.message":
    "Cette CNI n'a pas le format habituel. Elle a été gardée telle quelle : vérifiez-la auprès de la coopérative. Elle n'est ni corrigée ni supprimée.",
  "cni.format.title": "CNI au format inhabituel : à vérifier",
  "cni.format.fiche": "Cette fiche porte une CNI au format inhabituel.",
  "cni.format.ask.subject": "CNI au format inhabituel ({code})",
  "cni.format.ask.message":
    "Bonjour,\n\nLa CNI de la fiche {code} n'a pas le format habituel. Elle a été gardée telle quelle. Merci de la vérifier auprès de la personne concernée et de nous répondre. Ne modifiez rien sans vérification.\n\nMerci.",

  // ── Types d'alerte (filtre)
  "cni.kind.all": "Tous les types",
  "cni.kind.cni_proches": "CNI proches",
  "cni.kind.cni_format_inhabituel": "Format inhabituel",
  "cni.filter.kind": "Type d'alerte",

  // ── Fiche producteur
  "cni.fiche.title": "CNI proches : à vérifier",
  "cni.fiche.other": "Fiche proche : {code}",
  "cni.fiche.otherHidden": "L'autre fiche est dans une autre coopérative que la vôtre.",
  "cni.fiche.openOther": "Ouvrir l'autre fiche",
  "cni.fiche.resolve": "Marquer comme vérifié",
  "cni.fiche.resolved": "Vérifié par {by}",

  // ── Page « Alertes »
  "cni.page.title": "Alertes sur les CNI",
  "cni.page.count": "{count} alerte(s)",
  "cni.page.empty": "Aucune alerte « CNI proches » dans cette liste.",
  "cni.page.loadError": "Les alertes « CNI proches » n'ont pas pu être chargées. Réessayez dans un instant.",
  "cni.page.retry": "Réessayer",
  "cni.page.stat": "{open} ouverte(s), dont {high} en rouge",
  "cni.col.fiches": "Fiches concernées",
  "cni.col.scoop": "Coopérative",
  "cni.col.reason": "Pourquoi",
  "cni.col.status": "État",
  "cni.col.detected": "Détectée le",
  "cni.status.ouverte": "À vérifier",
  "cni.status.résolue": "Vérifiée",
  "cni.status.obsolète": "Plus d'actualité",
  "cni.status.all": "Toutes",
  "cni.filter.status": "État de l'alerte",
  "cni.otherHidden": "autre fiche hors de votre périmètre",
  "cni.action.resolve": "Marquer comme vérifiée",
  "cni.action.ask": "Demander la vérification à la coopérative",
  "cni.action.detect": "Relancer la détection",
  "cni.detect.done": "Détection terminée : {created} nouvelle(s), {reopened} rouverte(s), {obsolete} sans objet.",
  "cni.detect.doneFormat": "Détection terminée : {created} proche(s) nouvelle(s), {formatCreated} format(s) inhabituel(s) nouveau(x).",

  // ── Résolution manuelle
  "cni.resolve.title": "Marquer l'alerte comme vérifiée",
  "cni.resolve.description":
    "À faire après avoir vérifié auprès de la coopérative. Les fiches ne sont ni modifiées ni fusionnées. L'action est enregistrée dans l'audit.",
  "cni.resolve.note": "Note de vérification (facultatif)",
  "cni.resolve.notePlaceholder": "Ex. vérifié avec le gestionnaire, deux personnes différentes. Sans nom, téléphone ni CNI.",
  "cni.resolve.noteHint": "N'écrivez ni nom, ni téléphone, ni numéro de CNI : les longs nombres sont masqués par le serveur.",
  "cni.resolve.cancel": "Annuler",
  "cni.resolve.confirm": "Marquer comme vérifiée",
  "cni.resolve.running": "Enregistrement…",
  "cni.resolve.success": "Alerte marquée comme vérifiée.",

  // ── Demande type « CNI proches à vérifier »
  "cni.ask.subject": "CNI proches à vérifier ({code})",
  "cni.ask.message":
    "Bonjour,\n\nLa fiche {code} et la fiche {other} ont des numéros de CNI différents mais proches. Ce n'est pas un doublon avéré : merci de vérifier auprès des personnes concernées si l'un des deux numéros est mal écrit, puis de nous répondre. Ne modifiez rien sans vérification.\n\nMerci.",
  "cni.ask.messageOne":
    "Bonjour,\n\nLa fiche {code} a un numéro de CNI différent mais proche de celui d'une autre fiche. Ce n'est pas un doublon avéré : merci de vérifier auprès de la personne concernée si le numéro est bien écrit, puis de nous répondre. Ne modifiez rien sans vérification.\n\nMerci.",

  // ── Erreurs
  "cni.err.alreadyClosed": "Cette alerte est déjà vérifiée ou n'est plus d'actualité.",
  "cni.err.network": "Le serveur est injoignable. Réessayez dans un instant.",
  "cni.err.forbidden": "Votre compte n'a pas le droit de traiter ces alertes.",
  "cni.err.notFound": "Cette alerte est introuvable ou hors de votre périmètre.",
  "cni.err.generic": "L'opération sur l'alerte a échoué. Réessayez.",

  // ── Déplacer vers une organisation
  "deplacer.action": "Déplacer vers une organisation",
  "deplacer.title": "Déplacer vers une organisation",
  "deplacer.description":
    "Les éléments choisis sont rattachés à l'organisation de destination. Leur ancienne organisation reste dans l'historique de la fiche et l'opération est enregistrée dans l'audit.",
  "deplacer.kind.producers": "producteur(s)",
  "deplacer.kind.members": "adhérent(s)",
  "deplacer.selection": "Éléments à déplacer",
  "deplacer.selectionMore": "… et {count} autre(s)",
  "deplacer.target.label": "Organisation de destination",
  "deplacer.target.placeholder": "Choisir l'organisation",
  "deplacer.target.empty": "Aucune organisation disponible. Créez-la d'abord depuis la page Organisations.",
  "deplacer.target.otherScoop": "Cette organisation est dans une autre coopérative : les éléments changeront aussi de coopérative.",
  "deplacer.target.otherScoopForbidden":
    "Cette organisation est dans une autre coopérative et votre compte n'a pas le droit de transférer vers une coopérative : choisissez une organisation de la même coopérative.",
  "deplacer.target.newHint": "Pour une nouvelle organisation, créez-la d'abord depuis la page Organisations, puis revenez déplacer.",
  "deplacer.reason.label": "Motif (facultatif)",
  "deplacer.reason.placeholder": "Ex. rattachement confirmé par le CRADESC",
  "deplacer.summary": "Vous allez déplacer {count} {kind} vers « {target} ».",
  "deplacer.tooMany": "Vous pouvez déplacer {max} éléments au plus à la fois.",
  "deplacer.cancel": "Annuler",
  "deplacer.confirm": "Déplacer",
  "deplacer.running": "Déplacement…",
  "deplacer.success": "{count} élément(s) déplacé(s) vers « {target} ».",
  "deplacer.err.needsTransfer":
    "L'organisation est dans une autre coopérative : le droit de transférer vers une coopérative est nécessaire. Rien n'a été déplacé.",
  "deplacer.err.alreadyThere": "Un des éléments est déjà dans cette organisation. Rien n'a été déplacé.",
  "deplacer.err.merged": "Une fiche fusionnée ne se déplace pas : déplacez la fiche gardée. Rien n'a été déplacé.",
  "deplacer.err.archived": "La coopérative de l'organisation est archivée : choisissez une autre organisation.",
  "deplacer.err.network": "Le serveur est injoignable. Rien n'a été déplacé : réessayez dans un instant.",
  "deplacer.err.forbidden": "Votre compte n'a pas le droit de déplacer vers une organisation.",
  "deplacer.err.notFound": "Un élément ou l'organisation de destination est introuvable. Rien n'a été déplacé.",
  "deplacer.err.generic": "Le déplacement a échoué. Rien n'a été déplacé : réessayez.",

  // ── Types d'organisation : une phrase d'aide par type (DONNEES.md §7)
  "orgtype.help.title": "À quoi correspondent les types ?",
  "orgtype.help.note":
    "Ce sont des étiquettes de classement provisoire, en attendant les informations du CRADESC. Un type peut changer sans modifier les membres ni la coopérative de l'organisation.",
  "orgtype.help.GIE": "Groupement d'intérêt économique : des producteurs qui s'associent pour une activité commune (production, achat, vente).",
  "orgtype.help.Union": "Regroupement de plusieurs groupements ou coopératives qui se fédèrent pour agir ensemble.",
  "orgtype.help.Groupement": "Groupe de producteurs, plus informel qu'un GIE, sans statut précisé dans le fichier.",
  "orgtype.help.Section": "Subdivision d'une coopérative (par village ou par zone), sans existence juridique propre.",
  "orgtype.help.OP": "Organisation de producteurs : terme général quand le fichier ne dit pas de quel type il s'agit.",
  "orgtype.help.aPreciser": "Le nom ne permet pas de savoir : à compléter quand le CRADESC donnera l'information.",
  "orgtype.name.OP": "OP",
  "orgtype.name.aPreciser": "À préciser",

  // ── Adhérents sans nom (lignes d'organisation du fichier consolidé)
  "membre.sansNom": "Membre sans nom",

  // ── Parcelles consolidées
  "plot.areaUnknown": "Superficie non renseignée (unité à confirmer par le CRADESC)",
} as const;
