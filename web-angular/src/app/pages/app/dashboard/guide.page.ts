import { Component, computed, inject, signal } from "@angular/core";
import { RouterLink } from "@angular/router";

import { AppShellComponent } from "@shared/app-shell.component";
import { LocaleService } from "@shared/locale.service";
import { StoreService } from "@shared/store.service";
import {
  IconComponent,
  TONE,
  UiEmptyStateComponent,
  V2_PAGE_STYLES,
  type IconName,
} from "@shared/ui";

type GuideCategory = "start" | "network" | "producers" | "quality" | "admin";

interface GuideChapter {
  id: string;
  category: GuideCategory;
  categoryLabel: string;
  title: string;
  summary: string;
  icon: IconName;
  tone: { bg: string; fg: string };
  steps: string[];
  route: string;
  routeLabel: string;
}

const CHAPTERS: readonly GuideChapter[] = [
  {
    id: "connexion-navigation",
    category: "start",
    categoryLabel: "Premiers pas",
    title: "Se connecter et naviguer rapidement",
    summary:
      "Connexion sécurisée en deux étapes (mot de passe + code reçu par e-mail) et accès rapide aux écrans autorisés par votre rôle.",
    icon: "lock",
    tone: TONE.info,
    steps: [
      "Saisissez votre adresse e-mail et votre mot de passe sur la page de connexion, puis entrez le code à 6 chiffres reçu par e-mail.",
      "Utilisez le menu latéral à gauche ou le raccourci clavier Cmd+K / Ctrl+K pour ouvrir instantanément n'importe quel écran ou fiche.",
      "Les filtres globaux (coopérative, campagne) en haut de page s'appliquent automatiquement aux listes concernées.",
    ],
    route: "/dashboard",
    routeLabel: "Retour au tableau de bord",
  },
  {
    id: "cooperatives-transferts",
    category: "network",
    categoryLabel: "Réseau & coopératives",
    title: "Gérer les 11 coopératives et les rattachements HCR",
    summary:
      "Consulter les statistiques réelles de chaque SCOOP, qualifier les organisations (GIE, Union, Groupement) et transférer les fiches hors coopérative.",
    icon: "folder_open",
    tone: TONE.culture,
    steps: [
      "Ouvrez Coopératives pour consulter les indicateurs de chaque SCOOP (producteurs, organisations, parcelles, surface).",
      "Les fiches ou organisations sans coopérative connue sont placées dans « Hors coopérative — à rattacher (CRADESC) » (HCR).",
      "Si vous disposez du droit de transfert, sélectionnez les fiches ou organisations dans HCR puis choisissez la coopérative cible : l'historique est conservé.",
    ],
    route: "/dashboard/cooperatives",
    routeLabel: "Ouvrir Coopératives",
  },
  {
    id: "producteurs-dossiers",
    category: "producers",
    categoryLabel: "Producteurs & dossiers",
    title: "Consulter les fiches producteurs et traiter les dossiers",
    summary:
      "Retrouver l'origine des données (Kobo ou Consolidé), consulter les parcelles et cultures, et suivre les demandes d'adhésion.",
    icon: "badge",
    tone: TONE.succes,
    steps: [
      "Dans Producteurs, filtrez par source (Kobo, Consolidé, Saisie), qualité ou coopérative. Les fiches validées sont présentées en priorité.",
      "Sur une fiche producteur, consultez le profil, les parcelles cartographiées, les photos et le panneau « Données d'origine du fichier ».",
      "Les numéros de CNI et téléphones sensibles restent masqués par défaut : leur révélation exige le droit dédié et est enregistrée dans le journal.",
    ],
    route: "/dashboard/producteurs",
    routeLabel: "Ouvrir Producteurs",
  },
  {
    id: "qualite-doublons",
    category: "quality",
    categoryLabel: "Qualité & doublons",
    title: "Vérifier les alertes CNI et traiter les doublons stricts",
    summary:
      "Aucune donnée n'est modifiée automatiquement : toute fusion exige une correspondance stricte après vérification et correction humaine.",
    icon: "verified",
    tone: TONE.attente,
    steps: [
      "Dans Qualité › Alertes, examinez les CNI proches (alerte rouge) et les CNI au format inhabituel (alerte orange) sans jamais modifier une CNI au hasard.",
      "Dans Qualité › Doublons, comparez deux fiches côte à côte. Tant qu'un champ diffère (y compris les parcelles), le bouton Fusionner reste bloqué.",
      "Corrigez d'abord les fiches après confirmation auprès du terrain, puis fusionnez. Toute fusion reste annulable et tracée.",
    ],
    route: "/dashboard/qualite",
    routeLabel: "Ouvrir Qualité des données",
  },
  {
    id: "imports-rapports",
    category: "admin",
    categoryLabel: "Administration & suivi",
    title: "Suivre les rapports Kobo, Base consolidée et exports",
    summary:
      "Contrôler les lots chargés sur le serveur, repérer les éléments orphelins et générer des rapports CSV ou de synthèse.",
    icon: "upload_file",
    tone: TONE.info,
    steps: [
      "La page Imports affiche le rapport du lot Kobo (feuilles, points GeoJSON et dossiers photo orphelins) ainsi que le rapport de la Base consolidée.",
      "Dans Rapports, générez des synthèses par coopérative ou par effectifs au format CSV.",
      "Dans Personnel et Utilisateurs, invitez les collaborateurs, renvoyez un lien d'activation par e-mail et attribuez les rôles autorisés.",
    ],
    route: "/dashboard/imports",
    routeLabel: "Ouvrir Imports",
  },
];

