import { MAX_PAGE_SIZE } from "@/lib/api/pagination";
import { isPlatformBrowser } from "@angular/common";
import { Component, PLATFORM_ID, computed, effect, inject, signal, untracked } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { map } from "rxjs";

import { isPhoneInputAccepted } from "@/lib/phone-sn";
import { isApiMode } from "@/lib/api/config";
import { producerItem, sheetDraft } from "@/lib/coop-request-templates";
import { fetchProducerPhotos, listPlots, plotFromApi } from "@/lib/api/plots";
import { getProducer, producerFromApi } from "@/lib/api/producers";
import { fmtAge, fmtDate, fmtDateTime, maskCni, maskPhone, nf, nf1 } from "@/lib/format";
import type { MessageKey } from "@/lib/i18n";
import type {
  CorrectionChange,
  KoboPhoto,
  PhotoRole,
  Plot,
  PlotCropDetail,
  PlotSeason,
  Producer,
} from "@/lib/mock/data";
import { inScope } from "@/lib/store";
import { AppShellComponent } from "@shared/app-shell.component";
import { CniAlertPanelComponent } from "@shared/cni-alert-panel.component";
import { SourceValuesPanelComponent } from "@shared/source-values-panel.component";
import { ContactScoopModalComponent, type CoopRequestTarget } from "@shared/contact-scoop-modal.component";
import { LocaleService } from "@shared/locale.service";
import { PlotMapComponent } from "@shared/plot-map.component";
import { ProducerWorkflow } from "@shared/producer-workflow.service";
import { StoreService } from "@shared/store.service";
import {
  DetailHeroComponent,
  IconComponent,
  initialsOf,
  ModalComponent,
  SnackbarService,
  StatCardsComponent,
  TextFieldComponent,
  TONE,
  V2_PAGE_STYLES,
  type HeroBadge,
  type HeroMeta,
  type StatCard,
} from "@shared/ui";

/** Couleur d'état d'une parcelle (charte V2). */
const PLOT_TONE: Record<string, { bg: string; fg: string }> = {
  relevée: TONE.info,
  validée: TONE.succes,
  "à reprendre": TONE.attente,
  chevauchement: TONE.erreur,
};

const QUALITY_TONE: Record<Producer["quality"], { label: MessageKey; bg: string; fg: string }> = {
  validé: { label: "producteurs.quality.validé", ...TONE.succes },
  "à vérifier": { label: "producteurs.quality.à vérifier", ...TONE.attente },
  doublon: { label: "producteurs.quality.doublon", ...TONE.info },
  invalide: { label: "producteurs.quality.invalide", ...TONE.erreur },
};

const STATUS_KEY = {
  recensé: "producteurs.status.recensé",
  membre: "producteurs.status.membre",
} as const satisfies Record<Producer["status"], MessageKey>;


/** Superficies et rendements : deux décimales (les parcelles des Niayes font souvent moins d'un hectare). */
const nf2 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

/** Ordre d'affichage des photos dans la galerie. */
const PHOTO_ROLES: readonly PhotoRole[] = ["producteur", "parcelle", "document_foncier", "non_identifiee"];

const PHOTO_ROLE_KEY = {
  producteur: "producteurs.photos.role.producteur",
  parcelle: "producteurs.photos.role.parcelle",
  document_foncier: "producteurs.photos.role.document_foncier",
  non_identifiee: "producteurs.photos.role.non_identifiee",
} as const satisfies Record<PhotoRole, MessageKey>;

const SEASON_KEYS = [
  { key: "chn", label: "producteurs.production.season.chn" },
  { key: "cs", label: "producteurs.production.season.cs" },
] as const satisfies readonly { key: "chn" | "cs"; label: MessageKey }[];

/**
 * Fiche producteur (charte V2) : en-tête, chiffres clés, identité (CNI et téléphone révélés avec trace),
 * carte et tableau des parcelles, cultures, historique ; demande de correction et révélation CNI en modale.
 */
