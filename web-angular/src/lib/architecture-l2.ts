/**
 * Contenu du livrable L2 « Architecture fonctionnelle et technique », affiché sur la page publique `/architecture`.
 *
 * Mise à jour :
 * - Les droits (tableau « Qui fait quoi », nombre de droits par rôle) sont CALCULÉS depuis `permissions.ts` :
 *   ils suivent d'eux-mêmes toute modification de la matrice par défaut.
 * - Le reste (textes, comptes de test, avancement) se modifie ici, puis se déploie avec le site.
 *   Penser à changer `L2_UPDATED_AT`.
 *
 * Document de référence rédigé en français (comme `docs/`) : il ne passe pas par l'i18n de l'application.
 */
import { DEFAULT_ROLE_PERMISSIONS, PERMISSION_LABEL, type BuiltInRoleId, type Permission } from "./permissions";

export const L2_UPDATED_AT = "2026-11-15";

/** Rôles présentés aux lecteurs, dans l'ordre du document. */
export type DocRoleId = Exclude<BuiltInRoleId, "superadmin">;
export const DOC_ROLES: readonly DocRoleId[] = [
  "admin",
  "faitiere",
  "gestionnaire",
  "representant",
  "bureau",
  "secretaire",
  "surveillance",
  "technicien",
  "ventes",
  "rapports",
];

export const TOTAL_PERMISSIONS = Object.keys(PERMISSION_LABEL).length;
export const permissionCount = (role: DocRoleId): number => DEFAULT_ROLE_PERMISSIONS[role].length;

/* ───────────── Tableau « Qui fait quoi », calculé depuis les droits ───────────── */

export type CellTone = "strong" | "light" | "scope" | "none";
export interface Cell {
  label: string;
  tone: CellTone;
}
const none: Cell = { label: "—", tone: "none" };
const strong = (label: string): Cell => ({ label, tone: "strong" });
const light = (label = "Consulte"): Cell => ({ label, tone: "light" });

export const MATRIX_COLUMNS: readonly { key: string; label: string; cell: (has: (p: Permission) => boolean) => Cell }[] = [
  {
    key: "producteurs",
    label: "Producteurs",
    cell: (has) =>
      has("producer.edit") ? strong(has("identity.read_full") ? "Gère + CNI" : "Gère") : has("producer.read") ? light() : none,
  },
  {
    key: "dossiers",
    label: "Dossiers",
    cell: (has) => (has("dossier.review") ? strong("Décide") : has("dossier.create") ? strong("Crée") : none),
  },
  { key: "adherents", label: "Adhérents", cell: (has) => (has("member.manage") ? strong("Gère") : has("member.read") ? light() : none) },
  {
    key: "cotisations",
    label: "Cotisations",
    cell: (has) => (has("contribution.manage") ? strong("Gère") : has("contribution.read") ? light() : none),
  },
  {
    key: "reunions",
    label: "Réunions",
    cell: (has) =>
      has("meeting.manage") ? strong(has("minutes.manage") ? "Gère + PV" : "Gère") : has("meeting.read") ? light() : none,
  },
  {
    key: "documents",
    label: "Documents",
    cell: (has) => (has("library.manage") ? strong("Gère") : has("library.read") || has("document.read") ? light() : none),
  },
  {
    key: "rapports",
    label: "Rapports",
    cell: (has) => (has("report.generate") ? strong("Produit") : has("report.read") ? light() : none),
  },
  {
    key: "equipe",
    label: "Équipe",
    cell: (has) => (has("user.manage") || has("role.assign") ? strong("Gère") : none),
  },
  {
    key: "commerce",
    label: "Commerce",
    cell: (has) => (has("sales.manage") ? strong("Gère") : has("sales.read") || has("stock.read") ? light() : none),
  },
  {
    key: "journal",
    label: "Journal",
    cell: (has) => (has("audit.read") ? strong("Tout") : has("audit.read.scoop") ? { label: "Sa SCOOP", tone: "scope" } : none),
  },
];

export function matrixRow(role: DocRoleId): Cell[] {
  const perms = new Set(DEFAULT_ROLE_PERMISSIONS[role]);
  const has = (p: Permission) => perms.has(p);
  return MATRIX_COLUMNS.map((column) => column.cell(has));
}