/** Guide d'utilisation de la plateforme (charte V2). */
@Component({
  selector: "app-guide-page",
  imports: [AppShellComponent, IconComponent, RouterLink, UiEmptyStateComponent],
  styles: [
    V2_PAGE_STYLES,
    `
      .tabs {
        display: flex;
        gap: 6px;
        overflow-x: auto;
        scrollbar-width: none;
        border-radius: 18px;
        background: var(--v2-blanc);
        border: 1.5px solid var(--v2-gris-trait);
        box-shadow: 0 2px 10px color-mix(in oklab, var(--v2-foret) 8%, transparent);
        padding: 6px;
      }
      .tabs::-webkit-scrollbar {
        display: none;
      }
      .tab {
        display: inline-flex;
        flex: 1 0 auto;
        justify-content: center;
        align-items: center;
        gap: 8px;
        white-space: nowrap;
        border: none;
        border-radius: 13px;
        background: transparent;
        padding: 12px 18px;
        font-size: 14px;
        font-weight: 700;
        color: var(--v2-ardoise);
        cursor: pointer;
        transition: background-color 0.15s ease, color 0.15s ease;
      }
      .tab:hover {
        background: var(--v2-sauge);
        color: var(--v2-foret);
      }
      .tab.on {
        background: var(--v2-foret);
        color: var(--v2-citron);
      }
      .tab .n {
        border-radius: 999px;
        padding: 1px 8px;
        font-size: 11.5px;
        font-weight: 800;
        font-variant-numeric: tabular-nums;
        background: var(--v2-sauge);
        color: var(--v2-foret);
      }
      .tab.on .n {
        background: var(--v2-citron);
        color: var(--v2-foret);
      }
      .tab:focus-visible {
        outline: 2px solid var(--v2-foret);
        outline-offset: 2px;
      }
      .kind-ico {
        display: grid;
        height: 44px;
        width: 44px;
        flex-shrink: 0;
        place-items: center;
        border-radius: 14px;
      }
      .step-dot {
        display: grid;
        height: 24px;
        width: 24px;
        flex-shrink: 0;
        place-items: center;
        border-radius: 999px;
        background: var(--v2-creme);
        color: var(--v2-foret);
        font-size: 12px;
        font-weight: 800;
      }
    `,
  ],
  template: `
    <app-shell perm="dashboard.read" [area]="t()('guide.area')">
      <!-- ───── En-tête ───── -->
      <header class="rise flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div class="min-w-0">
          <p class="mono" style="color: var(--v2-gris-texte)">{{ t()("guide.eyebrow") }}</p>
          <h1 class="mt-2 text-[30px] font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-[38px]">
            {{ t()("guide.title") }}
          </h1>
          <p class="mt-2 max-w-2xl text-[16px] font-medium" style="color: var(--v2-gris-texte)">
            {{ t()("guide.description") }}
          </p>
        </div>
        <a routerLink="/dashboard/faq" class="btn btn-primary">
          {{ t()("guide.openFaq") }}
          <span class="btn-chip"><ui-icon name="quiz" [size]="20" /></span>
        </a>
      </header>

      <!-- ───── Onglets et recherche ───── -->
      <nav class="tabs rise mt-6" role="tablist" [attr.aria-label]="t()('guide.title')">
        @for (option of categoryOptions; track option.key) {
          <button
            type="button"
            role="tab"
            class="tab"
            [class.on]="selectedCategory() === option.key"
            [attr.aria-selected]="selectedCategory() === option.key"
            (click)="selectedCategory.set(option.key)"
          >
            <ui-icon [name]="option.icon" [size]="16" />
            {{ t()(option.labelKey) }}
            <span class="n">{{ countForCategory(option.key) }}</span>
          </button>
        }
      </nav>

      <div class="rise toolbar mt-5">
        <label class="search">
          <ui-icon name="search" [size]="18" />
          <input
            [placeholder]="t()('guide.searchPlaceholder')"
            [value]="searchText()"
            (input)="searchText.set($any($event.target).value)"
          />
        </label>
      </div>

      <!-- ───── Chapitres du guide ───── -->
      @if (filteredChapters().length) {
        <div class="rise mt-6 grid gap-5 lg:grid-cols-2">
          @for (chapter of filteredChapters(); track chapter.id) {
            <article class="card flex flex-col justify-between p-6">
              <div>
                <div class="flex items-start gap-3.5">
                  <span class="kind-ico" [style.background]="chapter.tone.bg" [style.color]="chapter.tone.fg">
                    <ui-icon [name]="chapter.icon" [size]="22" />
                  </span>
                  <div class="min-w-0 flex-1">
                    <span class="badge" [style.background]="chapter.tone.bg" [style.color]="chapter.tone.fg">
                      {{ chapter.categoryLabel }}
                    </span>
                    <h2 class="mt-2 text-[19px] font-extrabold leading-snug tracking-[-0.01em]">
                      {{ chapter.title }}
                    </h2>
                  </div>
                </div>
                <p class="sub mt-3">{{ chapter.summary }}</p>

                <p class="mono mt-5" style="color: var(--v2-gris-texte)">{{ t()("guide.stepsLabel") }}</p>
                <ol class="mt-3 space-y-2.5">
                  @for (stepText of chapter.steps; track $index; let stepIndex = $index) {
                    <li class="flex items-start gap-2.5 text-[14px] leading-relaxed">
                      <span class="step-dot">{{ stepIndex + 1 }}</span>
                      <span>{{ stepText }}</span>
                    </li>
                  }
                </ol>
              </div>

              @if (canOpenRoute(chapter.route)) {
                <div class="mt-6 border-t pt-4" style="border-color: var(--v2-separateur)">
                  <a [routerLink]="chapter.route" class="btn btn-ghost" style="height: 40px; padding: 0 16px; font-size: 14px">
                    {{ chapter.routeLabel }}
                    <ui-icon name="arrow_forward" [size]="16" />
                  </a>
                </div>
              }
            </article>
          }
        </div>
      } @else {
        <div class="card mt-6">
          <ui-empty-state
            icon="menu_book"
            [title]="t()('guide.emptyTitle')"
            [description]="t()('guide.emptyDesc')"
          >
            <button type="button" class="btn btn-ghost mt-2" (click)="resetFilters()">
              {{ t()("guide.reset") }}
            </button>
          </ui-empty-state>
        </div>
      }
    </app-shell>
  `,
})
export default class GuidePage {
  private readonly locale = inject(LocaleService);
  private readonly store = inject(StoreService);
  protected readonly t = this.locale.t;