@Component({
  selector: "app-producteur-detail-page",
  imports: [
    AppShellComponent,
    CniAlertPanelComponent,
    SourceValuesPanelComponent,
    ContactScoopModalComponent,
    DetailHeroComponent,
    IconComponent,
    ModalComponent,
    PlotMapComponent,
    RouterLink,
    StatCardsComponent,
    TextFieldComponent,
  ],
  styles: [
    V2_PAGE_STYLES,
    `
      .grid-main {
        display: grid;
        gap: 16px;
      }
      @media (min-width: 1100px) {
        .grid-main {
          grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
        }
      }
      .map {
        height: 100%;
        min-height: 300px;
      }
      .timeline li {
        position: relative;
        display: flex;
        gap: 14px;
        padding: 12px 20px;
        border-top: 1px solid var(--v2-separateur);
      }
      .dot {
        margin-top: 4px;
        height: 12px;
        width: 12px;
        flex-shrink: 0;
        border-radius: 999px;
        background: var(--v2-foret);
        box-shadow: 0 0 0 4px var(--v2-sauge);
      }
      .chg {
        display: grid;
        gap: 6px;
        border-radius: 16px;
        background: var(--v2-creme);
        padding: 12px 14px;
        font-size: 14px;
      }
      .seg-form button {
        flex: 1;
        justify-content: center;
      }
      .two-cols {
        display: grid;
        gap: 16px;
      }
      @media (min-width: 1024px) {
        .two-cols {
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        }
      }
      /* Listes de libellés (difficultés, besoins, infrastructures…) : puces. */
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 6px;
      }
      .band {
        border-top: 1px solid var(--v2-separateur);
        padding: 14px 20px;
      }
      .band-grid {
        display: grid;
        gap: 16px;
      }
      @media (min-width: 900px) {
        .band-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }
      .text-block {
        margin-top: 6px;
        white-space: pre-line;
        font-size: 14px;
        font-weight: 600;
      }
      .chevron {
        display: inline-grid;
        transition: transform 0.15s ease;
      }
      .chevron.open {
        transform: rotate(90deg);
      }
      .detail-cell {
        background: var(--v2-creme);
        padding: 0 !important;
      }
      .detail-cell .facts {
        border-top: 0;
      }
      .detail-cell .fact {
        padding: 12px 20px;
      }
      .crop-line {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px;
        border-top: 1px solid var(--v2-separateur);
        padding: 10px 20px;
        font-size: 14px;
      }
      .crop-card {
        border-top: 1px solid var(--v2-separateur);
        padding: 16px 20px;
      }
      .mini-facts {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        gap: 10px 16px;
        margin-top: 12px;
      }
      .mini-facts dt {
        font-size: 12px;
        font-weight: 600;
        color: var(--v2-gris-texte);
      }
      .mini-facts dd {
        margin-top: 2px;
        font-size: 14px;
        font-weight: 800;
      }
      .season-tbl {
        margin-top: 12px;
        border-radius: 16px;
        border: 1px solid var(--v2-separateur);
        overflow: hidden;
      }
      .season-tbl .tbl td,
      .season-tbl .tbl th {
        padding-top: 9px;
        padding-bottom: 9px;
      }
      .gallery {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
        gap: 10px;
        margin-top: 10px;
      }
      .thumb {
        position: relative;
        aspect-ratio: 1;
        overflow: hidden;
        border-radius: 16px;
        border: 1px solid var(--v2-bord-carte);
        background: var(--v2-creme);
        cursor: zoom-in;
      }
      .thumb img {
        height: 100%;
        width: 100%;
        object-fit: cover;
        transition: transform 0.2s ease;
      }
      .thumb:hover img {
        transform: scale(1.04);
      }
      .thumb:focus-visible {
        outline: 2px solid var(--v2-foret);
        outline-offset: 2px;
      }
      .alerte {
        display: flex;
        gap: 12px;
        align-items: flex-start;
        border-radius: 18px;
        padding: 16px 18px;
        background: var(--v2-attente-bg);
        color: var(--v2-attente-fg);
      }
      .alerte-ico {
        display: grid;
        flex: none;
        place-items: center;
        width: 36px;
        height: 36px;
        border-radius: 12px;
        background: color-mix(in oklab, var(--v2-attente-fg) 14%, transparent);
      }
      .alerte-titre {
        margin: 0;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .alerte-texte {
        margin: 4px 0 0;
        font-size: 15px;
        font-weight: 600;
        line-height: 1.45;
      }
      .alerte-liste {
        display: grid;
        gap: 8px;
        margin: 12px 0 0;
        padding: 0;
        list-style: none;
      }
      .alerte-liste li {
        display: flex;
        flex-wrap: wrap;
        gap: 4px 10px;
        align-items: baseline;
        border-radius: 12px;
        padding: 8px 12px;
        font-size: 14px;
        font-weight: 600;
        background: color-mix(in oklab, var(--v2-blanc) 55%, transparent);
      }
      .alerte-lieu {
        font-family: var(--v2-font-mono);
        font-size: 11.5px;
        font-weight: 800;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .alerte-aide {
        margin: 12px 0 0;
        font-size: 13.5px;
        font-weight: 500;
        opacity: 0.85;
      }
      .head-pill {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        border-radius: 999px;
        padding: 7px 14px;
        font-size: 13px;
        font-weight: 800;
        background: var(--v2-sauge);
        color: var(--v2-foret);
        font-variant-numeric: tabular-nums;
      }
      .head-pill.strong {
        padding: 9px 18px;
        font-size: 15px;
        background: var(--v2-citron);
        box-shadow: 0 2px 0 color-mix(in oklab, var(--v2-foret) 30%, transparent);
      }
      .ps-strip {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 10px;
      }
      .ps-item {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border-radius: 999px;
        padding: 7px 14px;
        font-size: 13.5px;
        font-weight: 600;
        background: var(--v2-creme);
        border: 1.5px solid var(--v2-bord-carte);
        color: var(--v2-foret);
      }
      .ps-item b {
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--v2-ardoise);
      }
      .ps-quote {
        margin: 12px 0 0;
        border-radius: 12px;
        padding: 10px 14px;
        font-size: 14.5px;
        font-weight: 600;
        line-height: 1.5;
        background: var(--v2-creme);
        color: var(--v2-foret);
      }
      .pd-pill.big {
        padding: 6px 14px;
        font-size: 13.5px;
      }
      .pd-chip.info {
        background: var(--v2-info-bg);
        color: var(--v2-info-fg);
      }
      .pd {
        display: grid;
        gap: 14px;
        padding: 18px 20px 20px;
      }
      .pd-place {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 0;
        color: var(--v2-foret);
      }
      .pd-place-name {
        font-size: 17px;
        font-weight: 800;
        letter-spacing: -0.01em;
      }
      .pd-place-village {
        border-radius: 999px;
        padding: 3px 10px;
        font-size: 12px;
        font-weight: 700;
        background: var(--v2-sauge);
        color: var(--v2-foret);
      }
      .pd-areas {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
        gap: 12px;
      }
      .pd-area {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 6px;
        border-radius: 16px;
        padding: 14px 16px;
        background: var(--v2-creme);
        border: 1.5px solid var(--v2-bord-carte);
      }
      .pd-area-label {
        margin: 0;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--v2-ardoise);
      }
      .pd-area-value {
        margin: 0;
        font-size: 24px;
        font-weight: 800;
        line-height: 1.1;
        letter-spacing: -0.02em;
        color: var(--v2-foret);
        font-variant-numeric: tabular-nums;
      }
      .pd-area-value.zero {
        font-size: 16px;
        font-weight: 700;
        opacity: 0.55;
      }
      .pd-area-gap {
        border-radius: 999px;
        padding: 3px 10px;
        font-size: 12px;
        font-weight: 800;
        background: var(--v2-sauge);
        color: var(--v2-foret);
        font-variant-numeric: tabular-nums;
      }
      .pd-cols {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 10px;
      }
      .pd-card {
        border-radius: 16px;
        padding: 14px 16px;
        border: 1.5px solid var(--v2-bord-carte);
        background: var(--v2-blanc);
      }
      .pd-card-title {
        display: flex;
        align-items: center;
        gap: 6px;
        margin: 0 0 8px;
        font-family: var(--v2-font-mono);
        font-size: 11.5px;
        font-weight: 800;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--v2-ardoise);
      }
      .pd-status {
        margin: 0 0 10px;
        font-size: 16px;
        font-weight: 800;
        color: var(--v2-succes-fg);
      }
      .pd-status.warn {
        color: var(--v2-attente-fg);
      }
      .pd-status-sub {
        font-weight: 600;
        color: var(--v2-ardoise);
      }
      .pd-list {
        display: grid;
        gap: 8px;
        margin: 0;
      }
      .pd-list > div {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        padding-top: 8px;
        border-top: 1px solid var(--v2-separateur);
      }
      .pd-list dt {
        font-size: 13px;
        font-weight: 600;
        color: var(--v2-ardoise);
      }
      .pd-list dd {
        margin: 0;
        font-size: 14px;
        font-weight: 700;
        text-align: right;
        font-variant-numeric: tabular-nums;
      }
      .pd-pill {
        display: inline-block;
        border-radius: 999px;
        padding: 3px 12px;
        font-size: 13px;
        font-weight: 800;
        background: var(--v2-creme);
      }
      .pd-pill.ok {
        background: var(--v2-succes-bg);
        color: var(--v2-succes-fg);
      }
      .pd-pill.no {
        background: var(--v2-attente-bg);
        color: var(--v2-attente-fg);
      }
      .pd-water {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        color: var(--v2-info-fg);
      }
      .pd-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .pd-chip {
        border-radius: 999px;
        padding: 5px 12px;
        font-size: 13px;
        font-weight: 700;
        background: var(--v2-sauge);
        color: var(--v2-foret);
      }
      .pd-note {
        border-radius: 16px;
        padding: 12px 16px;
        background: var(--v2-attente-bg);
        color: var(--v2-attente-fg);
      }
      .pd-note.alert {
        background: var(--v2-erreur-bg);
        color: var(--v2-erreur-fg);
      }
      .pd-note-title {
        display: flex;
        align-items: center;
        gap: 6px;
        margin: 0;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .pd-note-text {
        margin: 4px 0 0;
        font-size: 14.5px;
        font-weight: 600;
        line-height: 1.45;
      }
      .pd-crops {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 10px;
      }
      .pd-crop {
        display: flex;
        align-items: center;
        gap: 12px;
        border-radius: 16px;
        padding: 10px 14px;
        border: 1.5px solid var(--v2-bord-carte);
        background: var(--v2-blanc);
      }
      .pc-tiles {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 10px;
        margin-top: 14px;
      }
      .pc-tile {
        border-radius: 16px;
        padding: 14px 16px;
        background: var(--v2-creme);
      }
      .pc-tile-text {
        margin: 6px 0 0;
        font-size: 20px;
        font-weight: 800;
        line-height: 1.1;
      }
      .pc-seasons {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 10px;
      }
      .pc-season {
        border-radius: 18px;
        padding: 16px 18px;
        background: var(--v2-foret);
        color: var(--v2-blanc);
      }
      .pc-season .pd-card-title,
      .pc-season .pd-list dt {
        color: color-mix(in oklab, var(--v2-blanc) 75%, transparent);
      }
      .pc-season .pd-list > div {
        border-top-color: color-mix(in oklab, var(--v2-blanc) 16%, transparent);
      }
      .pc-season.off {
        background: var(--v2-creme);
        color: var(--v2-ardoise);
      }
      .pc-season.off .pd-card-title {
        color: var(--v2-ardoise);
      }
      .pc-value {
        margin: 0 0 12px;
        font-size: 28px;
        font-weight: 800;
        line-height: 1;
        letter-spacing: -0.03em;
        color: var(--v2-citron);
        font-variant-numeric: tabular-nums;
      }
      .pc-dest {
        border-radius: 999px;
        padding: 5px 12px;
        font-size: 13px;
        font-weight: 700;
        background: color-mix(in oklab, var(--v2-blanc) 16%, transparent);
        color: var(--v2-blanc);
      }
      .pc-diffs {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 8px;
      }
      .pc-diff {
        border-radius: 999px;
        padding: 6px 14px;
        font-size: 13.5px;
        font-weight: 800;
        background: var(--v2-blanc);
        color: var(--v2-erreur-fg);
      }
      .pd-crop-ico {
        display: grid;
        flex: none;
        place-items: center;
        width: 40px;
        height: 40px;
        border-radius: 12px;
        font-size: 13px;
        font-weight: 800;
        background: var(--v2-citron);
        color: var(--v2-foret);
      }
      .pd-crop-name {
        margin: 0;
        font-size: 15px;
        font-weight: 800;
      }
      .pd-crop-variety {
        font-weight: 600;
        color: var(--v2-ardoise);
      }
      .pd-crop-share {
        margin: 2px 0 0;
        font-size: 13px;
        font-weight: 600;
        color: var(--v2-ardoise);
        font-variant-numeric: tabular-nums;
      }
      .difficultes {
        margin-top: 20px;
      }
      .difficultes-label {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-right: 8px;
        font-family: var(--v2-font-mono);
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--v2-citron);
      }
      .difficulte {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        border-radius: 999px;
        padding: 6px 14px 6px 10px;
        font-size: 13px;
        font-weight: 800;
        color: var(--v2-erreur-fg);
        background: var(--v2-blanc);
        box-shadow: 0 2px 0 color-mix(in oklab, var(--v2-erreur-fg) 35%, transparent);
      }
      .difficulte::before {
        content: "";
        width: 9px;
        height: 9px;
        border-radius: 99px;
        background: var(--v2-erreur-fg);
      }
      .difficulte.vide {
        font-weight: 700;
        color: var(--v2-blanc);
        background: color-mix(in oklab, var(--v2-blanc) 16%, transparent);
        box-shadow: none;
      }
      .difficulte.vide::before {
        display: none;
      }
      .viewer {
        display: grid;
        place-items: center;
        border-radius: 16px;
        background: var(--v2-creme);
        overflow: hidden;
      }
      .viewer img {
        max-height: 65vh;
        width: auto;
        max-width: 100%;
        object-fit: contain;
      }
    `,
  ],
  template: `
    <app-shell perm="producer.read" [area]="t()('producteurs.detail.area')">
      @if (producer(); as current) {
        @if (!inScopeProducer()) {
          <div
            class="card mx-auto mt-16 flex max-w-lg flex-col items-center gap-3 p-10 text-center"
          >
            <span
              class="grid size-14 place-items-center rounded-[16px]"
              style="background: var(--v2-attente-bg); color: var(--v2-attente-fg)"
              ><ui-icon name="warning" [size]="26"
            /></span>
            <h1 class="text-[22px] font-extrabold">{{ t()("producteurs.detail.outOfScope") }}</h1>
            <p class="sub">{{ t()("producteurs.detail.outOfScopeDesc") }}</p>
            <a class="btn btn-ghost mt-2" routerLink="/dashboard/producteurs">{{
              t()("producteurs.index.title")
            }}</a>
          </div>
        } @else {
          <ui-detail-hero
            [crumb]="{ label: t()('producteurs.index.title'), link: '/dashboard/producteurs' }"
            [title]="current.firstName + ' ' + current.lastName"
            [eyebrow]="current.code"
            [mono]="initials(current.firstName + ' ' + current.lastName)"
            [image]="current.photoUrl"
            [zoomable]="!!current.photoUrl"
            [zoomLabel]="t()('producteurs.photos.enlarge')"
            (imageClick)="heroPhotoOpen.set(true)"
            [badges]="heroBadges()"
            [meta]="heroMeta()"
            [backLabel]="t()('producteurs.fiche.back')"
          >
            @if (store.can("producer.edit")) {
              <button hero-actions type="button" class="btn btn-citron" (click)="openCorrection()">
                <ui-icon name="edit" [size]="18" />{{ t()("producteurs.detail.requestEdit") }}
              </button>
            }
          
            @if (current.survey) {
              <div hero-extra class="difficultes relative flex flex-wrap items-center gap-2">
                <span class="difficultes-label"><ui-icon name="warning" [size]="16" />{{ t()("producteurs.survey.difficulties") }}</span>
                @for (difficulty of current.survey.difficulties; track difficulty) {
                  <span class="difficulte">{{ difficulty }}</span>
                } @empty {
                  <span class="difficulte vide">{{ t()("producteurs.survey.noDifficulty") }}</span>
                }
              </div>
            }
          </ui-detail-hero>

          @if (current.mergedInto) {
            <p class="notice mt-4" style="background: var(--v2-info-bg); color: var(--v2-info-fg)">
              <ui-icon name="info" [size]="18" />{{ t()("producteurs.detail.merged") }}
              <a class="underline" [routerLink]="['/dashboard/producteurs', current.mergedInto]">{{
                t()("producteurs.detail.seeMain")
              }}</a>
            </p>
          }

          <ui-stat-cards class="rise mt-6" [stats]="stats()" />

          <app-cni-alert-panel [producerId]="current.id" />

          <div class="mt-4">
            <app-source-values-panel [producerId]="current.id" />
          </div>

          @if (checkItems().length) {
            <div class="alerte rise mt-4" role="note">
              <span class="alerte-ico" aria-hidden="true"><ui-icon name="info" [size]="20" /></span>
              <div class="min-w-0">
                <p class="alerte-titre">{{ t()("producteurs.check.title") }}</p>
                <p class="alerte-texte">{{ t()("producteurs.check.intro", { count: checkItems().length }) }}</p>
                <ul class="alerte-liste">
                  @for (item of checkItems(); track item.id) {
                    <li>
                      <span class="alerte-lieu">{{ item.where }}</span>
                      <span>{{ item.text }}</span>
                    </li>
                  }
                </ul>
                <p class="alerte-aide">{{ t()("producteurs.check.help") }}</p>
                @if (canContact()) {
                  <div class="mt-3 flex flex-wrap justify-end">
                    <button type="button" class="btn btn-ghost" (click)="openContact()">
                      <ui-icon name="mail" [size]="18" />{{ t()("demandes.action") }}
                    </button>
                  </div>
                }
              </div>
            </div>
          }

          <div class="grid-main mt-6">
            <!-- Identité -->
            <section class="sec-card">
              <div class="sec-head">
                <h2>
                  <span class="sec-ico"><ui-icon name="person" [size]="18" /></span
                  >{{ t()("producteurs.detail.identity") }}
                </h2>
              </div>
              <dl class="facts">
                <div class="fact">
                  <span class="fact-ico"><ui-icon name="person" [size]="18" /></span>
                  <div>
                    <dt>{{ t()("producteurs.detail.sex") }}</dt>
                    <dd>
                      {{ t()(current.sex === "F" ? "producteurs.sex.F" : "producteurs.sex.H") }}
                    </dd>
                  </div>
                </div>
                <div class="fact">
                  <span class="fact-ico"><ui-icon name="calendar_today" [size]="18" /></span>
                  <div>
                    <dt>{{ t()("producteurs.detail.age") }}</dt>
                    <dd [class.zero]="current.age === null">
                      {{ current.age === null ? "—" : fmtAge(current.age) }}
                    </dd>
                  </div>
                </div>
                <div class="fact">
                  <span class="fact-ico"><ui-icon name="badge" [size]="18" /></span>
                  <div>
                    <dt>{{ t()("producteurs.detail.cni") }}</dt>
                    <dd class="tabular-nums">
                      {{
                        showCni() ? current.cni || t()("producteurs.notSet") : maskCni(current.cni)
                      }}
                      @if (canCni() && current.cni && !showCni()) {
                        <button type="button" class="reveal" (click)="openCniDialog()">
                          <ui-icon name="visibility" [size]="14" />{{
                            t()("producteurs.detail.reveal")
                          }}
                        </button>
                      }
                    </dd>
                  </div>
                </div>
                <div class="fact">
                  <span class="fact-ico"><ui-icon name="call" [size]="18" /></span>
                  <div>
                    <dt>{{ t()("producteurs.detail.phone") }}</dt>
                    <dd class="tabular-nums" [class.zero]="!current.phone">
                      {{
                        showPhone() || store.can("contact.read")
                          ? current.phone || "—"
                          : maskPhone(current.phone)
                      }}
                      @if (
                        current.phone &&
                        !showPhone() &&
                        !store.can("contact.read") &&
                        store.can("producer.edit")
                      ) {
                        <button type="button" class="reveal" (click)="revealPhone(current)">
                          <ui-icon name="visibility" [size]="14" />{{
                            t()("producteurs.detail.reveal")
                          }}
                        </button>
                      }
                    </dd>
                  </div>
                </div>
                <div class="fact">
                  <span class="fact-ico"><ui-icon name="location_on" [size]="18" /></span>
                  <div>
                    <dt>{{ t()("producteurs.col.village") }}</dt>
                    <dd>{{ current.village }}</dd>
                  </div>
                </div>
                <div class="fact">
                  <span class="fact-ico"><ui-icon name="hub" [size]="18" /></span>
                  <div>
                    <dt>{{ t()("producteurs.detail.organisation") }}</dt>
                    <dd>
                      @if (org(current.orgId); as organisation) {
                        <a
                          class="underline decoration-[var(--v2-gris-trait)] underline-offset-4 hover:text-[var(--v2-vert-pousse)]"
                          [routerLink]="['/dashboard/organisations', organisation.id]"
                          >{{ organisation.name }}</a
                        >
                      } @else {
                        <span class="zero">—</span>
                      }
                    </dd>
                  </div>
                </div>
                <div class="fact">
                  <span class="fact-ico"><ui-icon name="apartment" [size]="18" /></span>
                  <div>
                    <dt>{{ t()("producteurs.v2.coop") }}</dt>
                    <dd>{{ scoopName(current.scoopId) }}</dd>
                  </div>
                </div>
                <div class="fact">
                  <span class="fact-ico"><ui-icon name="accessibility" [size]="18" /></span>
                  <div>
                    <dt>{{ t()("producteurs.detail.handicap") }}</dt>
                    <dd>
                      {{
                        t()(current.handicap ? "producteurs.detail.yes" : "producteurs.detail.no")
                      }}
                    </dd>
                  </div>
                </div>
                <div class="fact">
                  <span class="fact-ico"><ui-icon name="badge" [size]="18" /></span>
                  <div>
                    <dt>{{ t()("producteurs.detail.enumerator") }}</dt>
                    <dd>{{ current.enumerator }}</dd>
                  </div>
                </div>
                <div class="fact">
                  <span class="fact-ico"><ui-icon name="event_note" [size]="18" /></span>
                  <div>
                    <dt>{{ t()("producteurs.detail.createdAt") }}</dt>
                    <dd>{{ fmtDate(current.createdAt) }}</dd>
                  </div>
                </div>
              </dl>
            </section>

            <!-- Carte des parcelles -->
            @if (plots().length && store.can("map.read")) {
              <section class="sec-card flex flex-col">
                <div class="sec-head">
                  <h2>
                    <span class="sec-ico"><ui-icon name="map" [size]="18" /></span
                    >{{ t()("producteurs.detail.plotsMap") }}
                  </h2>
                </div>
                <div class="map flex-1 border-t" style="border-color: var(--v2-separateur)">
                  <app-plot-map
                    [plots]="plots()"
                    [selectedId]="selectedPlotId() ?? plots()[0]!.id"
                    basemap="sat"
                    [onSelect]="selectPlot"
                  />
                </div>
                <p class="sub px-5 py-3">{{ t()("producteurs.detail.plotsMapHint") }}</p>
              </section>
            }
          </div>

          <!-- Profil socio-économique (enquête Kobo) -->
          @if (current.survey; as survey) {
            <section class="sec-card mt-4">
              <div class="sec-head">
                <h2>
                  <span class="sec-ico"><ui-icon name="query_stats" [size]="18" /></span
                  >{{ t()("producteurs.survey.title") }}
                </h2>
                <span class="head-pill">
                  <ui-icon name="query_stats" [size]="16" />{{ t()("producteurs.survey.source", { batch: survey.batch }) }}
                </span>
              </div>
              <div class="pd">
                <div class="ps-strip">
                  <span class="ps-item"><ui-icon name="calendar_today" [size]="16" /><b>{{ t()("producteurs.survey.surveyedAt") }}</b>{{ survey.surveyedAt ? fmtDate(survey.surveyedAt) : "—" }}</span>
                  <span class="ps-item"><ui-icon name="event_note" [size]="16" /><b>{{ t()("producteurs.survey.phase") }}</b>{{ survey.phase || "—" }}</span>
                  <span class="ps-item"><ui-icon name="schedule" [size]="16" /><b>{{ t()("producteurs.survey.duration") }}</b>{{ amount(survey.durationMin, "producteurs.unit.minutes", nf) }}</span>
                  <span class="ps-item"><ui-icon name="location_on" [size]="16" /><b>{{ t()("producteurs.survey.zone") }}</b>{{ t()("producteurs.survey.zoneValue", { zone: survey.zone }) }}</span>
                  <span class="ps-item"><ui-icon name="support_agent" [size]="16" /><b>{{ t()("producteurs.survey.supervisor") }}</b>{{ survey.supervisor || "—" }}</span>
                </div>

                <div class="pd-cols">
                  <div class="pd-card">
                    <p class="pd-card-title"><ui-icon name="person" [size]="16" />{{ t()("producteurs.survey.profile") }}</p>
                    <dl class="pd-list">
                      <div><dt>{{ t()("producteurs.survey.opStatus") }}</dt><dd>{{ survey.opStatus || "—" }}</dd></div>
                      <div><dt>{{ t()("producteurs.survey.ageGroup") }}</dt><dd>{{ survey.ageGroup || "—" }}</dd></div>
                      <div><dt>{{ t()("producteurs.survey.education") }}</dt><dd>{{ survey.education || "—" }}</dd></div>
                      <div><dt>{{ t()("producteurs.survey.seniority") }}</dt><dd>{{ survey.seniorityYears === null ? "—" : t()("producteurs.survey.years", { count: survey.seniorityYears }) }}</dd></div>
                      <div><dt>{{ t()("producteurs.survey.smartphone") }}</dt><dd><span class="pd-pill" [class.ok]="survey.smartphone === true" [class.no]="survey.smartphone === false">{{ yesNo(survey.smartphone) }}</span></dd></div>
                      <div><dt>{{ t()("producteurs.survey.mobileApps") }}</dt><dd>{{ survey.mobileApps || "—" }}</dd></div>
                    </dl>
                  </div>

                  <div class="pd-card">
                    <p class="pd-card-title"><ui-icon name="group" [size]="16" />{{ t()("producteurs.survey.situation") }}</p>
                    <dl class="pd-list">
                      <div><dt>{{ t()("producteurs.survey.womanHead") }}</dt><dd><span class="pd-pill">{{ yesNo(survey.womanHead) }}</span></dd></div>
                      <div><dt>{{ t()("producteurs.survey.youth") }}</dt><dd><span class="pd-pill">{{ yesNo(survey.youth) }}</span></dd></div>
                      <div><dt>{{ t()("producteurs.survey.youthDeclared") }}</dt><dd><span class="pd-pill">{{ yesNo(survey.youthDeclared) }}</span></dd></div>
                      <div><dt>{{ t()("producteurs.fiche.handicap") }}</dt><dd><span class="pd-pill">{{ yesNo(current.handicap) }}</span></dd></div>
                      <div><dt>{{ t()("producteurs.survey.rotatingFund") }}</dt><dd><span class="pd-pill">{{ yesNo(survey.rotatingFund) }}</span></dd></div>
                      <div><dt>{{ t()("producteurs.survey.consent") }}</dt><dd><span class="pd-pill" [class.ok]="survey.consent === 'Oui'">{{ survey.consent || "—" }}</span></dd></div>
                    </dl>
                  </div>

                  <div class="pd-card">
                    <p class="pd-card-title"><ui-icon name="agriculture" [size]="16" />{{ t()("producteurs.survey.farm") }}</p>
                    <dl class="pd-list">
                      <div><dt>{{ t()("producteurs.survey.plotCount") }}</dt><dd>{{ survey.plotCount ?? "—" }}</dd></div>
                      <div><dt>{{ t()("producteurs.survey.totalArea") }}</dt><dd>{{ amount(survey.totalAreaHa, "producteurs.unit.ha") }}</dd></div>
                      <div><dt>{{ t()("producteurs.survey.cultivatedArea") }}</dt><dd>{{ amount(survey.cultivatedAreaHa, "producteurs.unit.ha") }}</dd></div>
                    </dl>
                    <p class="pd-card-title mt-3">{{ t()("producteurs.survey.cropsPracticed") }}</p>
                    <div class="pd-chips">
                      @for (label of survey.cropsPracticed; track label) {
                        <span class="pd-chip">{{ label }}</span>
                      } @empty {
                        <span class="sub">—</span>
                      }
                    </div>
                  </div>
                </div>

                <div class="pd-note">
                  <p class="pd-note-title"><ui-icon name="warning" [size]="16" />{{ t()("producteurs.survey.difficulties") }}</p>
                  <div class="pc-diffs">
                    @for (label of survey.difficulties; track label) {
                      <span class="pc-diff">{{ label }}</span>
                    } @empty {
                      <span class="pd-note-text">{{ t()("producteurs.survey.noDifficulty") }}</span>
                    }
                  </div>
                </div>

                <div class="pd-card">
                  <p class="pd-card-title"><ui-icon name="info" [size]="16" />{{ t()("producteurs.survey.needs") }}</p>
                  <div class="pd-chips">
                    @for (label of survey.needs; track label) {
                      <span class="pd-chip info">{{ label }}</span>
                    } @empty {
                      <span class="sub">{{ t()("producteurs.survey.none") }}</span>
                    }
                  </div>
                  @if (survey.needsText) {
                    <p class="ps-quote">{{ survey.needsText }}</p>
                  }
                </div>

                <div class="pd-card">
                  <p class="pd-card-title"><ui-icon name="task_alt" [size]="16" />{{ t()("producteurs.survey.quality") }}</p>
                  <div class="pd-chips">
                    <span class="pd-pill big" [class.ok]="survey.qualityStatus === 'Validée'" [class.no]="survey.qualityStatus !== 'Validée'">{{ survey.qualityStatus }}</span>
                    <span class="pd-pill big" [class.ok]="survey.phoneValid === true" [class.no]="survey.phoneValid === false">{{ t()("producteurs.survey.phoneValid") }} : {{ yesNo(survey.phoneValid) }}</span>
                    <span class="pd-pill big" [class.ok]="survey.cniFormatValid === true" [class.no]="survey.cniFormatValid === false">{{ t()("producteurs.survey.cniFormatValid") }} : {{ yesNo(survey.cniFormatValid) }}</span>
                    @if (survey.interviewGps; as gps) {
                      <span class="pd-pill big"><ui-icon name="pin_drop" [size]="14" />{{ coordinates(gps.lat, gps.lng) }}@if (gps.precisionM !== null) { · ± {{ nf.format(gps.precisionM) }} m }</span>
                    }
                  </div>
                  @if (survey.observations) {
                    <p class="ps-quote">{{ survey.observations }}</p>
                  }
                </div>
              </div>
            </section>
          }

          <!-- Parcelles -->
          <section class="sec-card mt-4">
            <div class="sec-head">
              <h2>
                <span class="sec-ico"><ui-icon name="landscape" [size]="18" /></span
                >{{ t()("producteurs.detail.section.plots")
                }}<span class="n">{{ nf.format(plots().length) }}</span>
              </h2>
            </div>
            @if (plots().length) {
              <div class="overflow-x-auto">
                <table class="tbl" [style.min-width.px]="hasKoboPlots() ? 1080 : 680">
                  <thead>
                    <tr>
                      <th><span class="sr-only">{{ t()("producteurs.detail.section.plots") }}</span></th>
                      <th>{{ t()("producteurs.v2.col.plot") }}</th>
                      <th>{{ t()("producteurs.v2.col.crop") }}</th>
                      <th class="text-right">{{ t()("producteurs.v2.col.declared") }}</th>
                      <th class="text-right">{{ t()("producteurs.v2.col.measured") }}</th>
                      @if (hasKoboPlots()) {
                        <th>{{ t()("producteurs.plots.col.landStatus") }}</th>
                        <th>{{ t()("producteurs.plots.col.water") }}</th>
                        <th>{{ t()("producteurs.plots.col.exploitation") }}</th>
                      }
                      <th class="text-right">{{ t()("producteurs.plots.col.precision") }}</th>
                      <th>{{ t()("producteurs.v2.col.campaign") }}</th>
                      <th>{{ t()("producteurs.v2.col.status") }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (plot of plots(); track plot.id) {
                      <tr
                        class="row-link"
                        [class.font-bold]="selectedPlotId() === plot.id"
                        [attr.aria-label]="t()('producteurs.plots.toggle', { code: plot.code })"
                        [attr.aria-expanded]="expandedPlotId() === plot.id"
                        tabindex="0"
                        (click)="togglePlot(plot.id)"
                        (keydown.enter)="togglePlot(plot.id)"
                      >
                        <td class="w-10">
                          <span class="chevron" [class.open]="expandedPlotId() === plot.id"
                            ><ui-icon name="chevron_right" [size]="18"
                          /></span>
                        </td>
                        <td>
                          <span class="mono" style="color: var(--v2-foret)">{{ plot.code }}</span>
                        </td>
                        <td class="font-semibold">{{ plot.crop }}</td>
                        <td class="text-right tabular-nums">
                          @if (plot.declaredKnown === false) {
                            <span class="sub">{{ t()("producteurs.plots.declaredUnknown") }}</span>
                          } @else {
                            {{ nf2.format(plot.declared) }} ha
                          }
                        </td>
                        <td class="text-right font-extrabold tabular-nums">
                          {{ nf2.format(plot.measured) }} ha
                        </td>
                        @if (hasKoboPlots()) {
                          <td [class.zero]="!plot.landStatus">{{ plot.landStatus || "—" }}</td>
                          <td [class.zero]="!plot.waterSource">{{ plot.waterSource || "—" }}</td>
                          <td [class.zero]="!plot.exploitationState">
                            {{ plot.exploitationState || "—" }}
                          </td>
                        }
                        <td class="text-right tabular-nums" [class.zero]="!plot.gpsPrecision">
                          {{
                            plot.gpsPrecision
                              ? amount(plot.gpsPrecision, "producteurs.unit.precision", nf1)
                              : "—"
                          }}
                        </td>
                        <td class="font-medium">{{ plot.campaign || "—" }}</td>
                        <td>
                          <span
                            class="badge"
                            [style.background]="plotTone(plot.status).bg"
                            [style.color]="plotTone(plot.status).fg"
                            >{{ plot.status }}</span
                          >
                        </td>
                      </tr>
                      @if (expandedPlotId() === plot.id) {
                        <tr>
                          <td class="detail-cell" [attr.colspan]="plotColumnCount()">
                            <div class="pd">
                              @if (plot.landmark || plot.village) {
                                <p class="pd-place">
                                  <ui-icon name="location_on" [size]="18" />
                                  @if (plot.landmark && plot.landmark.trim().toLowerCase() !== (plot.village ?? "").trim().toLowerCase()) {
                                    <span class="pd-place-name">{{ plot.landmark }}</span>
                                    @if (plot.village) {
                                      <span class="pd-place-village">{{ plot.village }}</span>
                                    }
                                  } @else {
                                    <span class="pd-place-name">{{ plot.village || plot.landmark }}</span>
                                  }
                                </p>
                              }

                              @if (plot.areaUnknown) {
                                <p class="pd-status warn" role="note">
                                  <ui-icon name="help" [size]="16" />{{ t()("plot.areaUnknown") }}
                                </p>
                              } @else {
                              <div class="pd-areas">
                                <div class="pd-area">
                                  <p class="pd-area-label">{{ t()("producteurs.plots.declared") }}</p>
                                  <p class="pd-area-value" [class.zero]="plot.declaredKnown === false">
                                    {{
                                      plot.declaredKnown === false
                                        ? t()("producteurs.plots.declaredUnknown")
                                        : amount(plot.declared, "producteurs.unit.ha")
                                    }}
                                  </p>
                                </div>
                                <div class="pd-area">
                                  <p class="pd-area-label">{{ t()("producteurs.plots.measured") }}</p>
                                  <p class="pd-area-value">{{ amount(plot.measured, "producteurs.unit.ha") }}</p>
                                  @if (plot.areaGapPct !== null && plot.areaGapPct !== undefined) {
                                    <span class="pd-area-gap">
                                      {{ t()("producteurs.plots.gap") }} {{ amount(plot.areaGapPct, "producteurs.unit.pct", nf1) }}
                                    </span>
                                  }
                                </div>
                                <div class="pd-area">
                                  <p class="pd-area-label">{{ t()("producteurs.plots.cultivated") }}</p>
                                  <p class="pd-area-value" [class.zero]="plot.cultivatedAreaHa == null">
                                    {{ amount(plot.cultivatedAreaHa, "producteurs.unit.ha") }}
                                  </p>
                                </div>
                              </div>
                              }

                              <div class="pd-cols">
                                <div class="pd-card">
                                  <p class="pd-card-title"><ui-icon name="map" [size]="16" />{{ t()("producteurs.plots.contour") }}</p>
                                  <p class="pd-status" [class.warn]="plot.contourRepaired || plot.repaired || plot.contourValid === false">
                                    {{ contourLabel(plot) }}
                                    @if (plot.contourPoints) {
                                      <span class="pd-status-sub">· {{ t()("producteurs.plots.contourPoints", { count: nf.format(plot.contourPoints) }) }}</span>
                                    }
                                  </p>
                                  <dl class="pd-list">
                                    <div>
                                      <dt>{{ t()("producteurs.plots.perimeter") }}</dt>
                                      <dd>{{ amount(plot.perimeterM, "producteurs.unit.meters", nf) }}</dd>
                                    </div>
                                    @if (plot.centroid; as centre) {
                                      <div>
                                        <dt>{{ t()("producteurs.plots.centroid") }}</dt>
                                        <dd>{{ coordinates(centre.lat, centre.lng) }}</dd>
                                      </div>
                                    }
                                    <div>
                                      <dt>{{ t()("producteurs.plots.neighbour") }}</dt>
                                      <dd>{{ amount(plot.distanceNeighbourKm, "producteurs.unit.km") }}</dd>
                                    </div>
                                  </dl>
                                </div>

                                <div class="pd-card">
                                  <p class="pd-card-title"><ui-icon name="description" [size]="16" />{{ t()("producteurs.plots.landAndWater") }}</p>
                                  <dl class="pd-list">
                                    <div>
                                      <dt>{{ t()("producteurs.plots.landDocument") }}</dt>
                                      <dd>
                                        <span class="pd-pill" [class.ok]="plot.landDocument === true" [class.no]="plot.landDocument === false">{{ yesNo(plot.landDocument) }}</span>
                                      </dd>
                                    </div>
                                    <div>
                                      <dt>{{ t()("producteurs.plots.col.water") }}</dt>
                                      <dd>
                                        <span class="pd-water"><ui-icon name="water_drop" [size]="15" />{{ plot.waterSource || "—" }}</span>
                                      </dd>
                                    </div>
                                  </dl>
                                  <p class="pd-card-title mt-3"><ui-icon name="grass" [size]="16" />{{ t()("producteurs.plots.infrastructures") }}</p>
                                  @if (plot.infrastructures?.length) {
                                    <div class="pd-chips">
                                      @for (label of plot.infrastructures; track label) {
                                        <span class="pd-chip">{{ label }}</span>
                                      }
                                    </div>
                                  } @else {
                                    <p class="sub">—</p>
                                  }
                                </div>
                              </div>

                              @if (plot.alerts?.length) {
                                <div class="pd-note alert">
                                  <p class="pd-note-title"><ui-icon name="warning" [size]="16" />{{ t()("producteurs.plots.alerts") }}</p>
                                  @for (alert of plot.alerts; track alert) {
                                    <p class="pd-note-text">{{ alert }}</p>
                                  }
                                </div>
                              }
                              @if (plot.observations) {
                                <div class="pd-note">
                                  <p class="pd-note-title"><ui-icon name="info" [size]="16" />{{ t()("producteurs.plots.observations") }}</p>
                                  <p class="pd-note-text">{{ plot.observations }}</p>
                                </div>
                              }

                              @if (plot.cropDetails) {
                                <div>
                                  <p class="pd-card-title"><ui-icon name="agriculture" [size]="16" />{{ t()("producteurs.plots.crops") }}</p>
                                  <div class="pd-crops">
                                    @for (detail of plot.cropDetails; track detail.id) {
                                      <div class="pd-crop">
                                        <span class="pd-crop-ico">{{ detail.crop.slice(0, 2).toUpperCase() }}</span>
                                        <div class="min-w-0">
                                          <p class="pd-crop-name">{{ detail.crop }}@if (detail.variety) {<span class="pd-crop-variety"> · {{ detail.variety }}</span>}</p>
                                          <p class="pd-crop-share">
                                            {{ amount(detail.sharePct, "producteurs.unit.pct", nf) }} ·
                                            {{ amount(detail.areaHa, "producteurs.unit.ha") }}
                                          </p>
                                        </div>
                                      </div>
                                    } @empty {
                                      <p class="sub">{{ t()("producteurs.plots.noCrop") }}</p>
                                    }
                                  </div>
                                </div>
                              }
                            </div>
                          </td>
                        </tr>
                      }
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <p class="sub border-t px-5 py-5" style="border-color: var(--v2-separateur)">
                {{ t()("producteurs.detail.plots.empty") }}
              </p>
            }
          </section>

          <!-- Cultures et production (import Kobo) -->
          @if (cropDetails().length) {
            <section class="sec-card mt-4">
              <div class="sec-head">
                <h2>
                  <span class="sec-ico"><ui-icon name="agriculture" [size]="18" /></span
                  >{{ t()("producteurs.production.title")
                  }}<span class="n">{{ nf.format(cropDetails().length) }}</span>
                </h2>
                @if (productionValue()) {
                  <span class="head-pill strong">
                    <ui-icon name="payments" [size]="18" />{{
                      t()("producteurs.production.totalValue", { value: nf.format(productionValue()) })
                    }}
                  </span>
                }
              </div>
              @for (entry of cropDetails(); track entry.detail.id) {
                <article class="crop-card">
                  <div class="flex flex-wrap items-center gap-3">
                    <span class="avatar">{{ entry.detail.crop.slice(0, 2).toUpperCase() }}</span>
                    <div class="min-w-0 flex-1">
                      <p class="font-extrabold">
                        {{ entry.detail.crop }}
                        @if (entry.detail.cropRaw && entry.detail.cropRaw !== entry.detail.crop) {
                          <span class="sub">({{ entry.detail.cropRaw }})</span>
                        }
                      </p>
                      <p class="sub">
                        <span class="mono" style="color: var(--v2-foret)">{{
                          t()("producteurs.production.plot", { code: entry.plotCode })
                        }}</span>
                      </p>
                    </div>
                  </div>
                  <div class="pc-tiles">
                    <div class="pc-tile">
                      <p class="pd-area-label">{{ t()("producteurs.production.variety") }}</p>
                      <p class="pc-tile-text" [class.zero]="!entry.detail.variety">{{ entry.detail.variety || "—" }}</p>
                    </div>
                    <div class="pc-tile">
                      <p class="pd-area-label">{{ t()("producteurs.production.share") }}</p>
                      <p class="pd-area-value">{{ amount(entry.detail.sharePct, "producteurs.unit.pct", nf) }}</p>
                    </div>
                    <div class="pc-tile">
                      <p class="pd-area-label">{{ t()("producteurs.production.area") }}</p>
                      <p class="pd-area-value">{{ amount(entry.detail.areaHa, "producteurs.unit.ha") }}</p>
                    </div>
                    <div class="pc-tile">
                      <p class="pd-area-label">{{ t()("producteurs.production.potentialYield") }}</p>
                      <p class="pd-area-value">{{ amount(entry.detail.potentialYieldKgHa, "producteurs.unit.kgHa", nf) }}</p>
                    </div>
                    <div class="pc-tile">
                      <p class="pd-area-label">{{ t()("producteurs.production.potentialProduction") }}</p>
                      <p class="pd-area-value">{{ amount(entry.detail.potentialProductionKg, "producteurs.unit.kg", nf) }}</p>
                    </div>
                  </div>

                  <div class="pd-card mt-3">
                    <p class="pd-card-title"><ui-icon name="grass" [size]="16" />{{ t()("producteurs.production.agroecology") }}</p>
                    @if (entry.detail.agroecology.length) {
                      <div class="pd-chips">
                        @for (practice of entry.detail.agroecology; track practice) {
                          <span class="pd-chip">{{ practice }}</span>
                        }
                      </div>
                    } @else {
                      <p class="sub">
                        {{ entry.detail.agroecologyUsed === null ? "—" : t()("producteurs.production.agroecologyNone") }}
                      </p>
                    }
                  </div>

                  <div class="pc-seasons mt-3">
                    @for (seasonKey of seasonKeys; track seasonKey.key) {
                      @let season = entry.detail.seasons[seasonKey.key];
                      <div class="pc-season" [class.off]="!(season && season.produced)">
                        <p class="pd-card-title"><ui-icon name="payments" [size]="16" />{{ t()(seasonKey.label) }}</p>
                        @if (season && season.produced) {
                          <p class="pc-value">{{ amount(season.valueFcfa, "producteurs.unit.fcfa", nf) }}</p>
                          <dl class="pd-list">
                            <div>
                              <dt>{{ t()("producteurs.production.quantity") }}</dt>
                              <dd>{{ amount(season.quantityKg, "producteurs.unit.kg", nf) }}</dd>
                            </div>
                            <div>
                              <dt>{{ t()("producteurs.production.yield") }}</dt>
                              <dd>{{ amount(season.yieldKgHa, "producteurs.unit.kgHa", nf) }}</dd>
                            </div>
                            <div>
                              <dt>{{ t()("producteurs.production.price") }}</dt>
                              <dd>{{ amount(season.pricePerKg, "producteurs.unit.fcfaKg", nf) }}</dd>
                            </div>
                          </dl>
                          <p class="pd-card-title mt-3">{{ t()("producteurs.production.destinations") }}</p>
                          <div class="pd-chips">
                            @for (destination of season.destinations; track destination) {
                              <span class="pc-dest">{{ destination }}</span>
                            } @empty {
                              <span class="sub">—</span>
                            }
                          </div>
                        } @else {
                          <p class="sub">{{ t()("producteurs.production.notProduced") }}</p>
                        }
                      </div>
                    }
                  </div>

                  @if (entry.detail.difficulties.length) {
                    <div class="pd-note mt-3">
                      <p class="pd-note-title"><ui-icon name="warning" [size]="16" />{{ t()("producteurs.production.difficulties") }}</p>
                      <div class="pc-diffs">
                        @for (label of entry.detail.difficulties; track label) {
                          <span class="pc-diff">{{ label }}</span>
                        }
                      </div>
                    </div>
                  }
                  @if (entry.detail.alerts.length) {
                    <div class="pd-note alert mt-3">
                      <p class="pd-note-title"><ui-icon name="warning" [size]="16" />{{ t()("producteurs.plots.alerts") }}</p>
                      @for (alert of entry.detail.alerts; track alert) {
                        <p class="pd-note-text">{{ alert }}</p>
                      }
                    </div>
                  }
                  @if (entry.detail.observations) {
                    <div class="pd-note mt-3">
                      <p class="pd-note-title"><ui-icon name="info" [size]="16" />{{ t()("producteurs.plots.observations") }}</p>
                      <p class="pd-note-text">{{ entry.detail.observations }}</p>
                    </div>
                  }
                </article>
              }
            </section>
          }

          <!-- Photos (import Kobo) -->
          @if (photoState() === "loading" || photoState() === "error" || photos().length) {
            <section class="sec-card mt-4">
              <div class="sec-head">
                <h2>
                  <span class="sec-ico"><ui-icon name="photo_library" [size]="18" /></span
                  >{{ t()("producteurs.photos.title")
                  }}<span class="n">{{ nf.format(photos().length) }}</span>
                </h2>
                @if (photoState() === "error") {
                  <button type="button" class="btn btn-ghost" (click)="loadPhotos(current.id)">
                    <ui-icon name="refresh" [size]="18" />{{ t()("producteurs.photos.retry") }}
                  </button>
                }
              </div>
              @if (photoState() === "loading" && !photos().length) {
                <p class="sub band">{{ t()("producteurs.photos.loading") }}</p>
              } @else if (photoState() === "error" && !photos().length) {
                <p class="notice m-5" style="background: var(--v2-erreur-bg); color: var(--v2-erreur-fg)">
                  <ui-icon name="warning" [size]="18" />{{ t()("producteurs.photos.error") }}
                </p>
              }
              @for (group of photoGroups(); track group.role) {
                <div class="band">
                  <p class="lbl">
                    {{ t()(group.label) }} <span class="sub">· {{ nf.format(group.items.length) }}</span>
                  </p>
                  <div class="gallery">
                    @for (item of group.items; track item.photo.id) {
                      <button
                        type="button"
                        class="thumb"
                        [attr.aria-label]="
                          t()('producteurs.photos.open', { index: item.index + 1, role: t()(group.label) })
                        "
                        (click)="viewerIndex.set(item.index)"
                      >
                        <img
                          [src]="item.photo.url"
                          [alt]="t()('producteurs.photos.alt', { index: item.index + 1, role: t()(group.label) })"
                          loading="lazy"
                          decoding="async"
                        />
                      </button>
                    }
                  </div>
                </div>
              }
            </section>
          }

          <div class="mt-4" [class.two-cols]="!cropDetails().length">
            @if (!cropDetails().length) {
            <!-- Cultures -->
            <section class="sec-card">
              <div class="sec-head">
                <h2>
                  <span class="sec-ico"><ui-icon name="grass" [size]="18" /></span
                  >{{ t()("producteurs.detail.section.crops")
                  }}<span class="n">{{ current.crops.length }}</span>
                </h2>
              </div>
              <ul>
                @for (crop of current.crops; track crop.campaign + crop.crop) {
                  <li
                    class="flex items-center gap-3 border-t px-5 py-3"
                    style="border-color: var(--v2-separateur)"
                  >
                    <span class="avatar" style="height: 32px; width: 32px; font-size: 11px">{{
                      crop.crop.slice(0, 2).toUpperCase()
                    }}</span>
                    <span class="min-w-0 flex-1 font-bold">{{ crop.crop }}</span>
                    <span class="sub tabular-nums"
                      >{{ crop.campaign }} · {{ nf1.format(crop.area) }} ha</span
                    >
                  </li>
                } @empty {
                  <li class="sub border-t px-5 py-5" style="border-color: var(--v2-separateur)">
                    {{ t()("producteurs.detail.crops.empty") }}
                  </li>
                }
              </ul>
            </section>
            }

            <!-- Historique -->
            <section class="sec-card">
              <div class="sec-head">
                <h2>
                  <span class="sec-ico"><ui-icon name="event_note" [size]="18" /></span
                  >{{ t()("producteurs.detail.section.history")
                  }}<span class="n">{{ current.history.length }}</span>
                </h2>
              </div>
              <ol class="timeline">
                @for (historyEntry of current.history; track historyEntry.at + historyEntry.field) {
                  <li>
                    <span class="dot" aria-hidden="true"></span>
                    <span class="min-w-0">
                      <span class="block font-bold">{{ historyEntry.field }}</span>
                      <span class="block text-[14px]"
                        ><span class="line-through" style="color: var(--v2-gris-texte)">{{
                          historyEntry.from || t()("producteurs.notSet")
                        }}</span>
                        → <b>{{ historyEntry.to }}</b></span
                      >
                      <span class="sub block"
                        >{{ fmtDateTime(historyEntry.at) }} · {{ historyEntry.by }}</span
                      >
                    </span>
                  </li>
                } @empty {
                  <li class="sub">{{ t()("producteurs.detail.history.empty") }}</li>
                }
              </ol>
            </section>
          </div>

          <!-- Photo du producteur agrandie (clic sur la photo de l'en-tête) -->
          @if (heroPhotoOpen() && current.photoUrl) {
            <ui-modal
              [open]="true"
              [title]="current.firstName + ' ' + current.lastName"
              [description]="current.code"
              icon="photo_library"
              [width]="860"
              [closeLabel]="t()('common.close')"
              (closed)="heroPhotoOpen.set(false)"
            >
              <div class="viewer mb-5">
                <img [src]="current.photoUrl" [alt]="current.firstName + ' ' + current.lastName" />
              </div>
            </ui-modal>
          }

          <!-- Visionneuse de photos -->
          @if (viewerPhoto(); as viewed) {
            <ui-modal
              [open]="true"
              [title]="t()('producteurs.photos.viewer', { index: viewed.index + 1, total: orderedPhotos().length })"
              [description]="viewed.caption"
              icon="photo_library"
              [width]="860"
              [closeLabel]="t()('common.close')"
              (closed)="viewerIndex.set(null)"
            >
              <div class="viewer mb-5">
                <img [src]="viewed.photo.url" [alt]="viewed.caption" />
              </div>
              <button
                modal-footer
                type="button"
                class="btn btn-ghost"
                [disabled]="viewed.index === 0"
                (click)="stepViewer(-1)"
              >
                <ui-icon name="chevron_left" [size]="18" />{{ t()("producteurs.photos.previous") }}
              </button>
              <button
                modal-footer
                type="button"
                class="btn btn-primary"
                [disabled]="viewed.index >= orderedPhotos().length - 1"
                (click)="stepViewer(1)"
              >
                {{ t()("producteurs.photos.next")
                }}<span class="btn-chip"><ui-icon name="chevron_right" [size]="18" /></span>
              </button>
            </ui-modal>
          }

          <!-- Révéler la CNI -->
          <ui-modal
            [open]="cniOpen()"
            [title]="t()('producteurs.detail.cniDialog.title')"
            [description]="t()('producteurs.detail.cniDialog.description')"
            icon="badge"
            [width]="540"
            [closeLabel]="t()('common.close')"
            (closed)="closeCniDialog()"
          >
            <label class="lbl" for="cni-reason">{{
              t()("producteurs.detail.cniDialog.reason")
            }}</label>
            <textarea
              id="cni-reason"
              class="area mb-5 mt-2"
              [placeholder]="t()('producteurs.detail.cniDialog.reasonPlaceholder')"
              [value]="cniReason()"
              (input)="cniReason.set($any($event.target).value)"
            ></textarea>
            <button modal-footer type="button" class="btn btn-ghost" (click)="closeCniDialog()">
              {{ t()("common.cancel") }}
            </button>
            <button
              modal-footer
              type="button"
              class="btn btn-primary"
              [disabled]="cniReason().trim().length < 3"
              (click)="confirmRevealCni()"
            >
              {{ t()("producteurs.detail.cniDialog.submit")
              }}<span class="btn-chip"><ui-icon name="visibility" [size]="18" /></span>
            </button>
          </ui-modal>

          <!-- Demander une correction -->
          <ui-modal
            [open]="correctionOpen()"
            [title]="correctionDialogTitle()"
            [description]="t()('producteurs.detail.correction.description')"
            icon="edit"
            [width]="640"
            [closeLabel]="t()('common.close')"
            (closed)="correctionOpen.set(false)"
          >
            <div class="grid gap-5 pb-5 sm:grid-cols-2">
              <ui-text-field
                preset="firstName"
                [label]="t()('producteurs.detail.correction.firstName')"
                [value]="corrFirstName()"
                (valueChange)="corrFirstName.set($event)"
              />
              <ui-text-field
                preset="lastName"
                [label]="t()('producteurs.detail.correction.lastName')"
                [value]="corrLastName()"
                (valueChange)="corrLastName.set($event)"
              />
              <ui-text-field
                preset="phone"
                [label]="t()('producteurs.detail.correction.phone')"
                [value]="corrPhone()"
                [error]="corrPhoneErr()"
                (valueChange)="corrPhone.set($event)"
              />
              <ui-text-field
                preset="age"
                [label]="t()('producteurs.detail.correction.age')"
                [value]="corrAge()"
                [error]="corrAgeErr()"
                (valueChange)="corrAge.set($event)"
              />
              <div class="sm:col-span-2">
                <p class="lbl">{{ t()("producteurs.detail.correction.status") }}</p>
                <div
                  class="seg seg-form mt-2"
                  role="radiogroup"
                  [attr.aria-label]="t()('producteurs.detail.correction.status')"
                >
                  <button
                    type="button"
                    role="radio"
                    [class.on]="corrStatus() === 'recensé'"
                    [attr.aria-checked]="corrStatus() === 'recensé'"
                    (click)="corrStatus.set('recensé')"
                  >
                    {{ t()("producteurs.status.recensé") }}
                  </button>
                  <button
                    type="button"
                    role="radio"
                    [class.on]="corrStatus() === 'membre'"
                    [attr.aria-checked]="corrStatus() === 'membre'"
                    (click)="corrStatus.set('membre')"
                  >
                    {{ t()("producteurs.status.membre") }}
                  </button>
                </div>
              </div>
              @if (correctionChanges().length > 0) {
                <div class="chg sm:col-span-2">
                  <p class="lbl">
                    {{
                      t()("producteurs.detail.correction.beforeAfter", {
                        n: correctionChanges().length,
                      })
                    }}
                  </p>
                  @for (
                    change of correctionChanges();
                    track change.field + change.from + change.to
                  ) {
                    <p>
                      <b>{{ change.field }}</b> :
                      <span class="line-through" style="color: var(--v2-gris-texte)">{{
                        showVal(change.field, change.from)
                      }}</span>
                      →
                      <b style="color: var(--v2-vert-pousse)">{{
                        showVal(change.field, change.to)
                      }}</b>
                    </p>
                  }
                </div>
              }
              <div class="sm:col-span-2">
                <label class="lbl" for="corr-motif">{{
                  t()("producteurs.detail.correction.motif")
                }}</label>
                <textarea
                  id="corr-motif"
                  class="area mt-2"
                  [placeholder]="t()('producteurs.detail.correction.motifPlaceholder')"
                  [value]="corrMotif()"
                  (input)="corrMotif.set($any($event.target).value)"
                ></textarea>
              </div>
            </div>
            <button
              modal-footer
              type="button"
              class="btn btn-ghost"
              (click)="correctionOpen.set(false)"
            >
              {{ t()("common.cancel") }}
            </button>
            <button
              modal-footer
              type="button"
              class="btn btn-primary"
              [disabled]="!canSubmitCorrection()"
              (click)="submitCorrectionForm()"
            >
              {{ t()("producteurs.detail.correction.submit")
              }}<span class="btn-chip"><ui-icon name="arrow_forward" [size]="18" /></span>
            </button>
          </ui-modal>
        }
      } @else {
        <div class="card mx-auto mt-16 flex max-w-lg flex-col items-center gap-3 p-10 text-center">
          <span
            class="grid size-14 place-items-center rounded-[16px]"
            style="background: var(--v2-attente-bg); color: var(--v2-attente-fg)"
            ><ui-icon name="warning" [size]="26"
          /></span>
          <h1 class="text-[22px] font-extrabold">{{ t()("producteurs.detail.notFound") }}</h1>
          <p class="sub">{{ t()("producteurs.detail.notFoundDesc") }}</p>
          <a class="btn btn-ghost mt-2" routerLink="/dashboard/producteurs">{{
            t()("producteurs.index.title")
          }}</a>
        </div>
      }
      <!-- Contacter la coopérative (mode API, administrateur CRADESC) -->
      <ui-contact-scoop-modal
        [open]="contactTargets().length > 0"
        kind="fiche"
        [targets]="contactTargets()"
        [link]="contactLink()"
        (closed)="contactTargets.set([])"
      />
    </app-shell>
  `,
})
export default class ProducteurDetailPage {
  private readonly route = inject(ActivatedRoute);
  readonly store = inject(StoreService);
  private readonly flow = inject(ProducerWorkflow);
  readonly locale = inject(LocaleService);
  readonly t = this.locale.t;
  readonly fmtAge = fmtAge;
  readonly fmtDateTime = fmtDateTime;
  readonly fmtDate = fmtDate;
  readonly maskPhone = maskPhone;
  readonly maskCni = maskCni;
  readonly nf = nf;
  readonly nf1 = nf1;
  readonly initials = initialsOf;
  readonly STATUS_KEY = STATUS_KEY;
  private readonly snackbar = inject(SnackbarService);

