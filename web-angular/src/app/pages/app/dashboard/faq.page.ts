import { Component, computed, inject, signal } from "@angular/core";
import { RouterLink } from "@angular/router";

import { CRADESC } from "@/config/brand";
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

type FaqCategory = "access" | "network" | "quality" | "data";

interface FaqItem {
  id: string;
  category: FaqCategory;
  categoryLabel: string;
  icon: IconName;
  tone: { bg: string; fg: string };
  question: string;
  answer: string;
  actionRoute?: string;
  actionLabel?: string;
}

const FAQ_ITEMS: readonly FaqItem[] = [
  {
    id: "faq-otp",
    category: "access",
    categoryLabel: "Accès & sécurité",
    icon: "lock",
    tone: TONE.info,
    question: "Pourquoi un code à 6 chiffres est-il demandé à chaque connexion ?",
    answer:
      "La double vérification protège l'accès aux données nominatives des producteurs (CNI, téléphones, parcelles). Après votre mot de passe, un code à usage unique est envoyé sur votre adresse e-mail.",
  },
  {
    id: "faq-activation",
    category: "access",
    categoryLabel: "Accès & sécurité",
    icon: "mail",
    tone: TONE.info,
    question: "Un membre du personnel n'a pas reçu son lien d'activation, que faire ?",
    answer:
      "Depuis la page Personnel, ouvrez la ligne du compte concerné et cliquez sur l'action « Renvoyer l'invitation » (enveloppe). Un nouveau lien d'activation lui est immédiatement envoyé par e-mail.",
    actionRoute: "/dashboard/personnel",
    actionLabel: "Ouvrir Personnel",
  },
  {
    id: "faq-perimetre",
    category: "access",
    categoryLabel: "Accès & sécurité",
    icon: "admin_panel_settings",
    tone: TONE.info,
    question: "Pourquoi un gestionnaire de coopérative ne voit-il pas les fiches des autres SCOOP ?",
    answer:
      "Le périmètre coopératif s'applique automatiquement à toutes les listes, statistiques, alertes et rapports : chaque gestionnaire ou secrétaire ne consulte et ne traite que les données de sa propre coopérative.",
  },
  {
    id: "faq-11-coops",
    category: "network",
    categoryLabel: "Coopératives & HCR",
    icon: "folder_open",
    tone: TONE.culture,
    question: "Pourquoi y a-t-il 11 coopératives et une entrée « Hors coopérative (HCR) » ?",
    answer:
      "La zone des Niayes compte exactement 11 SCOOP de référence. Les fiches ou organisations dont la coopérative n'était pas renseignée dans les fichiers reçus sont placées temporairement dans « Hors coopérative — à rattacher (CRADESC) » (HCR) en attendant leur transfert vers l'une des 11 coopératives.",
    actionRoute: "/dashboard/cooperatives",
    actionLabel: "Voir les coopératives",
  },
  {
    id: "faq-casp-rao",
    category: "network",
    categoryLabel: "Coopératives & HCR",
    icon: "arrow_forward",
    tone: TONE.culture,
    question: "Que signifie la mention « Coopérative à confirmer » sur certaines fiches ?",
    answer:
      "Certaines lignes de la base consolidée (comme CASP_Rao) ont été rattachées provisoirement en attendant confirmation du CRADESC. Un responsable autorisé peut confirmer ou transférer ces fiches vers une autre coopérative à tout moment.",
  },
  {
    id: "faq-doublon-strict",
    category: "quality",
    categoryLabel: "Doublons & CNI",
    icon: "verified",
    tone: TONE.attente,
    question: "Pourquoi ne peut-on pas fusionner deux fiches qui portent le même nom ou la même CNI ?",
    answer:
      "Une personne peut posséder plusieurs parcelles distinctes enregistrées avec la même CNI, ou deux homonymes peuvent exister. La plateforme n'autorise la fusion que si toutes les informations (identité, CNI, téléphone, village, coopérative, parcelles et contours) sont strictement identiques. Si des champs diffèrent, il faut d'abord vérifier et corriger la fiche.",
    actionRoute: "/dashboard/qualite/doublons",
    actionLabel: "Ouvrir les doublons",
  },
  {
    id: "faq-cni-intacte",
    category: "quality",
    categoryLabel: "Doublons & CNI",
    icon: "warning",
    tone: TONE.erreur,
    question: "Pourquoi une CNI avec un format inhabituel n'est-elle pas corrigée automatiquement ?",
    answer:
      "Par règle métier stricte, aucune CNI n'est jamais modifiée, reformatée ni vidée automatiquement lors de l'import. Les formats inhabituels ou CNI proches sont signalés par une alerte afin qu'un humain vérifie auprès du terrain avant toute correction.",
    actionRoute: "/dashboard/qualite/alertes",
    actionLabel: "Voir les alertes CNI",
  },
  {
    id: "faq-kobo-consolide",
    category: "data",
    categoryLabel: "Kobo & consolidé",
    icon: "database",
    tone: TONE.succes,
    question: "Quelle est la différence entre les données « Kobo » et « Consolidé » ?",
    answer:
      "La base Kobo provient de l'enquête socio-économique et cartographique terrain (1 317 producteurs, parcelles et photos). La base consolidée rassemble les listes d'adhérents transmises par les coopératives. Les deux sources restent toujours séparées et identifiables par leur pastille d'origine.",
    actionRoute: "/dashboard/imports",
    actionLabel: "Voir les rapports d'import",
  },
];

