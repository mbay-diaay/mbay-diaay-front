import { Component, computed, effect, inject, signal } from "@angular/core";
import { RouterLink } from "@angular/router";

import { isApiMode } from "@/lib/api/config";
import {
  getSigPlot,
  getSigStats,
  listSigCooperatives,
  loadSigViewport,
  type SigCooperativeDto,
  type SigFeature,
  type SigPlotDetailDto,
  type SigStatsDto,
} from "@/lib/api/sig";
import { nf } from "@/lib/format";
import { AppShellComponent } from "@shared/app-shell.component";
import { LocaleService } from "@shared/locale.service";
import { cropEmoji, SigMapComponent, type SigBasemap } from "@shared/sig-map.component";
import {
  IconComponent,
  SelectComponent,
  StatCardsComponent,
  TONE,
  UiEmptyComponent,
  UiEmptyStateComponent,
  UiPageHeaderComponent,
  V2_PAGE_STYLES,
  type SelectOption,
  type StatCard,
} from "@shared/ui";

@Component({
  selector: "app-carte-page",
  imports: [
    AppShellComponent,
    UiPageHeaderComponent,
    UiEmptyComponent,
    UiEmptyStateComponent,
    StatCardsComponent,
    SelectComponent,
    IconComponent,
    RouterLink,
    SigMapComponent,
  ],
  styles: [
    V2_PAGE_STYLES,
    `
      .layout {
        display: grid;
        gap: 16px;
        grid-template-columns: minmax(0, 1fr);
      }
      @media (min-width: 1100px) {
        .layout {
          grid-template-columns: minmax(0, 1fr) 340px;
        }
      }
      .stage {
        position: relative;
        height: 74vh;
        min-height: 480px;
        overflow: hidden;
        padding: 0;
      }
      .side {
        display: flex;
        flex-direction: column;
        max-height: 74vh;
        min-height: 320px;
        padding: 0;
        overflow: hidden;
      }
      .side-head {
        padding: 16px 18px 12px;
        border-bottom: 1px solid var(--v2-separateur);
      }
      .side-head h2 {
        font-size: 15px;
        font-weight: 800;
        margin: 0;
      }
      .side-head p {
        margin: 2px 0 0;
        font-size: 13px;
        color: var(--v2-gris-texte);
      }
      .list {
        overflow-y: auto;
        padding: 8px;
        display: grid;
        gap: 6px;
        align-content: start;
      }
      .item {
        display: grid;
        grid-template-columns: 44px minmax(0, 1fr);
        gap: 12px;
        align-items: center;
        width: 100%;
        text-align: left;
        padding: 10px 12px;
        border: 1.5px solid transparent;
        border-radius: 16px;
        background: transparent;
        cursor: pointer;
        color: inherit;
        transition: background 0.15s ease, border-color 0.15s ease;
      }
      .item:hover {
        background: var(--v2-sauge);
      }
      .item:focus-visible {
        outline: 2px solid var(--v2-foret);
        outline-offset: 2px;
      }
      .item.on {
        background: var(--v2-sauge);
        border-color: var(--v2-foret);
      }
      .bubble {
        display: grid;
        width: 44px;
        height: 44px;
        place-items: center;
        border-radius: 999px;
        background: var(--v2-foret);
        color: #fff;
        font-size: 12px;
        font-weight: 800;
        box-shadow: 0 0 0 3px var(--v2-citron);
      }
      .name {
        font-weight: 800;
        font-size: 14px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .meta {
        font-size: 12.5px;
        color: var(--v2-gris-texte);
        font-weight: 600;
      }
      .fiche {
        position: absolute;
        z-index: 5;
        top: 14px;
        left: 14px;
        width: min(340px, calc(100% - 28px));
        max-height: calc(100% - 28px);
        overflow-y: auto;
        border-radius: 22px;
        background: color-mix(in oklab, var(--v2-blanc) 96%, transparent);
        backdrop-filter: blur(8px);
        box-shadow: 0 14px 44px color-mix(in oklab, var(--v2-encre) 30%, transparent);
      }
      .fiche-tete {
        display: grid;
        grid-template-columns: 68px minmax(0, 1fr) auto;
        gap: 14px;
        align-items: center;
        padding: 16px 16px 12px;
      }
      .portrait {
        width: 68px;
        height: 68px;
        border-radius: 999px;
        object-fit: cover;
        background: var(--v2-sauge);
        box-shadow: 0 0 0 3px var(--v2-citron);
      }
      .initiales {
        display: grid;
        width: 68px;
        height: 68px;
        place-items: center;
        border-radius: 999px;
        background: var(--v2-foret);
        color: var(--v2-citron);
        font-size: 22px;
        font-weight: 800;
        box-shadow: 0 0 0 3px var(--v2-citron);
      }
      .fiche h3 {
        margin: 0;
        font-size: 17px;
        font-weight: 800;
        line-height: 1.2;
      }
      .fiche .code {
        font-size: 12px;
        font-weight: 700;
        color: var(--v2-gris-texte);
      }
      .fermer {
        align-self: start;
        border: none;
        background: var(--v2-sauge);
        border-radius: 999px;
        width: 30px;
        height: 30px;
        display: grid;
        place-items: center;
        cursor: pointer;
        color: var(--v2-foret);
      }
      .faits {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        padding: 0 16px 12px;
      }
      .fait {
        background: var(--v2-sauge);
        border-radius: 14px;
        padding: 8px 10px;
        min-width: 0;
      }
      .fait small {
        display: block;
        font-size: 10.5px;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--v2-ardoise);
      }
      .fait strong {
        display: block;
        font-size: 13.5px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .galerie {
        display: flex;
        gap: 8px;
        overflow-x: auto;
        padding: 0 16px 14px;
        scroll-snap-type: x mandatory;
      }
      .galerie img {
        flex: none;
        width: 190px;
        height: 130px;
        object-fit: cover;
        border-radius: 14px;
        scroll-snap-align: start;
        background: var(--v2-sauge);
      }
      .sans-photo {
        margin: 0 16px 14px;
        padding: 14px;
        border-radius: 14px;
        border: 1.5px dashed var(--v2-gris-trait);
        font-size: 13px;
        font-weight: 600;
        color: var(--v2-gris-texte);
        text-align: center;
      }
      .fiche-pied {
        padding: 0 16px 16px;
      }
      .back {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-top: 8px;
        font-size: 13px;
        font-weight: 700;
        color: var(--v2-foret);
        background: none;
        border: none;
        padding: 0;
        cursor: pointer;
      }
    `,
  ],
  template: `
    <app-shell [perm]="perms" [area]="t()('nav.item.carte')">
      <ui-page-header [title]="t()('nav.item.carte')" [description]="t()('sig.carte.description')" />
      @if (apiMode) {
        <ui-stat-cards class="rise mt-6" [stats]="cards()" />
        <div class="toolbar card mt-6">
          <ui-select label="Fond de carte" [options]="baseOptions" [value]="basemap()" (valueChange)="basemap.set($any($event))" />
          <ui-select label="Vue" [options]="viewOptions" [value]="view3d() ? '3d' : '2d'" (valueChange)="view3d.set($event === '3d')" />
          <p class="sub">
            @if (!selectedScoopId()) {
              {{ nf.format(cooperatives().length) }} coopérative(s) · cliquez sur une bulle pour s'en approcher
            } @else if (loading()) {
              Chargement des parcelles…
            } @else {
              {{ nf.format(features().length) }} sur {{ nf.format(viewTotal()) }} parcelle(s) dans la vue
            }
          </p>
        </div>

        <div class="layout mt-4">
          <section class="card stage">
            <app-sig-map
              [cooperatives]="cooperatives()"
              [features]="features()"
              [selectedScoopId]="selectedScoopId()"
              [basemap]="basemap()"
              [view3d]="view3d()"
              (viewChanged)="bbox.set($event)"
              [selectedPlotId]="selectedPlotId()"
              (cooperativeClicked)="open($event)"
              (plotClicked)="openPlot($event)"
            />
            @if (plot(); as detail) {
              <article class="fiche" aria-label="Fiche de la parcelle">
                <div class="fiche-tete">
                  @if (detail.producer.portraitUrl) {
                    <img class="portrait" [src]="detail.producer.portraitUrl" [alt]="'Portrait de ' + detail.producer.name" loading="lazy" />
                  } @else {
                    <span class="initiales" aria-hidden="true">{{ initials(detail.producer.name) }}</span>
                  }
                  <div style="min-width: 0">
                    <h3>{{ detail.producer.name }}</h3>
                    <span class="code">{{ detail.code }}</span>
                    <span class="code" style="display: block">{{ detail.scoopName }}</span>
                  </div>
                  <button type="button" class="fermer" aria-label="Fermer la fiche" (click)="closePlot()"><ui-icon name="close" [size]="16" /></button>
                </div>
                <div class="faits">
                  <div class="fait"><small>Culture</small><strong>{{ emoji(detail.crop) }} {{ detail.crop || "—" }}</strong></div>
                  <div class="fait"><small>Surface</small><strong>{{ detail.areaHa != null ? nf.format(detail.areaHa) + " ha" : "—" }}</strong></div>
                  <div class="fait"><small>Village</small><strong>{{ detail.village || "—" }}</strong></div>
                </div>
                @if (detail.photos.length) {
                  <div class="galerie">
                    @for (photo of detail.photos; track photo.id) {
                      <img [src]="photo.url" [alt]="'Photo de la parcelle ' + detail.code" loading="lazy" />
                    }
                  </div>
                } @else {
                  <p class="sans-photo">Pas de photo pour cette parcelle.</p>
                }
                <div class="fiche-pied">
                  <a class="btn btn-primary" [routerLink]="['/dashboard/producteurs', detail.producer.id]">
                    <span>Voir la fiche du producteur</span>
                    <span class="btn-chip" aria-hidden="true"><ui-icon name="arrow_forward" [size]="16" /></span>
                  </a>
                </div>
              </article>
            } @else if (plotLoading()) {
              <article class="fiche" aria-busy="true"><p class="sans-photo" style="margin: 16px">Chargement de la parcelle…</p></article>
            }
          </section>

          <aside class="card side" aria-label="Coopératives">
            <div class="side-head">
              <h2>Coopératives</h2>
              <p>Producteurs, membres et parcelles de chaque coopérative.</p>
              @if (selectedScoopId()) {
                <button type="button" class="back" (click)="select(null)">
                  <ui-icon name="arrow_back" [size]="16" />Toutes les coopératives
                </button>
              }
            </div>
            <div class="list">
              @for (item of cooperatives(); track item.scoopId) {
                <button type="button" class="item" [class.on]="item.scoopId === selectedScoopId()" [disabled]="!item.center" (click)="select(item.scoopId)">
                  <span class="bubble" aria-hidden="true">{{ short(item.producers) }}</span>
                  <span style="min-width: 0">
                    <span class="name" style="display: block">{{ item.name }}</span>
                    <span class="meta" style="display: block">
                      {{ nf.format(item.producers) }} producteurs · {{ nf.format(item.organisations) }} GIE / organisations
                    </span>
                    <span class="meta" style="display: block">
                      {{ nf.format(item.located) }} parcelle(s) placée(s) · {{ nf.format(item.areaHa) }} ha
                    </span>
                  </span>
                </button>
              } @empty {
                @if (!loadingList()) {
                  <ui-empty-state [compact]="true" icon="landscape" title="Aucune coopérative placée" description="Aucune parcelle de votre périmètre n'a de position pour le moment." />
                }
              }
            </div>
          </aside>
        </div>
      } @else {
        <div class="surface"><ui-empty>{{ t()("commercial.empty") }}</ui-empty></div>
      }
    </app-shell>
  `,
})
export default class CartePage {
  protected readonly t = inject(LocaleService).t;
  protected readonly apiMode = isApiMode();
  protected readonly perms = ["map.read"] as const;
  protected readonly nf = nf;