  readonly selectedPlotId = signal<string | undefined>(undefined);
  readonly selectPlot = (id: string) => this.selectedPlotId.set(id);

  // ------------------------------------------------ Import Kobo : parcelles, production, photos
  readonly nf2 = nf2;
  readonly tone = TONE;
  readonly seasonKeys = SEASON_KEYS;
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Parcelle dépliée dans le tableau (détail foncier, eau, contour, cultures). */
  readonly expandedPlotId = signal<string | null>(null);

  /** Un clic sur une ligne la sélectionne sur la carte et déplie (ou replie) son détail. */
  togglePlot(id: string): void {
    this.selectPlot(id);
    this.expandedPlotId.update((current) => (current === id ? null : id));
  }

  /** Vrai si au moins une parcelle vient de l'import Kobo : les colonnes foncier / eau / exploitation s'affichent. */
  readonly hasKoboPlots = computed(() => this.plots().some((plot) => plot.landStatus !== undefined));

  readonly plotColumnCount = computed(() => (this.hasKoboPlots() ? 11 : 8));

  /** Cultures détaillées de toutes les parcelles du producteur, avec le code de leur parcelle. */
  readonly cropDetails = computed<{ detail: PlotCropDetail; plotCode: string }[]>(() =>
    this.plots().flatMap((plot) =>
      (plot.cropDetails ?? []).map((detail) => ({ detail, plotCode: plot.code })),
    ),
  );

