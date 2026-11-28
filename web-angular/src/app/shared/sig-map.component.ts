import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  OnDestroy,
  output,
  PLATFORM_ID,
  signal,
  viewChild,
} from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import type { GeoJSONSource, Map as MapboxMap } from "mapbox-gl";

import { mapboxToken } from "@/lib/api/config";
import type { SigCooperativeDto, SigFeature } from "@/lib/api/sig";
import { FAM_VAR } from "@/lib/mapColors";

export type SigBasemap = "standard" | "clair" | "sat";

const STYLES: Record<SigBasemap, string> = {
  /** Relief, bâtiments en 3D et éclairage : le rendu par défaut. */
  standard: "mapbox://styles/mapbox/standard",
  clair: "mapbox://styles/mapbox/light-v11",
  sat: "mapbox://styles/mapbox/satellite-streets-v12",
};

/** Famille de culture d'après le nom (les familles du référentiel donnent les couleurs de la charte). */
export function cropFamily(crop: string | null): string {
  const name = (crop ?? "").toLowerCase();
  if (/oignon|échalote|echalote|ail\b/.test(name)) return "Bulbes";
  if (/chou|laitue|salade|épinard|epinard|persil|menthe|céleri|celeri/.test(name)) return "Feuilles";
  if (/tomate|piment|poivron|aubergine|jaxatu|gombo|concombre|courgette|pastèque|melon|haricot vert/.test(name)) return "Fruits-légumes";
  if (/carotte|navet|betterave|patate|manioc|radis|pomme de terre/.test(name)) return "Racines";
  if (/mangue|agrume|citron|orange|banane|papaye|goyave|anacarde|datte/.test(name)) return "Arbres fruitiers";
  if (/mil\b|maïs|mais\b|riz|sorgho|arachide|niébé|niebe|haricot/.test(name)) return "Céréales et légumineuses";
  return "Autres";
}

/** Illustration d'une culture : le dessin affiché sur la carte, la légende et la fiche. */
export function cropEmoji(crop: string | null): string {
  const name = (crop ?? "").toLowerCase();
  const table: [RegExp, string][] = [
    [/oignon|gandiol|ngagne|orion|échalote|echalote/, "🧅"],
    [/\bail\b/, "🧄"],
    [/chou|salade|laitue|épinard|epinard/, "🥬"],
    [/persil|menthe|nana|gombo|céleri|celeri/, "🌿"],
    [/tomate/, "🍅"],
    [/piment/, "🌶️"],
    [/poivron/, "🫑"],
    [/aubergine|diakhatou/, "🍆"],
    [/concombre|courgette/, "🥒"],
    [/pastèque|pasteque/, "🍉"],
    [/melon/, "🍈"],
    [/fraise/, "🍓"],
    [/carotte|navet/, "🥕"],
    [/pomme de terre/, "🥔"],
    [/patate|manioc/, "🍠"],
    [/mangue/, "🥭"],
    [/agrume|citron|orange|mandarine/, "🍋"],
    [/banane/, "🍌"],
    [/papaye/, "🍈"],
    [/maïs|mais\b/, "🌽"],
    [/\bmil\b|riz|sorgho/, "🌾"],
    [/arachide/, "🥜"],
    [/niébé|niebe|haricot/, "🫘"],
    [/bissap|oseille/, "🌺"],
  ];
  return table.find(([pattern]) => pattern.test(name))?.[1] ?? "🌱";
}

const PARCELLES = "parcelles";
const ICONES = "parcelles-icones";
const BULLES = "cooperatives";
const ZONES = "zones";
const PITCH = 52;
const BEARING = -14;

/**
 * Carte M5 en 3D (Mapbox GL JS, côté client seulement).
 * Vue d'ensemble : une bulle par coopérative (taille = nombre de producteurs) et sa zone couverte.
 * Une coopérative choisie : la carte s'y rapproche et dessine ses parcelles en prismes colorés par famille de culture.
 */