/* ───────────── Rôles : mission, parcours, compte de test ───────────── */

export interface RoleDoc {
  nom: string;
  court: string;
  voit: string;
  mission: string;
  cree: string;
  etapes: readonly [string, string][];
  peut: readonly string[];
  nepeut: readonly string[];
  compte: { email: string; personne: string; perimetre: string; demoSeulement?: boolean };
}

const inviteSteps = (arrivee: string): [string, string][] => [
  ["Création", "Compte rattaché à la coopérative."],
  ["Invitation", "Activation et choix du mot de passe."],
  ["Connexion", "E-mail, mot de passe, code."],
  ["Arrivée", arrivee],
];

export const ROLE_DOCS: Record<DocRoleId, RoleDoc> = {
  admin: {
    nom: "Administrateur CRADESC",
    court: "Administrateur",
    voit: "Tout le réseau",
    mission: "Pilote la plateforme : coopératives, comptes, qualité des données, rapports, journal",
    cree: "Compte mis en place au lancement de la plateforme pour le CRADESC.",
    etapes: [
      ["Mise en place", "Compte de départ du réseau."],
      ["Connexion", "E-mail + mot de passe, puis code reçu par e-mail."],
      ["Sans rattachement", "Il n'appartient à aucune coopérative : il voit tout le réseau."],
      ["Arrivée", "Tableau de bord de tout le réseau, menu complet."],
    ],
    peut: [
      "Créer les coopératives et leurs gestionnaires",
      "Créer et inviter les utilisateurs, attribuer les rôles",
      "Importer des données, fusionner les doublons, corriger",
      "Consulter le journal complet",
      "Gérer référentiels, appareils, sauvegardes et exports",
      "Exporter la liste nominative des producteurs",
      "Voir une CNI complète, avec un motif gardé au journal",
    ],
    nepeut: [
      "Créer ou envoyer un dossier producteur : c'est le rôle du technicien",
      "Animer les réunions d'une coopérative (PV, décisions) : consultation seulement",
    ],
    compte: { email: "aissatou.ndiaye@cradesc.example", personne: "Aïssatou Ndiaye", perimetre: "Tout le réseau" },
  },
  faitiere: {
    nom: "Faîtière (USCN)",
    court: "Faîtière",
    voit: "Ses coopératives",
    mission: "Suit ses coopératives en consultation et produit des rapports",
    cree: "Créée par l'administrateur CRADESC, puis liée à une ou plusieurs coopératives.",
    etapes: [
      ["Création", "L'administrateur crée le compte et le lie à ses coopératives."],
      ["Invitation", "Activation et choix du mot de passe."],
      ["Connexion", "E-mail, mot de passe, code."],
      ["Arrivée", "Tableau de bord de ses coopératives, en consultation."],
    ],
    peut: [
      "Consulter producteurs, organisations, carte, adhérents",
      "Voir cotisations, réunions, documents, ventes, stocks, exploitation",
      "Produire et télécharger des rapports",
    ],
    nepeut: ["Modifier quoi que ce soit", "Voir une CNI complète", "Gérer des comptes, des imports ou le journal"],
    compte: { email: "ousmane.gueye@uscn.example", personne: "Ousmane Guèye", perimetre: "SCOOP s1 et s2, consultation" },
  },
  gestionnaire: {
    nom: "Gestionnaire de SCOOP",
    court: "Gestionnaire",
    voit: "Sa SCOOP",
    mission: "Gère l'équipe, les techniciens, les dossiers, les adhérents et la vie de la coopérative",
    cree: "Créé par l'administrateur CRADESC, en même temps que sa coopérative.",
    etapes: [
      ["Création", "L'administrateur crée la coopérative et son gestionnaire."],
      ["Invitation", "Il reçoit un lien, active son compte et choisit son mot de passe."],
      ["Connexion", "E-mail, mot de passe, code."],
      ["Arrivée", "Tableau de bord de sa coopérative."],
    ],
    peut: [
      "Créer son équipe et les rôles de sa coopérative",
      "Ajouter des techniciens (code à 5 chiffres)",
      "Modifier les fiches producteurs et les organisations",
      "Examiner et décider des dossiers",
      "Gérer adhérents, cotisations, réunions, PV, décisions, documents",
      "Gérer ventes, stocks, crédits, plans et calendrier",
      "Produire les rapports, consulter le journal de sa coopérative",
    ],
    nepeut: ["Voir une CNI complète", "Importer des données ou régler la plateforme", "Voir les autres coopératives"],
    compte: { email: "babacar.fall@scoop-kms.example", personne: "Babacar Fall", perimetre: "SCOOP s1" },
  },
  representant: {
    nom: "Représentant de SCOOP",
    court: "Représentant",
    voit: "Sa SCOOP",
    mission: "Représente la coopérative : adhérents, cotisations, réunions, équipe",
    cree: "Créé par le gestionnaire de la coopérative (ou par l'administrateur).",
    etapes: inviteSteps("Tableau de bord de sa coopérative, page Équipe."),
    peut: [
      "Gérer les adhérents et attribuer des rôles dans sa coopérative",
      "Gérer cotisations, réunions, PV, décisions, documents",
      "Examiner et décider des dossiers",
      "Produire les rapports, consulter le journal de sa coopérative",
    ],
    nepeut: ["Voir une CNI complète", "Modifier les fiches producteurs", "Voir les autres coopératives"],
    compte: { email: "moussa.diouf@scoop-kms.example", personne: "Moussa Diouf", perimetre: "SCOOP s1" },
  },
  bureau: {
    nom: "Élu du bureau",
    court: "Bureau",
    voit: "Sa SCOOP",
    mission: "Réunions, validation des PV, décisions, cotisations",
    cree: "Créé par le gestionnaire de la coopérative.",
    etapes: inviteSteps("Tableau de bord de sa coopérative, réunions."),
    peut: [
      "Animer les réunions, valider les PV, enregistrer les décisions",
      "Gérer adhérents et cotisations",
      "Gérer les documents de la coopérative",
      "Examiner les dossiers, produire les rapports",
      "Consulter le journal de sa coopérative",
    ],
    nepeut: ["Gérer l'équipe ou les rôles", "Accéder au commerce et à l'exploitation", "Voir une CNI complète"],
    compte: { email: "cheikh.ndiaye@scoop-kms.example", personne: "Cheikh Ndiaye", perimetre: "SCOOP s1" },
  },
  secretaire: {
    nom: "Secrétaire de SCOOP",
    court: "Secrétaire",
    voit: "Sa SCOOP",
    mission: "Examine les dossiers, prépare réunions et PV, tient les documents",
    cree: "Créé par le gestionnaire ou ajouté à l'équipe par le représentant.",
    etapes: inviteSteps("Tableau de bord de sa coopérative."),
    peut: [
      "Préparer les réunions et rédiger les PV",
      "Gérer les documents",
      "Examiner les dossiers",
      "Consulter adhérents, producteurs, cotisations, plans, stocks",
    ],
    nepeut: ["Enregistrer les décisions de réunion", "Gérer les adhérents ou les rôles", "Produire des rapports"],
    compte: { email: "aminata.ba@scoop-kms.example", personne: "Aminata Bâ", perimetre: "SCOOP s1" },
  },
  surveillance: {
    nom: "Conseil de surveillance",
    court: "Surveillance",
    voit: "Sa SCOOP",
    mission: "Contrôle en consultation, accès au journal de sa coopérative",
    cree: "Créé par le gestionnaire de la coopérative.",
    etapes: inviteSteps("Tableau de bord de sa coopérative, en consultation."),
    peut: [
      "Consulter producteurs, adhérents, cotisations, réunions, documents",
      "Consulter et télécharger les rapports",
      "Consulter le journal de sa coopérative",
    ],
    nepeut: ["Modifier quoi que ce soit"],
    compte: { email: "awa.sy@scoop-kms.example", personne: "Awa Sy", perimetre: "SCOOP s1, consultation" },
  },
  technicien: {
    nom: "Technicien",
    court: "Technicien",
    voit: "Une ou plusieurs SCOOP",
    mission: "Recense : crée et envoie les dossiers producteurs",
    cree: "Ajouté par le gestionnaire de la coopérative, qui lui remet un code à 5 chiffres.",
    etapes: [
      ["Ajout", "Le gestionnaire saisit nom, téléphone, sexe, âge et photo."],
      ["Code", "Code à 5 chiffres, valable 72 h, une seule fois, remis en main propre."],
      ["Activation sur téléphone", "Numéro + code, puis choix du mot de passe."],
      ["Ensuite", "Numéro + mot de passe sur le mobile ; e-mail + mot de passe + code sur le web."],
    ],
    peut: [
      "Créer et envoyer des dossiers producteurs (photo, pièces jointes)",
      "Consulter producteurs, GIE et documents",
      "Relever les parcelles au GPS sur le mobile",
    ],
    nepeut: ["Décider d'un dossier", "Modifier une fiche producteur déjà acceptée", "Gérer adhérents, réunions ou finances"],
    compte: { email: "fatou.sarr@cradesc.example", personne: "Fatou Sarr", perimetre: "SCOOP s1 et s2" },
  },
  ventes: {
    nom: "Responsable des ventes",
    court: "Ventes",
    voit: "Sa SCOOP",
    mission: "Ventes et consultation des stocks",
    cree: "Créé par le gestionnaire de la coopérative.",
    etapes: inviteSteps("Tableau de bord, ventes et stock."),
    peut: ["Consulter et gérer les ventes", "Consulter le stock et le tableau de bord"],
    nepeut: ["Tout le reste : pas d'accès aux producteurs, rapports ou dossiers"],
    compte: { email: "ibrahima.seck@scoop-kms.example", personne: "Ibrahima Seck", perimetre: "Démonstration seulement", demoSeulement: true },
  },
  rapports: {
    nom: "Responsable des rapports",
    court: "Rapports",
    voit: "Sa SCOOP",
    mission: "Produit et télécharge les rapports",
    cree: "Créé par le gestionnaire de la coopérative.",
    etapes: inviteSteps("Tableau de bord et page Rapports."),
    peut: ["Produire, consulter et télécharger les rapports", "Consulter ventes, producteurs, plans, campagnes, dépenses"],
    nepeut: ["Modifier des données", "Gérer l'équipe, les dossiers ou les cotisations"],
    compte: { email: "rokhaya.diallo@scoop-kms.example", personne: "Rokhaya Diallo", perimetre: "Démonstration seulement", demoSeulement: true },
  },
};