  /** Valeur de production déclarée (CHN + contre-saison), en FCFA. */
  readonly productionValue = computed(() =>
    this.cropDetails().reduce(
      (total, entry) =>
        total +
        [entry.detail.seasons.chn, entry.detail.seasons.cs].reduce(
          (sum, season: PlotSeason | null) => sum + (season?.produced ? (season.valueFcfa ?? 0) : 0),
          0,
        ),
      0,
    ),
  );

  /** Photos lues sur `GET /producers/:id/photos` ; null tant qu'elles ne sont pas chargées. */
  private readonly fetchedPhotos = signal<KoboPhoto[] | null>(null);
  readonly photoState = signal<"idle" | "loading" | "error" | "ready">("idle");
  private photoRequest = 0;

  /** Photos affichées : celles de l'API, à défaut celles portées par les parcelles. */
  readonly photos = computed<KoboPhoto[]>(
    () => this.fetchedPhotos() ?? this.plots().flatMap((plot) => plot.photos ?? []),
  );

  readonly orderedPhotos = computed(() =>
    [...this.photos()].sort(
      (first, second) => PHOTO_ROLES.indexOf(first.role) - PHOTO_ROLES.indexOf(second.role),
    ),
  );

  readonly photoGroups = computed(() => {
    const ordered = this.orderedPhotos();
    return PHOTO_ROLES.map((role) => ({
      role,
      label: PHOTO_ROLE_KEY[role],
      items: ordered
        .map((photo, index) => ({ photo, index }))
        .filter((item) => item.photo.role === role),
    })).filter((group) => group.items.length);
  });