@Component({
  selector: "app-sig-map",
  host: { class: "relative isolate block h-full w-full", style: "z-index: 0" },
  template: `
    @if (!browser) {
      <div class="grid h-full place-items-center text-xs">…</div>
    } @else if (!token) {
      <div class="grid h-full place-items-center p-6 text-center text-sm font-semibold">
        Jeton Mapbox absent : ajoutez VITE_MAPBOX_TOKEN dans web-angular/.env.local, puis relancez le site.
      </div>
    } @else {
      <div #host class="h-full w-full"></div>
      @if (selectedScoopId() && legend().length) {
        <div class="legend" aria-label="Légende des cultures">
          <strong>Cultures</strong>
          @for (item of legend(); track item.label) {
            <span><em>{{ item.emoji }}</em>{{ item.label }}<small>{{ item.count }}</small></span>
          }
        </div>
      }
    }
  `,
  styles: `
    .legend {
      min-width: 180px;
      position: absolute;
      left: 12px;
      bottom: 28px;
      display: grid;
      gap: 3px;
      padding: 10px 14px;
      border-radius: 14px;
      background: color-mix(in oklab, var(--v2-blanc) 94%, transparent);
      backdrop-filter: blur(6px);
      box-shadow: 0 6px 24px color-mix(in oklab, var(--v2-encre) 22%, transparent);
      font-size: 12px;
      color: var(--v2-encre);
    }
    .legend strong {
      font-size: 11px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--v2-ardoise);
    }
    .legend span {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
    }
    .legend em {
      font-style: normal;
      font-size: 17px;
      line-height: 1;
      width: 22px;
      text-align: center;
    }
    .legend small {
      margin-left: auto;
      padding-left: 10px;
      font-weight: 700;
      color: var(--v2-gris-texte);
    }
  `,
})
export class SigMapComponent implements OnDestroy {
  readonly cooperatives = input<SigCooperativeDto[]>([]);
  readonly features = input<SigFeature[]>([]);
  /** Coopérative ouverte : ses parcelles sont dessinées et la carte s'y cadre. */
  readonly selectedScoopId = input<string | null>(null);
  readonly basemap = input<SigBasemap>("standard");
  /** Vue inclinée (3D) ou à plat (2D). */
  readonly view3d = input(true);
  /** Emprise visible, après chaque déplacement ou zoom : l'écran en recharge les parcelles. */
  readonly viewChanged = output<string>();
  readonly cooperativeClicked = output<string>();
  /** Clic sur une parcelle : l'écran en affiche la fiche (propriétaire, photo). */
  readonly plotClicked = output<string>();
  /** Parcelle ouverte : mise en relief et cadrage. */
  readonly selectedPlotId = input<string | null>(null);

  protected readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly token = mapboxToken();
  private readonly host = viewChild<ElementRef<HTMLDivElement>>("host");

  private map: MapboxMap | null = null;
  private ready = false;
  private framedFor: string | null = null;
  private currentStyle: SigBasemap | null = null;

