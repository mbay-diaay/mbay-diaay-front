/**
 * Transfert vers une coopérative, origine des fiches (Kobo / consolidé), rattachement à confirmer et fusion stricte.
 * Règles : « REGLES.md » §2 (coopérative globale et transferts), §3 (orphelins), §4 (fusion strictement exacte).
 */
export const transfert = {
  // ── Transfert d'éléments vers une autre coopérative
  "transfert.title": "Transférer vers une coopérative",
  "transfert.description":
    "Les éléments choisis passent dans la coopérative de destination, avec ce qui leur est rattaché (producteurs, parcelles, cultures, dossiers). L'ancienne coopérative reste dans l'historique et l'opération est enregistrée dans l'audit.",
  "transfert.kind.organisations": "organisation(s)",
  "transfert.kind.producers": "producteur(s)",
  "transfert.kind.members": "adhérent(s)",
  "transfert.selection": "Éléments à transférer",
  "transfert.selectionMore": "… et {count} autre(s)",
  "transfert.target.label": "Coopérative de destination",
  "transfert.target.placeholder": "Choisir la coopérative",
  "transfert.target.technicalHint": "Coopérative technique",
  "transfert.target.technicalNote":
    "La coopérative « Hors coopérative » reçoit ce qui n'est pas encore rattaché. Ce n'est pas l'une des 11 coopératives : elle n'entre dans aucun décompte.",
  "transfert.target.newHint":
    "Pour une nouvelle coopérative, créez-la d'abord depuis la page Coopératives, puis revenez transférer.",
  "transfert.reason.label": "Motif (facultatif)",
  "transfert.reason.placeholder": "Ex. rattachement confirmé par le CRADESC",
  "transfert.summary": "Vous allez transférer {count} {kind} vers « {target} ».",
  "transfert.confirm": "Transférer",
  "transfert.running": "Transfert en cours…",
  "transfert.cancel": "Annuler",
  "transfert.tooMany": "Un transfert porte sur {max} éléments au plus : réduisez la sélection.",
  "transfert.success":
    "Transfert terminé vers « {target} » : {organisations} organisation(s), {producers} producteur(s), {members} adhérent(s) et {plots} parcelle(s) déplacés.",
  "transfert.bar.selected": "{count} sélectionné(s)",
  "transfert.bar.clear": "Tout désélectionner",
  "transfert.bar.selectAll": "Sélectionner les {count} résultats",
  "transfert.bar.action": "Transférer vers une coopérative",
  "transfert.selectPage": "Sélectionner toute la page",
  "transfert.selectOne": "Sélectionner {name}",
  "transfert.single": "Transférer vers une coopérative",
  "transfert.err.archived": "La coopérative de destination est archivée : choisissez-en une autre.",
  "transfert.err.alreadyThere": "Un des éléments est déjà dans cette coopérative.",
  "transfert.err.merged": "Une fiche fusionnée ne se transfère pas : transférez la fiche gardée.",
  "transfert.err.nameTaken": "La coopérative de destination a déjà une organisation de ce nom.",
  "transfert.err.network": "Le serveur est injoignable. Aucun élément n'a été déplacé : réessayez dans un instant.",
  "transfert.err.forbidden": "Votre compte n'a pas le droit de transférer vers une autre coopérative.",
  "transfert.err.notFound": "Un élément ou la coopérative de destination est introuvable. Rien n'a été déplacé.",
  "transfert.err.generic": "Le transfert a échoué. Rien n'a été déplacé : réessayez.",

  // ── Origine d'une fiche (colonne « Source », lue sur le serveur)
  "source.short.kobo": "Kobo",
  "source.short.consolidee": "Consolidé",
  "source.short.application": "Saisie",
  "source.place.sheet": "feuille « {sheet} »",
  "source.place.row": "ligne {row}",
  "source.place.file": "fichier {file}",
  "source.place.none": "Aucun emplacement enregistré",
  "source.col.place": "Emplacement dans le fichier",

  // ── Rattachement provisoire
  "placement.badge": "Coopérative à confirmer",
  "placement.noteDefault":
    "Rattachement provisoire en attendant la confirmation du CRADESC. Il se corrige par un transfert vers la bonne coopérative.",
  "placement.fact": "Rattachement",
  "placement.technical": "Coopérative technique",
  "placement.technicalLead":
    "Coopérative technique, hors des 11 coopératives : elle garde ce qui n'est pas encore rattaché. Transférez-en les éléments vers la bonne coopérative.",

  // ── Fusion stricte : erreurs
  "qualite.merge.err.differentes":
    "Ces fiches diffèrent : la fusion est refusée. Corrigez-les après vérification, puis fusionnez.",
  "qualite.merge.err.accountLink": "Les deux fiches ont chacune un compte rattaché : détachez-en un avant de fusionner.",
  "qualite.merge.differences": "Champs qui diffèrent : {fields}.",

  // ── Fusion stricte : libellés des champs comparés
  "qualite.strict.field.firstName": "Prénom",
  "qualite.strict.field.lastName": "Nom",
  "qualite.strict.field.sex": "Sexe",
  "qualite.strict.field.age": "Âge",
  "qualite.strict.field.handicap": "Situation de handicap",
  "qualite.strict.field.phone": "Téléphone",
  "qualite.strict.field.cni": "CNI",
  "qualite.strict.field.village": "Village",
  "qualite.strict.field.scoopId": "Coopérative",
  "qualite.strict.field.orgId": "Organisation",
  "qualite.strict.field.status": "Statut d'adhésion",
  "qualite.strict.field.crops": "Cultures déclarées",
  "qualite.strict.field.enumerator": "Enquêteur",
  "qualite.strict.field.survey": "Enquête socio-économique",
  "qualite.strict.field.plots": "Parcelles et données spatiales",
  "qualite.strict.field.plotCrops": "Cultures des parcelles",
  "qualite.strict.demoRefused":
    "Fusion refusée : ces fiches diffèrent ({fields}). Corrigez-les après vérification, puis fusionnez.",

  // ── Page « Comparer les fiches » : verdict de la règle stricte
  "qualite.strict.differHint": "Ces fiches diffèrent. Corrigez-les après vérification, puis fusionnez.",
  "qualite.strict.verdict.checking": "Comparaison en cours…",
  "qualite.strict.verdict.checkingBody": "Le serveur compare toutes les informations des fiches, parcelles et données spatiales comprises.",
  "qualite.strict.verdict.identical": "Fiches strictement identiques",
  "qualite.strict.verdict.identicalBody":
    "Toutes les informations comparées sont les mêmes : identité, contact, CNI, coopérative, parcelles et données spatiales. La fusion est permise.",
  "qualite.strict.verdict.differ": "Ces fiches diffèrent : fusion impossible pour l'instant",
  "qualite.strict.verdict.differBody": "{hint} Champs qui diffèrent : {fields}.",
  "qualite.strict.verdict.partial": "Seules certaines fiches sont identiques entre elles",
  "qualite.strict.verdict.partialBody":
    "Identiques entre elles : {codes}. Les autres diffèrent : corrigez-les après vérification, puis fusionnez.",
  "qualite.strict.verdict.error": "La comparaison n'a pas pu être faite",
  "qualite.strict.verdict.errorBody":
    "La fusion reste bloquée tant que le serveur n'a pas confirmé que les fiches sont strictement identiques. Relancez la comparaison.",
  "qualite.strict.retry": "Relancer la comparaison",
  "qualite.strict.legend.differ": "Diffère (à corriger)",
  "qualite.strict.legend.same": "Identique",
  "qualite.strict.legend.info": "Information non comparée",
  "qualite.strict.row.surveyYes": "Renseignée",
  "qualite.strict.row.surveyNo": "Absente",
  "qualite.strict.row.differ": "Diffère",
  "qualite.strict.table.hint":
    "Le serveur ne renvoie que les champs qui diffèrent (jamais les valeurs masquées). Un téléphone ou une CNI masqués qui se ressemblent peuvent encore différer : seule la comparaison du serveur fait foi.",
  "qualite.strict.decision.differ": "Ces fiches diffèrent. Corrigez-les après vérification, puis fusionnez.",
  "qualite.strict.decision.identical":
    "Ces fiches sont strictement identiques : vous pouvez les fusionner. Aucune fiche n'est supprimée et la fusion s'annule depuis la page Doublons.",
  "qualite.strict.decision.checking": "Comparaison en cours : le bouton « Fusionner » s'active seulement si les fiches sont identiques.",
  "qualite.strict.decision.error": "Comparaison impossible pour le moment : la fusion reste bloquée.",

  // ── Correction avant fusion
  "qualite.strict.fix.title": "Corriger avant de fusionner",
  "qualite.strict.fix.intro":
    "Après vérification auprès de la coopérative ou du CRADESC, corrigez la valeur qui diffère. N'inventez jamais une valeur. La correction est enregistrée dans l'historique et l'audit, puis la comparaison est relancée.",
  "qualite.strict.fix.sheet": "Fiche à corriger",
  "qualite.strict.fix.field": "Champ à corriger",
  "qualite.strict.fix.value": "Nouvelle valeur (après vérification)",
  "qualite.strict.fix.valuePlaceholder": "Valeur vérifiée",
  "qualite.strict.fix.save": "Enregistrer la correction",
  "qualite.strict.fix.saving": "Enregistrement…",
  "qualite.strict.fix.done": "Fiche {code} corrigée. La comparaison est relancée.",
  "qualite.strict.fix.empty": "Indiquez la valeur vérifiée.",
  "qualite.strict.fix.ageRange": "L'âge doit être un nombre entier entre 15 et 100.",
  "qualite.strict.fix.failed": "La correction n'a pas pu être enregistrée.",
  "qualite.strict.fix.elsewhere":
    "La CNI, la coopérative et les parcelles ne se corrigent pas ici : ouvrez la fiche pour la CNI et les parcelles, ou transférez la fiche vers la bonne coopérative.",
  "qualite.strict.fix.noPerm": "Votre compte n'a pas le droit de corriger une fiche.",
  "qualite.strict.fix.yes": "Oui",
  "qualite.strict.fix.no": "Non",
  "qualite.strict.fix.noOrg": "Aucune organisation",
} as const;