  readonly heroPhotoOpen = signal(false);
  readonly viewerIndex = signal<number | null>(null);

  readonly viewerPhoto = computed(() => {
    const index = this.viewerIndex();
    if (index === null) return null;
    const photo = this.orderedPhotos()[index];
    if (!photo) return null;
    const translate = this.t();
    const parts = [translate(PHOTO_ROLE_KEY[photo.role] ?? PHOTO_ROLE_KEY.non_identifiee)];
    const plotCode = photo.plotId ? this.plots().find((plot) => plot.id === photo.plotId)?.code : undefined;
    if (plotCode) parts.push(translate("producteurs.photos.plot", { code: plotCode }));
    if (photo.takenAt) parts.push(translate("producteurs.photos.takenAt", { date: fmtDate(photo.takenAt) }));
    return { photo, index, caption: parts.join(" · ") };
  });

  stepViewer(delta: number): void {
    this.viewerIndex.update((index) => {
      if (index === null) return index;
      return Math.min(Math.max(index + delta, 0), this.orderedPhotos().length - 1);
    });
  }

  constructor() {
    // Mode API : la galerie se charge à l'ouverture de la fiche (et à chaque changement de producteur).
    effect(() => {
      const producerId = this.id();
      untracked(() => {
        this.fetchedPhotos.set(null);
        this.viewerIndex.set(null);
        this.heroPhotoOpen.set(false);
        this.expandedPlotId.set(null);
        this.photoState.set("idle");
        if (producerId && this.browser && isApiMode()) {
          void this.loadPhotos(producerId);
          void this.loadRecord(producerId);
        }
      });
    });
  }