export const TEST_ACCESS = { site: "www.mbaydiaay.com", password: "Demonstration2026", code: "000000" } as const;

/* ───────────── Arborescences ───────────── */

export const TREES = {
  reseau: `CRADESC                           vue d'ensemble de tout le réseau
└── Faîtière (USCN)               consulte ses coopératives liées
    ├── SCOOP A                   espace fermé
    │   ├── Gestionnaire, représentant, bureau, secrétaire, surveillance
    │   ├── Rôles propres à la coopérative
    │   ├── GIE / sections
    │   │   └── Producteurs ──► Adhérents ──► Cotisations
    │   ├── Réunions ──► PV ──► Décisions
    │   └── Documents (statuts, agrément, PV…)
    ├── SCOOP B
    │   └── …
    └── Technicien                travaille pour une ou plusieurs SCOOP`,
  cascade: `Administrateur CRADESC                      voit tout le réseau
├── crée et lie ──► Faîtière                consulte les coopératives liées
├── crée ──► Coopérative A + son gestionnaire
│   └── Gestionnaire A
│       ├── crée ──► Équipe de A            bureau, secrétaire, autres rôles…
│       ├── ajoute ──► Technicien           code à 5 chiffres, application mobile
│       │   └── recense ──► Fiches de A     producteurs et GIE (pas de compte)
│       └── enregistre ──► Fiches de A
└── crée ──► Coopérative B + son gestionnaire
    └── Gestionnaire B
        ├── crée ──► Équipe de B            sans lien avec celle de A
        └── enregistre ──► Fiches de B
            ▲
            └── le technicien de A peut y travailler si B le lie`,
  connexion: `Se connecter
├── 1. Le compte est créé                  par un administrateur ou un gestionnaire
├── 2. Invitation reçue par e-mail
├── 3. Choix du mot de passe
├── 4. Page de connexion : e-mail + mot de passe
│   ├── erreur ──► nouvel essai
│   └── mot de passe oublié ──► code par e-mail ──► nouveau mot de passe
├── 5. Code à 6 chiffres reçu par e-mail   valable 10 minutes
│   ├── nouveau code possible après 30 secondes
│   └── 5 codes faux ──► connexion à recommencer
└── 6. Tableau de bord adapté
    ├── tout le réseau ──────────► Administrateur CRADESC
    ├── ses coopératives ────────► Faîtière (consultation)
    ├── sa coopérative ──────────► Gestionnaire, représentant, bureau,
    │                              secrétaire, surveillance, ventes, rapports
    └── ses coopératives ────────► Technicien`,
  dossier: `Dossier producteur
├── 1. Le technicien crée le dossier       identité, photo, CNI, village, GIE, pièces jointes
├── 2. Il l'envoie à la coopérative         contrôle des champs, alerte en cas de doublon
├── 3. La coopérative l'examine             gestionnaire, représentant, bureau ou secrétaire
│   ├── complément demandé ──► retour au technicien
│   ├── refusé (avec motif)
│   └── accepté ──► fiche producteur créée, adhésion si demandée
└── 4. La fiche reprend la photo du dossier`,
  technicien: `Technicien
├── Le gestionnaire l'ajoute                 nom, téléphone, sexe, âge, photo
├── La plateforme donne un code à 5 chiffres valable 72 h, une seule fois, remis en main propre
├── Sur son téléphone : numéro + code ──► il choisit son mot de passe
└── Ensuite : numéro + mot de passe`,
  image: `Image d'une fiche        logo de coopérative, photo de producteur, de personnel, de technicien
├── Dans le formulaire d'enregistrement   glisser l'image ou cliquer, aperçu immédiat
├── Formats acceptés                      JPEG, PNG ou WebP
├── Image allégée automatiquement         rapide à envoyer, même avec une connexion faible
└── Visible dans les listes et sur la fiche, conservée en lieu sûr`,
  menu: `Console Mbay Diaay
├── Tableau de bord
├── Rapports
├── Administratif
│   ├── Ma coopérative · Coopératives
│   ├── Personnel · Techniciens
│   ├── Producteurs · Dossiers producteurs
│   ├── GIE & Organisation
│   ├── Cotisations · Réunions
│   ├── Documents · Rappels
│   └── Qualité des données     (alertes, doublons, corrections)
├── Commerce                    (stocks d'intrants, crédits, ventes, charges)
├── Exploitation                (plans, campagnes, calendriers culturaux, suivi)
└── Administration
    ├── Utilisateurs & rôles · Comptes & liaisons
    ├── Rôles de la coopérative
    ├── Appareils · Référentiels
    ├── Imports · Sauvegarde & export
    └── Journal d'audit`,
  mobile: `Application des techniciens
├── Ouverture
│   ├── première fois ──► Numéro de téléphone ──► Code ──► Choix du PIN
│   └── ensuite ────────► Code PIN
│                          └── 3 essais faux ──► Téléphone bloqué
└── 5 onglets
    ├── Accueil         (chiffres clés, état de la connexion)
    ├── Producteurs     (liste, fiche, création, archives)
    ├── Carte           (parcelles relevées)
    ├── À compléter     (corrections demandées, envois en attente)
    └── Profil          (compte, réseau, révocation)`,
  composants: `Console web (Angular)  ──┐
                        ├── HTTPS · JSON · JWT ──► API NestJS (api.mbaydiaay.com/v1)
App mobile (Flutter)  ──┘                            ├── PostgreSQL 16 + PostGIS   données
                                                     ├── Redis 7 + BullMQ          tâches de fond (worker)
                                                     ├── MinIO (S3 privé)          logos, photos, documents
                                                     └── Resend                    e-mails (codes)`,
  depotApi: `mbay-diaay-api/
├── apps/api/src/
│   ├── main.ts · worker.ts · migrate.ts   serveur HTTP, worker, migrations
│   ├── auth/          connexion, code e-mail, technicien mobile
│   ├── access/        JWT, garde des droits, périmètre
│   ├── users/         comptes, personnel, techniciens, photos
│   ├── admin/         coopératives, producteurs, adhérents, rôles
│   ├── media/         logos et photos, liens signés
│   ├── storage/       client S3 vers MinIO
│   ├── mail/          Resend
│   ├── audit/         journal
│   ├── common/        matrice des droits, erreurs, pagination
│   ├── entities/      tables mappées
│   ├── migrations/    migrations versionnées
│   └── skeletons/     modules M2 à M5 réservés
├── infra/             Docker Compose (production, développement), schéma CRADESC v2
├── docs/              routes, guide mobile, déploiement, openapi.json
└── .github/workflows/ contrôle, tests, build, image Docker, déploiement`,
  depotWeb: `mbay-diaay/web-angular/
├── src/app/pages/              une page = un fichier ; (app)/dashboard/ ≈ 33 écrans
│   ├── architecture.page.ts    ce rapport (public)
│   └── construction.page.ts    écran « site en construction »
├── src/app/shared/             coque, menu, dialogues ; ui/ = kit d'interface
├── src/lib/                    logique métier : store, droits, périmètre, menu
│   ├── architecture-l2.ts      contenu de ce rapport
│   ├── site-gate.ts            code d'accès du site
│   ├── api/ · auth/            client HTTP, jetons, médias ; mode API ou démo
│   ├── i18n/                   français, wolof
│   └── mock/                   données de démonstration
├── src/config/brand.ts         marque, photos de connexion
└── Dockerfile · nginx.conf · .env.production`,
  depotMobile: `mobile-app/lib/app/
├── modules/     splash, activation, lock, shell (5 onglets), producer, survey, sync
├── services/    client API, authentification, dépôt producteurs (cache hors ligne)
├── routes/      routes et transitions
├── core/        couleurs, typographie, animations
├── widgets/     composants partagés
└── data/        données fictives, catalogue des cultures`,
  livraison: `Chaîne de livraison de l'API
├── push sur main
├── GitHub Actions : contrôle des types ──► tests ──► build
├── Publication de l'image Docker (GHCR)
├── Déclenchement du déploiement ──► le serveur retélécharge l'image et redémarre
└── Migrations : node dist/migrate.js dans le conteneur api`,
} as const;