  protected readonly legend = computed(() => {
    const counts = new Map<string, number>();
    for (const feature of this.features()) {
      const crop = (feature.properties.crop ?? "Autre culture").trim() || "Autre culture";
      counts.set(crop, (counts.get(crop) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((first, second) => second[1] - first[1])
      .slice(0, 8)
      .map(([label, count]) => ({ label, count, emoji: cropEmoji(label) }));
  });

  constructor() {
    if (!this.browser || !this.token) return;
    afterNextRender(() => void this.init());
    effect(() => {
      const basemap = this.basemap();
      if (this.ready && basemap !== this.currentStyle) {
        this.currentStyle = basemap;
        this.map?.setStyle(STYLES[basemap]);
      }
    });
    effect(() => {
      this.features();
      if (this.ready) this.updateParcelles();
    });
    effect(() => {
      this.cooperatives();
      this.selectedScoopId();
      if (this.ready) {
        this.updateCooperatives();
        this.frame();
      }
    });
    effect(() => {
      const plotId = this.selectedPlotId();
      if (this.ready) this.highlight(plotId);
    });
    effect(() => {
      const flat = !this.view3d();
      if (this.ready) this.map?.easeTo({ pitch: flat ? 0 : PITCH, bearing: flat ? 0 : BEARING, duration: 900 });
    });
  }

  ngOnDestroy(): void {
    this.map?.remove();
    this.map = null;
  }

  private async init() {
    const element = this.host()?.nativeElement;
    if (!element || this.map || !this.token) return;
    const mapboxgl = (await import("mapbox-gl")).default;
    mapboxgl.accessToken = this.token;
    this.currentStyle = this.basemap();
    const map = new mapboxgl.Map({
      container: element,
      style: STYLES[this.currentStyle],
      center: [-16.8, 15.2],
      zoom: 8.6,
      pitch: this.view3d() ? PITCH : 0,
      bearing: this.view3d() ? BEARING : 0,
      antialias: true,
    });
    this.map = map;
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new mapboxgl.FullscreenControl(), "top-right");
    map.addControl(new mapboxgl.ScaleControl({ unit: "metric" }), "bottom-right");
    map.on("style.load", () => this.setupLayers());
    map.on("moveend", () => this.emitView());
    this.ready = true;
    this.frame();
  }

  /** Cadre la carte : sur la coopérative choisie, sinon sur l'ensemble des coopératives. */
  private frame() {
    const map = this.map;
    if (!map) return;
    const selected = this.selectedScoopId();
    const all = this.cooperatives().filter((item) => item.bbox);
    const target = selected ? all.find((item) => item.scoopId === selected)?.bbox ?? null : null;
    const bounds = target ?? (all.length ? this.union(all.map((item) => item.bbox as number[])) : null);
    if (!bounds) return;
    const key = selected ?? "toutes";
    if (this.framedFor === key) return;
    this.framedFor = key;
    const focus = selected ? this.cooperatives().find((item) => item.scoopId === selected)?.focus : null;
    if (focus) {
      // Entrée dans l'espace de la coopérative : on se pose sur son cœur, assez près pour voir les parcelles.
      map.stop();
      map.flyTo({ center: focus as [number, number], zoom: 14, pitch: this.view3d() ? PITCH : 0, bearing: this.view3d() ? BEARING : 0, duration: 2200, essential: true });
      return;
    }
    const [west, south, east, north] = bounds as [number, number, number, number];
    map.stop();
    map.fitBounds([[west, south], [east, north]], {
      padding: { top: 70, bottom: 70, left: 70, right: 70 },
      // Une coopérative ouverte : on entre dans son espace (zoom serré) ; la molette et les boutons restent libres ensuite.
      maxZoom: selected ? 15 : 11,
      pitch: this.view3d() ? PITCH : 0,
      bearing: this.view3d() ? BEARING : 0,
      duration: 1600,
      essential: true,
    } as never);
  }

  private union(boxes: number[][]): number[] {
    return [
      Math.min(...boxes.map((box) => box[0] as number)),
      Math.min(...boxes.map((box) => box[1] as number)),
      Math.max(...boxes.map((box) => box[2] as number)),
      Math.max(...boxes.map((box) => box[3] as number)),
    ];
  }

  private emitView() {
    const bounds = this.map?.getBounds();
    if (!bounds) return;
    this.viewChanged.emit([bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].map((value) => value.toFixed(6)).join(","));
  }

  private colors(): Record<string, string> {
    const css = getComputedStyle(document.documentElement);
    return Object.fromEntries(
      Object.entries(FAM_VAR).map(([family, variable]) => [family, css.getPropertyValue(variable).trim() || "#6b7a72"]),
    );
  }

  private token_(name: string, fallback: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  }

  /** Relief, ciel et couches : refaits à chaque changement de fond de carte (le style repart de zéro). */
  private setupLayers() {
    const map = this.map;
    if (!map) return;
    const foret = this.token_("--v2-foret", "#0f3d2a");
    const citron = this.token_("--v2-citron", "#c6f05a");
    if (!map.getSource("mapbox-dem")) {
      map.addSource("mapbox-dem", { type: "raster-dem", url: "mapbox://mapbox.mapbox-dem", tileSize: 512, maxzoom: 14 });
    }
    if (this.currentStyle !== "standard") map.setTerrain({ source: "mapbox-dem", exaggeration: 1.6 });
    if (this.currentStyle === "sat") {
      map.addLayer({ id: "ciel", type: "sky", paint: { "sky-type": "atmosphere", "sky-atmosphere-sun-intensity": 8 } } as never);
    }
    const slot = this.currentStyle === "standard" ? { slot: "middle" } : {};
    const topSlot = this.currentStyle === "standard" ? { slot: "top" } : {};
    const polygons = ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]];

    // Zones couvertes par chaque coopérative.
    map.addSource(ZONES, { type: "geojson", data: this.zonesData() as never });
    map.addLayer({ id: "zones-fond", type: "fill", source: ZONES, paint: { "fill-color": foret, "fill-opacity": ["case", ["==", ["get", "choisie"], 1], 0, 0.16] }, ...slot } as never);
    map.addLayer({ id: "zones-trait", type: "line", source: ZONES, paint: { "line-color": foret, "line-width": 2, "line-dasharray": [2, 2], "line-opacity": ["case", ["==", ["get", "choisie"], 1], 0.9, 0.55] }, ...slot } as never);

    // Parcelles de la coopérative ouverte.
    map.addSource(PARCELLES, { type: "geojson", data: this.parcellesData() as never });
    map.addLayer({
      id: "parcelles-3d",
      type: "fill-extrusion",
      source: PARCELLES,
      filter: polygons,
      paint: { "fill-extrusion-color": ["get", "couleur"], "fill-extrusion-height": 6, "fill-extrusion-base": 0, "fill-extrusion-opacity": 0.78, "fill-extrusion-vertical-gradient": true },
      ...slot,
    } as never);
    map.addLayer({ id: "parcelles-contour", type: "line", source: PARCELLES, filter: polygons, paint: { "line-color": "#ffffff", "line-width": 1.2, "line-opacity": 0.9 }, ...slot } as never);
    map.addLayer({
      id: "parcelles-points",
      type: "circle",
      source: PARCELLES,
      filter: ["==", ["geometry-type"], "Point"],
      paint: { "circle-color": ["get", "couleur"], "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 3.5, 15, 9], "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 },
      ...slot,
    } as never);

    // Dessin de la culture au centre de chaque parcelle : médaillon blanc + plante.
    this.registerIcons();
    map.addSource(ICONES, { type: "geojson", data: this.iconesData() as never });
    map.addLayer({
      id: "icones-fond",
      type: "circle",
      source: ICONES,
      minzoom: 12.5,
      paint: {
        "circle-color": "#ffffff",
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 12.5, 11, 16, 19, 18, 26],
        "circle-stroke-color": citron,
        "circle-stroke-width": 2.5,
        "circle-pitch-alignment": "viewport",
      },
      ...topSlot,
    } as never);
    map.addLayer({
      id: "icones",
      type: "symbol",
      source: ICONES,
      minzoom: 12.5,
      layout: {
        "icon-image": ["get", "icone"],
        "icon-size": ["interpolate", ["linear"], ["zoom"], 12.5, 0.38, 16, 0.62, 18, 0.9],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "icon-pitch-alignment": "viewport",
      },
      ...topSlot,
    } as never);