  /**
   * Mode API : la fiche et ses parcelles se lisent à l'ouverture (une fiche et quelques parcelles), sans charger
   * la liste complète des producteurs.
   */
  private async loadRecord(producerId: string): Promise<void> {
    try {
      if (!this.store.state().producers.some((p) => p.id === producerId)) {
        this.store.actions.upsertProducerFromApi(producerFromApi(await getProducer(producerId)));
      }
      const plots = await listPlots({ producerId, page: 1, limit: MAX_PAGE_SIZE });
      this.store.actions.upsertPlotsFromApi(plots.items.map(plotFromApi));
    } catch {
      // Fiche ou parcelles indisponibles : l'écran garde ce qu'il a déjà.
    }
  }

  async loadPhotos(producerId: string): Promise<void> {
    const request = ++this.photoRequest;
    this.photoState.set("loading");
    try {
      const photos = await fetchProducerPhotos(producerId);
      if (request !== this.photoRequest) return;
      this.fetchedPhotos.set(photos);
      this.photoState.set("ready");
    } catch {
      if (request !== this.photoRequest) return;
      this.photoState.set("error");
    }
  }

  /** Valeur suivie de son unité (« 0,25 ha », « 1 200 kg ») ; « — » si elle manque. */
  amount(value: number | null | undefined, key: MessageKey, format: Intl.NumberFormat = nf2): string {
    if (value === null || value === undefined || !Number.isFinite(value)) return "—";
    return this.t()(key, { value: format.format(value) });
  }