/* ───────────── Tableaux ───────────── */

export const PHOTO_CREDITS = [
  { photo: "Rangs d'oignons au goutte-à-goutte", auteur: "Pacocreat", licence: "CC BY-SA 4.0", obligatoire: true, source: "File:Ognons_(_sénégal_)_22.jpg" },
  { photo: "Lac de Wakhinane (Niayes)", auteur: "Pamgueye", licence: "CC BY-SA 4.0", obligatoire: true, source: "File:Lac_de_wakhinane_10.jpg" },
  { photo: "Rangs de salades, Agnam-Goly", auteur: "Adama Diop", licence: "Domaine public", obligatoire: false, source: "File:Dans_le_jardin_de_Agnam-Goly.jpg" },
  { photo: "Jardin en agroforesterie, Kédougou", auteur: "treesftf", licence: "CC BY 2.0", obligatoire: true, source: "File:KedougouAgroforestry.jpg" },
  { photo: "Champ maraîcher", auteur: "Lifelame44", licence: "CC0", obligatoire: false, source: "File:Champ_de_Khadim_Diop_14.jpg" },
] as const;

export type Progress = "ok" | "part" | "todo";
export const PROGRESS_LABEL: Record<Progress, string> = { ok: "Opérationnel", part: "En cours", todo: "À venir" };