  protected readonly stats = signal<SigStatsDto | null>(null);
  protected readonly cooperatives = signal<SigCooperativeDto[]>([]);
  protected readonly loadingList = signal(true);
  protected readonly features = signal<SigFeature[]>([]);
  protected readonly viewTotal = signal(0);
  protected readonly loading = signal(false);
  protected readonly bbox = signal("");
  protected readonly selectedScoopId = signal<string | null>(null);
  protected readonly basemap = signal<SigBasemap>("standard");
  protected readonly selectedPlotId = signal<string | null>(null);
  protected readonly plot = signal<SigPlotDetailDto | null>(null);
  protected readonly plotLoading = signal(false);
  protected readonly view3d = signal(true);
  protected readonly baseOptions: SelectOption[] = [
    { value: "standard", label: "Standard 3D" },
    { value: "sat", label: "Satellite" },
    { value: "clair", label: "Clair" },
  ];
  protected readonly viewOptions: SelectOption[] = [
    { value: "3d", label: "3D inclinée" },
    { value: "2d", label: "2D à plat" },
  ];
  private generation = 0;

  protected readonly cards = computed<StatCard[]>(() => {
    const s = this.stats();
    return [
      { label: "Parcelles", value: nf.format(s?.plots ?? 0), sub: "", icon: "landscape", bg: "", fg: "" },
      { label: "Avec contour", value: nf.format(s?.withContour ?? 0), sub: "", icon: "check_circle", ...TONE.succes },
      { label: "Point seul", value: nf.format(s?.pointOnly ?? 0), sub: "", icon: "location_on", ...TONE.info },
      { label: "Sans position", value: nf.format(s?.unlocated ?? 0), sub: "", icon: "warning", ...TONE.attente },
      { label: "Surface cartographiée (ha)", value: nf.format(s?.mappedAreaHa ?? 0), sub: "", icon: "square_foot", ...TONE.info },
    ];
  });