  yesNo(value: boolean | null | undefined): string {
    if (value === null || value === undefined) return "—";
    return this.t()(value ? "producteurs.detail.yes" : "producteurs.detail.no");
  }

  coordinates(latitude: number, longitude: number): string {
    return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  }

  contourLabel(plot: Plot): string {
    const translate = this.t();
    if (!plot.raw.length) return translate("producteurs.plots.contourMissing");
    if (plot.contourRepaired || plot.repaired) return translate("producteurs.plots.contourRepaired");
    if (plot.contourValid === false) return translate("producteurs.plots.contourInvalid");
    return translate("producteurs.plots.contourValid");
  }

  surveyQualityTone(status: string): { bg: string; fg: string } {
    return status === "Validée" ? TONE.succes : TONE.attente;
  }

  readonly showCni = signal(false);
  readonly showPhone = signal(false);
  readonly cniOpen = signal(false);
  readonly cniReason = signal("");

  readonly correctionOpen = signal(false);
  readonly corrFirstName = signal("");
  readonly corrLastName = signal("");
  readonly corrPhone = signal("");
  readonly corrAge = signal("");
  readonly corrStatus = signal<Producer["status"]>("recensé");
  readonly corrMotif = signal("");

  private readonly id = toSignal(this.route.paramMap.pipe(map((p) => p.get("id") ?? "")), {
    initialValue: "",
  });