export const AVANCEMENT: readonly { fonction: string; etat: Progress; detail: string }[] = [
  { fonction: "Connexion, comptes, rôles, espaces fermés", etat: "ok", detail: "Enregistrés durablement, séparation des coopératives vérifiée" },
  { fonction: "Personnel et techniciens", etat: "ok", detail: "Ajout, code technicien, activation sur téléphone, photos" },
  { fonction: "Logos et photos", etat: "ok", detail: "Conservés en lieu sûr, affichés dans les listes et les fiches" },
  { fonction: "Journal d'audit", etat: "ok", detail: "Actions sensibles enregistrées" },
  { fonction: "Coopératives, producteurs, adhérents, cotisations, réunions", etat: "part", detail: "Écrans prêts ; l'enregistrement définitif dans la base du CRADESC est en cours de branchement" },
  { fonction: "Mobile : producteurs, parcelles, cultures", etat: "part", detail: "Liste des producteurs reçue du serveur ; les saisies restent sur le téléphone en attendant l'envoi automatique" },
  { fonction: "Commerce et exploitation", etat: "todo", detail: "Écrans de démonstration, développement prévu dans les modules suivants" },
  { fonction: "Wolof", etat: "todo", detail: "Textes à faire relire par un locuteur" },
  { fonction: "Crédits photo et logos officiels", etat: "todo", detail: "Page « Mentions et crédits » et fichiers officiels" },
];