  constructor() {
    if (this.apiMode) {
      void getSigStats().then((value) => this.stats.set(value));
      void listSigCooperatives()
        .then((res) => this.cooperatives.set(res.items))
        .finally(() => this.loadingList.set(false));
    }
    effect(() => {
      const bbox = this.bbox();
      const scoopId = this.selectedScoopId();
      if (!this.apiMode) return;
      if (!scoopId || !bbox) {
        this.generation++;
        this.features.set([]);
        this.viewTotal.set(0);
        return;
      }
      void this.load(bbox, scoopId);
    });
  }

  protected select(scoopId: string | null) {
    this.closePlot();
    this.selectedScoopId.set(scoopId && scoopId === this.selectedScoopId() ? null : scoopId);
  }

  /** Clic sur la carte : ouvre toujours la coopérative (ne la referme jamais, contrairement à la liste). */
  protected open(scoopId: string) {
    if (scoopId === this.selectedScoopId()) return;
    this.closePlot();
    this.selectedScoopId.set(scoopId);
  }

  protected async openPlot(plotId: string) {
    this.selectedPlotId.set(plotId);
    this.plot.set(null);
    this.plotLoading.set(true);
    try {
      const detail = await getSigPlot(plotId);
      if (this.selectedPlotId() === plotId) this.plot.set(detail);
    } catch {
      if (this.selectedPlotId() === plotId) this.closePlot();
    } finally {
      this.plotLoading.set(false);
    }
  }

  protected readonly emoji = cropEmoji;

  protected closePlot() {
    this.selectedPlotId.set(null);
    this.plot.set(null);
  }

  protected initials(name: string): string {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  }

  /** Pastille de la liste : « 2,7 k » pour les grands nombres. */
  protected short(value: number): string {
    return value >= 1000 ? `${(value / 1000).toFixed(1).replace(".", ",")} k` : String(value);
  }

  private async load(bbox: string, scoopId: string) {
    const generation = ++this.generation;
    this.loading.set(true);
    try {
      const res = await loadSigViewport({ bbox, scoopId }, 30, () => generation !== this.generation);
      if (generation !== this.generation) return;
      this.features.set(res.features);
      this.viewTotal.set(res.total);
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }
}