  protected readonly searchText = signal("");
  protected readonly selectedCategory = signal<"all" | GuideCategory>("all");

  protected readonly categoryOptions: readonly {
    key: "all" | GuideCategory;
    labelKey: "guide.filter.all" | "guide.filter.start" | "guide.filter.network" | "guide.filter.producers" | "guide.filter.quality" | "guide.filter.admin";
    icon: IconName;
  }[] = [
    { key: "all", labelKey: "guide.filter.all", icon: "menu_book" },
    { key: "start", labelKey: "guide.filter.start", icon: "lock" },
    { key: "network", labelKey: "guide.filter.network", icon: "folder_open" },
    { key: "producers", labelKey: "guide.filter.producers", icon: "badge" },
    { key: "quality", labelKey: "guide.filter.quality", icon: "verified" },
    { key: "admin", labelKey: "guide.filter.admin", icon: "upload_file" },
  ];

  protected readonly filteredChapters = computed(() => {
    const query = this.searchText().trim().toLowerCase();
    const category = this.selectedCategory();
    return CHAPTERS.filter((chapter) => {
      if (category !== "all" && chapter.category !== category) return false;
      if (!query) return true;
      const haystack = [chapter.title, chapter.summary, chapter.categoryLabel, ...chapter.steps]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  });

  protected countForCategory(category: "all" | GuideCategory): number {
    if (category === "all") return CHAPTERS.length;
    return CHAPTERS.filter((chapter) => chapter.category === category).length;
  }

  protected canOpenRoute(route: string): boolean {
    if (route === "/dashboard/cooperatives") return this.store.can("org.read");
    if (route === "/dashboard/producteurs") return this.store.can("producer.read");
    if (route === "/dashboard/qualite") return this.store.can("quality.review") || this.store.can("alert.manage");
    if (route === "/dashboard/imports") return this.store.can("import.manage");
    return true;
  }

  protected resetFilters(): void {
    this.searchText.set("");
    this.selectedCategory.set("all");
  }
}