export const PROCHAINES_ETAPES: readonly string[] = [
  "Enregistrer définitivement coopératives, producteurs et dossiers dans la base du CRADESC.",
  "Envoyer automatiquement au serveur les saisies faites sur le terrain (producteurs, parcelles, cultures).",
  "Faire relire les textes en wolof.",
  "Retirer les comptes de test et l'écran « en construction » avant l'ouverture aux vrais utilisateurs.",
];

export const API_ROUTES: readonly { domaine: string; routes: string; usage: string }[] = [
  { domaine: "Santé", routes: "GET /health · GET /ready", usage: "Supervision (Postgres, Redis)" },
  { domaine: "Connexion", routes: "POST /auth/sign-in · /auth/otp/verify · /auth/otp/resend · /auth/refresh · GET /me", usage: "E-mail + mot de passe, code à 6 chiffres ; jetons 1 h / 7 j" },
  { domaine: "Technicien mobile", routes: "POST /auth/technician/activate · /auth/technician/sign-in", usage: "Téléphone + code à 5 chiffres, puis téléphone + mot de passe" },
  { domaine: "Comptes", routes: "/users · /scoops/:id/accounts · /scoops/:id/technicians", usage: "Création, modification, activation, liaison" },
  { domaine: "Rôles de coopérative", routes: "/scoops/:id/roles", usage: "Sous-rôles propres à une coopérative" },
  { domaine: "Administratif", routes: "/scoops · /organisations · /producers · /members · /contributions · /meetings · /documents", usage: "Listes paginées filtrées par périmètre" },
  { domaine: "Pièce d'identité", routes: "POST /producers/:id/cni/reveal", usage: "CNI complète, avec motif et trace" },
  { domaine: "Logos et photos", routes: "PUT/GET/DELETE /scoops/:id/logo · /producers/:id/photo · /users/:id/photo · GET /media/:id", usage: "JPEG, PNG, WebP ; 2 Mo ; lien signé 1 h" },
  { domaine: "Journal", routes: "GET /audit", usage: "Complet ou limité à sa coopérative" },
];