/** Questions fréquentes (charte V2). */
@Component({
  selector: "app-faq-page",
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
      .faq-row + .faq-row {
        border-top: 1px solid var(--v2-separateur);
      }
      .faq-trigger {
        display: flex;
        width: 100%;
        align-items: center;
        gap: 14px;
        padding: 18px 22px;
        text-align: left;
        cursor: pointer;
        transition: background-color 0.15s ease;
      }
      .faq-trigger:hover {
        background: color-mix(in oklab, var(--v2-creme) 50%, transparent);
      }
      .faq-ico {
        display: grid;
        height: 38px;
        width: 38px;
        flex-shrink: 0;
        place-items: center;
        border-radius: 12px;
      }
      .faq-chevron {
        display: grid;
        height: 32px;
        width: 32px;
        flex-shrink: 0;
        place-items: center;
        border-radius: 10px;
        color: var(--v2-gris-texte);
        transition: transform 0.2s ease, background-color 0.15s ease;
      }
      .faq-chevron.open {
        transform: rotate(180deg);
        background: var(--v2-creme);
        color: var(--v2-foret);
      }
      .faq-body {
        border-top: 1px solid var(--v2-separateur);
        background: color-mix(in oklab, var(--v2-creme) 45%, transparent);
        padding: 16px 22px 20px 74px;
      }
      @media (max-width: 640px) {
        .faq-body {
          padding: 14px 18px 18px;
        }
      }
      .forest-card {
        border-radius: 24px;
        background: var(--v2-foret);
        color: var(--v2-blanc);
        padding: 24px;
      }
      .forest-chip {
        display: grid;
        height: 42px;
        width: 42px;
        place-items: center;
        border-radius: 14px;
        background: var(--v2-citron);
        color: var(--v2-foret);
      }
      .forest-link {
        display: flex;
        align-items: center;
        gap: 10px;
        border-radius: 14px;
        background: color-mix(in oklab, var(--v2-blanc) 12%, transparent);
        padding: 10px 14px;
        font-size: 14px;
        font-weight: 700;
        color: var(--v2-blanc);
        transition: background-color 0.15s ease;
      }
      .forest-link:hover {
        background: color-mix(in oklab, var(--v2-blanc) 20%, transparent);
      }
      .quick-link {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        border-radius: 14px;
        border: 1px solid var(--v2-separateur);
        padding: 10px 14px;
        font-size: 14px;
        font-weight: 700;
        color: var(--v2-encre);
        transition: border-color 0.15s ease, background-color 0.15s ease;
      }
      .quick-link:hover {
        border-color: var(--v2-foret);
        background: color-mix(in oklab, var(--v2-creme) 55%, transparent);
      }
    `,
  ],
  template: `
    <app-shell perm="dashboard.read" [area]="t()('faq.area')">
      <!-- ───── En-tête ───── -->
      <header class="rise flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div class="min-w-0">
          <p class="mono" style="color: var(--v2-gris-texte)">{{ t()("faq.eyebrow") }}</p>
          <h1 class="mt-2 text-[30px] font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-[38px]">
            {{ t()("faq.title") }}
          </h1>
          <p class="mt-2 max-w-2xl text-[16px] font-medium" style="color: var(--v2-gris-texte)">
            {{ t()("faq.description") }}
          </p>
        </div>
        <a routerLink="/dashboard/guide" class="btn btn-primary">
          {{ t()("faq.openGuide") }}
          <span class="btn-chip"><ui-icon name="menu_book" [size]="20" /></span>
        </a>
      </header>

      <!-- ───── Onglets et recherche ───── -->
      <nav class="tabs rise mt-6" role="tablist" [attr.aria-label]="t()('faq.title')">
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
            [placeholder]="t()('faq.searchPlaceholder')"
            [value]="searchText()"
            (input)="searchText.set($any($event.target).value)"
          />
        </label>
      </div>

      <!-- ───── Grille principale : FAQ + Colonne support ───── -->
      <div class="rise mt-6 grid items-start gap-6 lg:grid-cols-[1.65fr_0.9fr]">
        <div class="card overflow-hidden">
          @if (filteredItems().length) {
            @for (item of filteredItems(); track item.id) {
              <div class="faq-row">
                <button
                  type="button"
                  class="faq-trigger"
                  [attr.aria-expanded]="isOpen(item.id)"
                  (click)="toggleItem(item.id)"
                >
                  <span class="faq-ico" [style.background]="item.tone.bg" [style.color]="item.tone.fg">
                    <ui-icon [name]="item.icon" [size]="20" />
                  </span>
                  <div class="min-w-0 flex-1">
                    <span class="badge mb-1.5" [style.background]="item.tone.bg" [style.color]="item.tone.fg">
                      {{ item.categoryLabel }}
                    </span>
                    <div class="text-[16px] font-extrabold leading-snug tracking-[-0.01em]">
                      {{ item.question }}
                    </div>
                  </div>
                  <span class="faq-chevron" [class.open]="isOpen(item.id)">
                    <ui-icon name="keyboard_arrow_down" [size]="22" />
                  </span>
                </button>

                @if (isOpen(item.id)) {
                  <div class="faq-body">
                    <p class="text-[15px] leading-relaxed" style="color: var(--v2-encre)">
                      {{ item.answer }}
                    </p>
                    @if (item.actionRoute && canOpenRoute(item.actionRoute)) {
                      <div class="mt-3">
                        <a
                          [routerLink]="item.actionRoute"
                          class="inline-flex items-center gap-1.5 text-[14px] font-extrabold"
                          style="color: var(--v2-foret)"
                        >
                          {{ item.actionLabel }}
                          <ui-icon name="arrow_forward" [size]="16" />
                        </a>
                      </div>
                    }
                  </div>
                }
              </div>
            }
          } @else {
            <ui-empty-state
              icon="quiz"
              [title]="t()('faq.emptyTitle')"
              [description]="t()('faq.emptyDesc')"
            >
              <button type="button" class="btn btn-ghost mt-2" (click)="resetFilters()">
                {{ t()("faq.reset") }}
              </button>
            </ui-empty-state>
          }
        </div>

        <!-- ───── Colonne droite : raccourcis + support CRADESC ───── -->
        <aside class="space-y-5 lg:sticky lg:top-6">
          <div class="forest-card">
            <div class="flex items-center gap-3">
              <span class="forest-chip">
                <ui-icon name="support_agent" [size]="22" />
              </span>
              <div>
                <p class="mono" style="color: var(--v2-citron)">CRADESC</p>
                <h2 class="text-[18px] font-extrabold leading-tight">{{ t()("faq.supportTitle") }}</h2>
              </div>
            </div>
            <p class="mt-3 text-[14px] leading-relaxed opacity-90">
              {{ t()("faq.supportDesc") }}
            </p>
            <div class="mt-5 space-y-2.5">
              <a [href]="'mailto:' + cradesc.email" class="forest-link">
                <ui-icon name="mail" [size]="18" />
                <span class="truncate">{{ cradesc.email }}</span>
              </a>
              <a [href]="'tel:' + cradesc.phoneHref" class="forest-link">
                <ui-icon name="call" [size]="18" />
                <span>{{ cradesc.phone }}</span>
              </a>
            </div>
          </div>

          <div class="card p-5">
            <p class="mono" style="color: var(--v2-gris-texte)">Accès utiles</p>
            <div class="mt-3 space-y-2">
              <a routerLink="/dashboard/guide" class="quick-link">
                <span class="flex items-center gap-2.5">
                  <ui-icon name="menu_book" [size]="18" />
                  {{ t()("faq.openGuide") }}
                </span>
                <ui-icon name="arrow_forward" [size]="16" />
              </a>
              @if (canOpenRoute("/dashboard/cooperatives")) {
                <a routerLink="/dashboard/cooperatives" class="quick-link">
                  <span class="flex items-center gap-2.5">
                    <ui-icon name="folder_open" [size]="18" />
                    Coopératives & HCR
                  </span>
                  <ui-icon name="arrow_forward" [size]="16" />
                </a>
              }
              @if (canOpenRoute("/dashboard/qualite")) {
                <a routerLink="/dashboard/qualite" class="quick-link">
                  <span class="flex items-center gap-2.5">
                    <ui-icon name="verified" [size]="18" />
                    Qualité des données
                  </span>
                  <ui-icon name="arrow_forward" [size]="16" />
                </a>
              }
            </div>
          </div>
        </aside>
      </div>
    </app-shell>
  `,
})
export default class FaqPage {
  private readonly locale = inject(LocaleService);
  private readonly store = inject(StoreService);
  protected readonly t = this.locale.t;
  protected readonly cradesc = CRADESC;

  protected readonly searchText = signal("");
  protected readonly selectedCategory = signal<"all" | FaqCategory>("all");
  protected readonly openId = signal<string | null>(FAQ_ITEMS[0]!.id);

  protected readonly categoryOptions: readonly {
    key: "all" | FaqCategory;
    labelKey: "faq.filter.all" | "faq.filter.access" | "faq.filter.network" | "faq.filter.quality" | "faq.filter.data";
    icon: IconName;
  }[] = [
    { key: "all", labelKey: "faq.filter.all", icon: "quiz" },
    { key: "access", labelKey: "faq.filter.access", icon: "lock" },
    { key: "network", labelKey: "faq.filter.network", icon: "folder_open" },
    { key: "quality", labelKey: "faq.filter.quality", icon: "verified" },
    { key: "data", labelKey: "faq.filter.data", icon: "database" },
  ];

  protected readonly filteredItems = computed(() => {
    const query = this.searchText().trim().toLowerCase();
    const category = this.selectedCategory();
    return FAQ_ITEMS.filter((item) => {
      if (category !== "all" && item.category !== category) return false;
      if (!query) return true;
      const haystack = `${item.question} ${item.answer} ${item.categoryLabel}`.toLowerCase();
      return haystack.includes(query);
    });
  });

  protected isOpen(id: string): boolean {
    return this.openId() === id;
  }

  protected toggleItem(id: string): void {
    this.openId.update((current) => (current === id ? null : id));
  }

  protected countForCategory(category: "all" | FaqCategory): number {
    if (category === "all") return FAQ_ITEMS.length;
    return FAQ_ITEMS.filter((item) => item.category === category).length;
  }

  protected canOpenRoute(route: string): boolean {
    if (route === "/dashboard/personnel") return this.store.can("user.manage");
    if (route === "/dashboard/cooperatives") return this.store.can("org.read");
    if (route.startsWith("/dashboard/qualite")) {
      return this.store.can("quality.review") || this.store.can("alert.manage");
    }
    if (route === "/dashboard/imports") return this.store.can("import.manage");
    return true;
  }

  protected resetFilters(): void {
    this.searchText.set("");
    this.selectedCategory.set("all");
  }
}