    // Bulles : une par coopérative, taille selon le nombre de producteurs.
    map.addSource(BULLES, { type: "geojson", data: this.bullesData() as never });
    const rayon = ["interpolate", ["linear"], ["get", "producteurs"], 0, 16, 300, 22, 1000, 31, 3000, 44];
    map.addLayer({ id: "bulles-halo", type: "circle", source: BULLES, filter: ["!=", ["get", "choisie"], 1], paint: { "circle-color": citron, "circle-opacity": 0.35, "circle-radius": ["+", rayon, 9], "circle-blur": 0.4 }, ...topSlot } as never);
    map.addLayer({ id: "bulles", type: "circle", source: BULLES, filter: ["!=", ["get", "choisie"], 1], paint: { "circle-color": foret, "circle-radius": rayon, "circle-stroke-color": citron, "circle-stroke-width": 3 }, ...topSlot } as never);
    map.addLayer({
      id: "bulles-nombre",
      type: "symbol",
      source: BULLES,
      filter: ["!=", ["get", "choisie"], 1],
      layout: { "text-field": ["get", "nombre"], "text-size": 13, "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"], "text-allow-overlap": true },
      paint: { "text-color": "#ffffff" },
      ...topSlot,
    } as never);
    map.addLayer({
      id: "bulles-nom",
      type: "symbol",
      source: BULLES,
      layout: { "text-field": ["get", "nom"], "text-size": 13, "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"], "text-offset": [0, 2.6], "text-anchor": "top", "text-max-width": 9, "text-allow-overlap": false },
      paint: { "text-color": foret, "text-halo-color": "#ffffff", "text-halo-width": 2 },
      ...topSlot,
    } as never);

    for (const layer of ["bulles", "bulles-nombre", "zones-fond"]) {
      map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
      map.on("click", layer, (event) => {
        // Une coopérative est ouverte : un clic sur sa zone vise une parcelle, il ne doit ni la fermer ni défaire le zoom.
        if (layer === "zones-fond" && this.selectedScoopId()) return;
        const scoopId = event.features?.[0]?.properties?.["scoopId"] as string | undefined;
        if (scoopId && scoopId !== this.selectedScoopId()) this.cooperativeClicked.emit(scoopId);
      });
    }
    // Parcelle ouverte : prisme citron plus haut, bien visible au-dessus des autres.
    map.addLayer({
      id: "parcelle-choisie",
      type: "fill-extrusion",
      source: PARCELLES,
      filter: ["all", polygons, ["==", ["get", "plotId"], this.selectedPlotId() ?? ""]],
      paint: { "fill-extrusion-color": citron, "fill-extrusion-height": 42, "fill-extrusion-base": 0, "fill-extrusion-opacity": 0.95 },
      ...slot,
    } as never);
    map.addLayer({
      id: "parcelle-choisie-point",
      type: "circle",
      source: PARCELLES,
      filter: ["all", ["==", ["geometry-type"], "Point"], ["==", ["get", "plotId"], this.selectedPlotId() ?? ""]],
      paint: { "circle-color": citron, "circle-radius": 13, "circle-stroke-color": foret, "circle-stroke-width": 3 },
      ...slot,
    } as never);
    for (const layer of ["parcelles-3d", "parcelles-points", "parcelle-choisie", "icones-fond", "icones"]) {
      map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
      map.on("click", layer, (event) => {
        const plotId = event.features?.[0]?.properties?.["plotId"] as string | undefined;
        if (plotId) this.plotClicked.emit(plotId);
      });
    }
  }

  private highlight(plotId: string | null) {
    const map = this.map;
    if (!map) return;
    const id = plotId ?? "";
    if (map.getLayer("parcelle-choisie")) map.setFilter("parcelle-choisie", ["all", ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]], ["==", ["get", "plotId"], id]] as never);
    if (map.getLayer("parcelle-choisie-point")) map.setFilter("parcelle-choisie-point", ["all", ["==", ["geometry-type"], "Point"], ["==", ["get", "plotId"], id]] as never);
    if (!plotId) return;
    const feature = this.features().find((item) => item.id === plotId);
    const point = feature ? this.centerOf(feature) : null;
    // On recentre sans jamais dézoomer : le niveau choisi par l'utilisateur est gardé (on ne fait qu'entrer plus près).
    if (point) map.easeTo({ center: point, zoom: Math.max(map.getZoom(), 16), duration: 900 });
  }

  /** Centre d'une parcelle (moyenne des sommets de son contour, ou son point). */
  private centerOf(feature: SigFeature): [number, number] | null {
    const geometry = feature.geometry as { type: string; coordinates: unknown } | null;
    if (!geometry) return null;
    if (geometry.type === "Point") return geometry.coordinates as [number, number];
    const points: number[][] = [];
    const walk = (node: unknown) => {
      if (Array.isArray(node) && typeof node[0] === "number") points.push(node as number[]);
      else if (Array.isArray(node)) node.forEach(walk);
    };
    walk(geometry.coordinates);
    if (!points.length) return null;
    return [points.reduce((sum, p) => sum + (p[0] as number), 0) / points.length, points.reduce((sum, p) => sum + (p[1] as number), 0) / points.length];
  }

  private bullesData() {
    const selected = this.selectedScoopId();
    return {
      type: "FeatureCollection" as const,
      features: this.cooperatives()
        .filter((item) => item.center)
        .map((item) => ({
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: item.center as number[] },
          properties: {
            scoopId: item.scoopId,
            nom: item.name,
            producteurs: item.producers,
            nombre: new Intl.NumberFormat("fr-FR").format(item.producers),
            choisie: item.scoopId === selected ? 1 : 0,
          },
        })),
    };
  }

  private zonesData() {
    const selected = this.selectedScoopId();
    return {
      type: "FeatureCollection" as const,
      features: this.cooperatives()
        .filter((item) => item.hull)
        .map((item) => ({
          type: "Feature" as const,
          geometry: item.hull as never,
          properties: { scoopId: item.scoopId, nom: item.name, choisie: item.scoopId === selected ? 1 : 0 },
        })),
    };
  }

  /** GeoJSON des parcelles prêt à dessiner : couleur par famille de culture et champs lisibles pour la fiche. */
  private parcellesData() {
    const colors = this.colors();
    return {
      type: "FeatureCollection" as const,
      features: this.features()
        .filter((feature) => feature.geometry)
        .map((feature) => ({
          type: "Feature" as const,
          geometry: feature.geometry as never,
          properties: {
            plotId: feature.id,
            code: feature.properties.code,
            culture: feature.properties.crop,
            surface: feature.properties.areaHa != null ? `${feature.properties.areaHa} ha` : null,
            village: feature.properties.village,
            precision: feature.properties.precision,
            couleur: colors["Feuilles"] ?? "#3a7d2c",
          },
        })),
    };
  }

  private updateParcelles() {
    (this.map?.getSource(PARCELLES) as GeoJSONSource | undefined)?.setData(this.parcellesData() as never);
    (this.map?.getSource(ICONES) as GeoJSONSource | undefined)?.setData(this.iconesData() as never);
  }

  /** Un point par parcelle (au centre) portant le dessin de sa culture. */
  private iconesData() {
    return {
      type: "FeatureCollection" as const,
      features: this.features()
        .map((feature) => ({ feature, center: this.centerOf(feature) }))
        .filter((item) => item.center)
        .map(({ feature, center }) => ({
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: center as number[] },
          properties: { plotId: feature.id, icone: `ico-${cropEmoji(feature.properties.crop)}` },
        })),
    };
  }

  /** Enregistre chaque dessin (emoji) comme image de la carte : les images repartent de zéro à chaque changement de fond. */
  private registerIcons() {
    const map = this.map;
    if (!map) return;
    const emojis = new Set(["🌱", "🧅", "🧄", "🥬", "🌿", "🍅", "🌶️", "🫑", "🍆", "🥒", "🍉", "🍈", "🍓", "🥕", "🥔", "🍠", "🥭", "🍋", "🍌", "🌽", "🌾", "🥜", "🫘", "🌺"]);
    for (const emoji of emojis) {
      const id = `ico-${emoji}`;
      if (map.hasImage(id)) continue;
      const size = 96;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d");
      if (!context) continue;
      context.font = `${Math.round(size * 0.78)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(emoji, size / 2, size / 2 + size * 0.04);
      map.addImage(id, context.getImageData(0, 0, size, size), { pixelRatio: 2 });
    }
  }

  private updateCooperatives() {
    (this.map?.getSource(BULLES) as GeoJSONSource | undefined)?.setData(this.bullesData() as never);
    (this.map?.getSource(ZONES) as GeoJSONSource | undefined)?.setData(this.zonesData() as never);
  }
}