export const TECH_STACK: readonly { app: string; techno: string; tests: string }[] = [
  { app: "API", techno: "TypeScript, Node.js 22, NestJS 11, TypeORM, PostgreSQL 16 + PostGIS, Redis 7 + BullMQ, MinIO (S3), Resend, OpenAPI 3", tests: "Jest" },
  { app: "Web", techno: "Angular 22, Analog 2.9 (routage par fichiers), Vite 8, Tailwind CSS 4, Leaflet, SheetJS ; site statique servi par nginx", tests: "Vitest, Playwright" },
  { app: "Mobile", techno: "Flutter 3.27+, GetX, http, flutter_secure_storage, shared_preferences, camera, geolocator, maps_toolkit, image_picker", tests: "flutter analyze" },
];

export const ENV_VARS: readonly { groupe: string; vars: string }[] = [
  { groupe: "Général", vars: "NODE_ENV · PORT · API_PREFIX · CORS_ORIGINS · SWAGGER_ENABLED" },
  { groupe: "Base", vars: "POSTGRES_USER · POSTGRES_PASSWORD · POSTGRES_DB · TYPEORM_SYNC=false" },
  { groupe: "Redis", vars: "REDIS_PASSWORD" },
  { groupe: "Jetons", vars: "JWT_ACCESS_SECRET · JWT_REFRESH_SECRET · JWT_ACCESS_TTL · JWT_REFRESH_TTL" },
  { groupe: "Fichiers", vars: "MINIO_ROOT_USER · MINIO_ROOT_PASSWORD · MINIO_BUCKET" },
  { groupe: "E-mail", vars: "MAIL_PROVIDER · MAIL_FROM · RESEND_API_KEY" },
  { groupe: "Tests", vars: "TEST_ACCOUNTS_OTP=true : code 000000 pour les comptes en .example ; à repasser à false à la fin des tests" },
  { groupe: "Site web", vars: "VITE_API_URL · VITE_DEMO_MODE · VITE_SITE_GATE (écran en construction) · VITE_SITE_ACCESS_CODE" },
];