  readonly producer = computed(() => {
    const id = this.id();
    return this.store.state().producers.find((p) => p.id === id);
  });

  readonly inScopeProducer = computed(() => {
    const p = this.producer();
    if (!p) return false;
    return inScope([p], this.store.state().session).length === 1;
  });

  /**
   * Ce qu'il y a à vérifier sur la fiche : les alertes signalées par le CRADESC lors du nettoyage, au niveau du
   * producteur (enquête), de ses parcelles et de leurs cultures. Vide si rien n'est signalé.
   */
  readonly checkItems = computed(() => {
    const translate = this.t();
    const current = this.producer();
    if (!current) return [];
    const items: { id: string; where: string; place: string; text: string }[] = [];
    (current.survey?.alerts ?? []).forEach((text, index) =>
      items.push({ id: `p-${index}`, where: translate("producteurs.check.whereProducer"), place: "", text }),
    );
    for (const plot of this.plots()) {
      (plot.alerts ?? []).forEach((text, index) =>
        items.push({
          id: `${plot.id}-${index}`,
          where: translate("producteurs.check.wherePlot", { code: plot.code }),
          place: plot.code,
          text,
        }),
      );
      for (const crop of plot.cropDetails ?? []) {
        crop.alerts.forEach((text, index) =>
          items.push({
            id: `${crop.id}-${index}`,
            where: translate("producteurs.check.whereCrop", { crop: crop.crop, code: plot.code }),
            place: `${crop.crop} · ${plot.code}`,
            text,
          }),
        );
      }
    }
    return items;
  });

  /** Mode API : « Contacter la coopérative » au sujet de cette fiche (administrateur CRADESC). */
  readonly canContact = computed(() => isApiMode() && this.store.can("coop_request.send"));
  readonly contactTargets = signal<CoopRequestTarget[]>([]);
  readonly contactLink = computed(() => `/dashboard/producteurs/${this.id()}`);

  /** Demande à la coopérative de la fiche : les points signalés en langage simple, jamais de téléphone ni de CNI. */
  openContact(): void {
    const current = this.producer();
    if (!current) return;
    this.contactTargets.set([
      {
        scoopId: current.scoopId,
        items: [producerItem(current)],
        ...sheetDraft({
          code: current.code,
          name: `${current.firstName} ${current.lastName}`,
          points: this.checkItems().map((item) => ({ text: item.text, place: item.place })),
        }),
      },
    ]);
  }

  readonly plots = computed(() => {
    const id = this.id();
    return this.store.state().plots.filter((pl) => pl.producerId === id);
  });

  readonly canCni = () => this.store.can("identity.read_full");

  plotTone(status: string) {
    return PLOT_TONE[status] ?? TONE.neutre;
  }

  scoopName(id: string): string {
    return this.store.state().scoops.find((c) => c.id === id)?.name ?? id;
  }

  readonly heroBadges = computed<HeroBadge[]>(() => {
    const p = this.producer();
    if (!p) return [];
    const t = this.t();
    const q = QUALITY_TONE[p.quality];
    return [
      {
        label: t(STATUS_KEY[p.status]),
        tone: p.status === "membre" ? "citron" : "light",
        icon: p.status === "membre" ? "check_circle" : "person",
      },
      {
        label: t(q.label),
        tone: p.quality === "validé" ? "glass" : p.quality === "invalide" ? "danger" : "warn",
        icon: p.quality === "validé" ? "task_alt" : "warning",
      },
      ...(p.mergedInto
        ? [{ label: t("producteurs.detail.merged"), tone: "warn" as const, icon: "info" as const }]
        : []),
    ];
  });

  readonly heroMeta = computed<HeroMeta[]>(() => {
    const p = this.producer();
    if (!p) return [];
    const o = this.org(p.orgId);
    return [
      { icon: "location_on", text: p.village },
      ...(o ? [{ icon: "hub" as const, text: o.name }] : []),
      { icon: "apartment", text: this.scoopName(p.scoopId) },
    ];
  });

  readonly stats = computed<StatCard[]>(() => {
    const p = this.producer();
    if (!p) return [];
    const t = this.t();
    const plots = this.plots();
    const measured = plots.reduce((n, x) => n + (x.measured || 0), 0);
    const declared = plots.reduce((n, x) => n + (x.declared || 0), 0);
    return [
      {
        label: t("producteurs.v2.kpi.plots"),
        value: nf.format(plots.length),
        sub: t("producteurs.v2.kpi.plotsSub", {
          count: plots.filter((x) => x.status === "validée").length,
        }),
        icon: "landscape",
        bg: "",
        fg: "",
      },
      {
        label: t("producteurs.v2.kpi.area"),
        value: `${nf1.format(measured)} ha`,
        sub: t("producteurs.v2.kpi.areaSub", { declared: nf1.format(declared) }),
        icon: "square_foot",
        ...TONE.succes,
      },
      {
        label: t("producteurs.v2.kpi.crops"),
        value: nf.format(p.crops.length),
        sub: t("producteurs.v2.kpi.cropsSub", {
          count: new Set(p.crops.map((c) => c.campaign)).size,
        }),
        icon: "grass",
        ...TONE.culture,
      },
      {
        label: t("producteurs.v2.kpi.changes"),
        value: nf.format(p.history.length),
        sub: t("producteurs.v2.kpi.changesSub"),
        icon: "event_note",
        ...TONE.info,
      },
    ];
  });

  org(orgId: string): { id: string; name: string } | undefined {
    const o = this.store.state().orgs.find((x) => x.id === orgId);
    return o ? { id: o.id, name: o.name } : undefined;
  }

  showVal(field: string, v: string): string {
    const tr = this.t();
    if (field === "Téléphone") return v ? maskPhone(v) : tr("producteurs.notSet");
    if (field === "CNI") return v ? maskCni(v) : tr("producteurs.notSet");
    return v || tr("producteurs.notSet");
  }

  readonly correctionDialogTitle = computed(() => {
    const p = this.producer();
    if (!p) return "";
    return this.t()("producteurs.detail.correction.title", {
      name: `${p.firstName} ${p.lastName}`,
    });
  });

  corrPhoneErr(): string {
    if (!this.correctionOpen()) return "";
    const phone = this.corrPhone().trim();
    if (!phone) return "";
    // Valeur inchangée : jamais d'erreur (Q-17). Format exigé seulement pour un numéro nouveau ou modifié.
    return isPhoneInputAccepted(phone, this.producer()?.phone) ? "" : this.t()("producteurs.detail.correction.phoneError");
  }

  corrAgeErr(): string {
    if (!this.correctionOpen()) return "";
    const raw = this.corrAge().trim();
    if (raw === "") return "";
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 15 || n > 100)
      return this.t()("producteurs.detail.correction.ageError");
    return "";
  }

  correctionChanges(): CorrectionChange[] {
    const p = this.producer();
    if (!p || !this.correctionOpen()) return [];
    const out: CorrectionChange[] = [];
    if (this.corrFirstName() !== p.firstName)
      out.push({ field: "Prénom", from: p.firstName, to: this.corrFirstName() });
    if (this.corrLastName() !== p.lastName)
      out.push({ field: "Nom", from: p.lastName, to: this.corrLastName() });
    if (this.corrPhone().trim() !== p.phone)
      out.push({ field: "Téléphone", from: p.phone, to: this.corrPhone().trim() });
    const ageRaw = this.corrAge().trim();
    const ageN = ageRaw === "" ? null : Number(ageRaw);
    if (ageN !== null && ageN !== p.age)
      out.push({ field: "Âge", from: p.age === null ? "" : String(p.age), to: String(ageN) });
    if (this.corrStatus() !== p.status)
      out.push({ field: "Statut d'adhésion", from: p.status, to: this.corrStatus() });
    return out;
  }

  canSubmitCorrection(): boolean {
    const p = this.producer();
    if (!p) return false;
    return (
      this.correctionChanges().length > 0 &&
      this.corrMotif().trim().length >= 10 &&
      !this.corrPhoneErr() &&
      !this.corrAgeErr()
    );
  }

  openCniDialog(): void {
    this.cniReason.set("");
    this.cniOpen.set(true);
  }

  closeCniDialog(): void {
    this.cniOpen.set(false);
    this.cniReason.set("");
  }

  async confirmRevealCni(): Promise<void> {
    const p = this.producer();
    if (!p) return;
    const res = await this.flow.revealCni(p, this.cniReason().trim());
    if (!res.ok) {
      this.snackbar.error(res.error);
      return;
    }
    this.showCni.set(true);
    this.snackbar.info(this.t()("producteurs.detail.revealed"));
    this.closeCniDialog();
  }

  async revealPhone(p: Producer): Promise<void> {
    const res = await this.flow.revealPhone(p);
    if (!res.ok) {
      this.snackbar.error(res.error);
      return;
    }
    this.showPhone.set(true);
    this.snackbar.info(this.t()("producteurs.detail.revealed"));
  }

  openCorrection(): void {
    const p = this.producer();
    if (!p) return;
    this.corrFirstName.set(p.firstName);
    this.corrLastName.set(p.lastName);
    this.corrPhone.set(p.phone);
    this.corrAge.set(p.age === null ? "" : String(p.age));
    this.corrStatus.set(p.status);
    this.corrMotif.set("");
    this.correctionOpen.set(true);
  }

  async submitCorrectionForm(): Promise<void> {
    const p = this.producer();
    if (!p || !this.canSubmitCorrection()) return;
    const res = await this.flow.submitCorrection(p.id, this.correctionChanges(), this.corrMotif().trim());
    if (!res.ok) {
      this.snackbar.error(res.error);
      return;
    }
    this.correctionOpen.set(false);
    this.snackbar.success(
      `${this.t()("producteurs.detail.correction.sent")} · ${this.t()("producteurs.detail.correction.sentDesc")}`,
    );
  }
}
