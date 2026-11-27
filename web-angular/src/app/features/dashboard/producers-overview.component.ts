import { Component, computed, effect, inject, signal, untracked } from "@angular/core";
import { RouterLink } from "@angular/router";

import { isApiMode } from "@/lib/api/config";
import type { ProducerStats } from "@/lib/api/producers";
import { getStatsOverview, type StatsOverview } from "@/lib/api/stats";
import { nf } from "@/lib/format";
import { LocaleService } from "@shared/locale.service";
import { StoreService } from "@shared/store.service";
import { IconComponent, type IconName } from "@shared/ui";

type SourceChoice = "ALL" | "KOBO" | "CONSOLIDE" | "APPLICATION";

type Slice = { key: string; label: string; count: number; pct: number; color: string };

const AGE_COLORS: Record<string, string> = {
  "18-24": "var(--v2-vert-pousse)",
  "25-34": "var(--v2-foret)",
  "35-49": "var(--v2-soleil)",
  "50-64": "var(--v2-info-fg)",
  "65+": "var(--v2-culture-fg)",
  unknown: "var(--v2-gris-trait)",
};
const AGE_ORDER = ["18-24", "25-34", "35-49", "50-64", "65+", "unknown"] as const;

/**
 * Accueil : « Producteurs en chiffres ». Effectifs, hommes et femmes, jeunes, personnes en situation de handicap
 * (hommes / femmes) et deux camemberts (âge, sexe). Les chiffres sont calculés par le serveur sur le périmètre du
 * compte (`GET /producers/stats`), sans télécharger les fiches. Une base à la fois : jamais de mélange caché.
 */
@Component({
  selector: "app-producers-overview",
  imports: [IconComponent, RouterLink],
  styles: `
    .card {
      border-radius: 24px;
      border: 1px solid var(--v2-bord-carte);
      background: var(--v2-blanc);
    }
    .seg {
      display: flex;
      gap: 4px;
      border-radius: 14px;
      background: var(--v2-creme);
      padding: 4px;
      overflow-x: auto;
    }
    .seg button {
      white-space: nowrap;
      border-radius: 10px;
      padding: 8px 14px;
      font-size: 14px;
      font-weight: 700;
      color: var(--v2-gris-texte);
      cursor: pointer;
    }
    .seg button.on {
      background: var(--v2-foret);
      color: var(--v2-blanc);
    }
    .tile {
      display: flex;
      flex-direction: column;
      gap: 6px;
      border-radius: 20px;
      padding: 18px;
      min-width: 0;
    }
    .tile .value {
      font-size: 34px;
      font-weight: 800;
      line-height: 1;
      letter-spacing: -0.03em;
      font-variant-numeric: tabular-nums;
    }
    .pie {
      width: 168px;
      max-width: 100%;
      aspect-ratio: 1;
      flex-shrink: 0;
      border-radius: 50%;
    }
    .legend li {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 14px;
      font-weight: 600;
    }
    .legend .dot {
      width: 12px;
      height: 12px;
      flex-shrink: 0;
      border-radius: 4px;
    }
    .legend .n {
      margin-left: auto;
      font-variant-numeric: tabular-nums;
      font-weight: 800;
    }
    .legend .pct {
      width: 44px;
      text-align: right;
      color: var(--v2-gris-texte);
      font-variant-numeric: tabular-nums;
    }
  `,
  template: `
    @if (visible()) {
      <section aria-labelledby="prod-overview-title">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div class="min-w-0">
            <h2 id="prod-overview-title" class="text-[20px] font-extrabold tracking-[-0.02em]">
              {{ t()("dashboard.producers.title") }}
            </h2>
            <p class="mt-1 text-[14px] font-medium" style="color: var(--v2-gris-texte)">
              {{ t()("dashboard.producers.sub") }}
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <div class="seg" role="radiogroup" [attr.aria-label]="t()('dashboard.producers.title')">
              @for (choice of choices(); track choice.id) {
                <button
                  type="button"
                  role="radio"
                  [class.on]="source() === choice.id"
                  [attr.aria-checked]="source() === choice.id"
                  (click)="source.set(choice.id)"
                >
                  {{ choice.label }}
                </button>
              }
            </div>
            <a class="text-[14px] font-extrabold" style="color: var(--v2-foret)" routerLink="/dashboard/producteurs">
              {{ t()("dashboard.producers.open") }} →
            </a>
          </div>
        </div>

        @if (failed()) {
          <div class="card mt-4 flex flex-wrap items-center justify-between gap-3 p-5" role="alert">
            <span class="text-[15px] font-semibold">{{ t()("dashboard.producers.error") }}</span>
            <button type="button" class="text-[14px] font-extrabold" style="color: var(--v2-foret)" (click)="reload()">
              {{ t()("dashboard.producers.retry") }}
            </button>
          </div>
        } @else {
          <div class="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            @for (tile of tiles(); track tile.key) {
              <div class="tile" [style.background]="tile.bg" [style.color]="tile.fg">
                <span class="flex items-center justify-between gap-2 text-[13px] font-bold">
                  <span class="min-w-0">{{ tile.label }}</span>
                  <ui-icon [name]="tile.icon" [size]="20" />
                </span>
                <span class="value">{{ tile.value }}</span>
                <span class="text-[12px] font-semibold" style="opacity: 0.75">{{ tile.sub }}</span>
              </div>
            }
          </div>

          <div class="mt-4 grid gap-4 lg:grid-cols-2">
            @for (pie of pies(); track pie.key) {
              <article class="card p-5 sm:p-6" [attr.aria-label]="pie.title">
                <h3 class="text-[16px] font-extrabold tracking-[-0.01em]">{{ pie.title }}</h3>
                <div class="mt-4 flex flex-wrap items-center gap-6">
                  <div class="pie" [style.background]="pie.gradient" role="img" [attr.aria-label]="pie.title"></div>
                  <ul class="legend flex min-w-[220px] flex-1 flex-col gap-2.5">
                    @for (slice of pie.slices; track slice.key) {
                      <li>
                        <span class="dot" [style.background]="slice.color"></span>
                        <span class="min-w-0 truncate">{{ slice.label }}</span>
                        <span class="n">{{ nf.format(slice.count) }}</span>
                        <span class="pct">{{ slice.pct }} %</span>
                      </li>
                    }
                  </ul>
                </div>
              </article>
            }
          </div>
        }
      </section>
    }
  `,
})
export class ProducersOverviewComponent {
  private readonly store = inject(StoreService);
  private readonly locale = inject(LocaleService);
  protected readonly t = this.locale.t;
  protected readonly nf = nf;

  protected readonly source = signal<SourceChoice>("ALL");
  private readonly overview = signal<StatsOverview | null>(null);
  /** Totaux de la base choisie : le résumé contient toutes les bases, changer de base ne renvoie aucune demande. */
  private readonly stats = computed<ProducerStats | null>(() => this.overview()?.producers?.[this.source()] ?? null);
  protected readonly failed = signal(false);
  private readonly retryTick = signal(0);
  private requestId = 0;

  /** Seulement en mode serveur et pour qui peut lire les producteurs. */
  protected readonly visible = computed(() => isApiMode() && this.store.can("producer.read"));

  protected readonly choices = computed(() => {
    const t = this.t();
    return [
      { id: "ALL" as const, label: t("dashboard.producers.source.all") },
      { id: "KOBO" as const, label: t("dashboard.producers.source.kobo") },
      { id: "CONSOLIDE" as const, label: t("dashboard.producers.source.consolidated") },
      { id: "APPLICATION" as const, label: t("dashboard.producers.source.application") },
    ];
  });

  /** Le résumé ne se relit que si l'âge des « jeunes » change (pas au changement de base). */
  private readonly requestKey = computed(
    () => (this.visible() ? String(this.store.state().youthMaxAge) : ""),
    { equal: (a, b) => a === b },
  );

  private readonly _load = effect(() => {
    const key = this.requestKey();
    if (!key) return;
    this.retryTick();
    untracked(() => void this.load(Number(key)));
  });

  protected reload(): void {
    this.retryTick.update((n) => n + 1);
  }

  private async load(youthMaxAge: number): Promise<void> {
    const request = ++this.requestId;
    try {
      const overview = await getStatsOverview(youthMaxAge);
      if (request !== this.requestId) return;
      this.overview.set(overview);
      this.failed.set(false);
    } catch (error: unknown) {
      console.error("[ERROR][ProducersOverview.load]", error);
      if (request === this.requestId) this.failed.set(true);
    }
  }

  private pct(count: number, total: number): number {
    return total ? Math.round((count / total) * 100) : 0;
  }

  protected readonly tiles = computed(() => {
    const t = this.t();
    const stats = this.stats();
    const total = stats?.total ?? 0;
    const show = (value: number | undefined) => (stats && value !== undefined ? nf.format(value) : "—");
    // La base consolidée n'enregistre pas le handicap : « — » plutôt qu'un faux zéro.
    const handicapKnown = this.source() !== "CONSOLIDE";
    // Une petite part non nulle s'écrit « < 1 » : jamais « 0 % » quand il y a des personnes concernées.
    const share = (count: number | undefined) => {
      if (!stats || count === undefined) return "";
      const pct = this.pct(count, total);
      return t("dashboard.producers.share", { pct: count > 0 && pct === 0 ? "< 1" : pct });
    };
    const tile = (
      key: string,
      label: string,
      icon: IconName,
      value: string,
      sub: string,
      bg: string,
      fg: string,
    ) => ({ key, label, icon, value, sub, bg, fg });
    return [
      tile("total", t("dashboard.producers.total"), "agriculture", show(stats?.total), "", "var(--v2-foret)", "var(--v2-blanc)"),
      tile("men", t("dashboard.producers.men"), "person", show(stats?.men), share(stats?.men), "var(--v2-info-bg)", "var(--v2-info-fg)"),
      tile("women", t("dashboard.producers.women"), "female", show(stats?.women), share(stats?.women), "var(--v2-culture-bg)", "var(--v2-culture-fg)"),
      tile(
        "youth",
        t("dashboard.producers.youth"),
        "grass",
        show(stats?.youth),
        t("dashboard.producers.youthSub", { age: this.store.state().youthMaxAge }),
        "var(--v2-attente-bg)",
        "var(--v2-attente-fg)",
      ),
      tile(
        "handicapMen",
        t("dashboard.producers.handicapMen"),
        "accessible",
        handicapKnown ? show(stats?.handicapMen) : "—",
        handicapKnown ? share(stats?.handicapMen) : t("dashboard.producers.handicapUnknown"),
        "var(--v2-info-bg)",
        "var(--v2-info-fg)",
      ),
      tile(
        "handicapWomen",
        t("dashboard.producers.handicapWomen"),
        "accessible",
        handicapKnown ? show(stats?.handicapWomen) : "—",
        handicapKnown ? share(stats?.handicapWomen) : t("dashboard.producers.handicapUnknown"),
        "var(--v2-culture-bg)",
        "var(--v2-culture-fg)",
      ),
    ];
  });

  private slices(rows: { key: string; label: string; count: number; color: string }[]): { slices: Slice[]; gradient: string } {
    const total = rows.reduce((sum, row) => sum + row.count, 0);
    let acc = 0;
    const stops: string[] = [];
    const slices = rows
      .filter((row) => row.count > 0)
      .map((row) => {
        const from = (acc / total) * 100;
        acc += row.count;
        stops.push(`${row.color} ${from}% ${(acc / total) * 100}%`);
        return { ...row, pct: this.pct(row.count, total) };
      });
    return { slices, gradient: total ? `conic-gradient(${stops.join(", ")})` : "var(--v2-lin)" };
  }

  protected readonly pies = computed(() => {
    const t = this.t();
    const stats = this.stats();
    const age = this.slices(
      AGE_ORDER.map((key) => ({
        key,
        label: key === "unknown" ? t("dashboard.producers.unknown") : t("dashboard.producers.ageBand", { band: key }),
        count: stats?.byAgeBand[key] ?? 0,
        color: AGE_COLORS[key]!,
      })),
    );
    const sex = this.slices([
      { key: "F", label: t("dashboard.producers.women"), count: stats?.women ?? 0, color: "var(--v2-culture-fg)" },
      { key: "H", label: t("dashboard.producers.men"), count: stats?.men ?? 0, color: "var(--v2-info-fg)" },
      { key: "unknown", label: t("dashboard.producers.unknown"), count: stats?.sexUnknown ?? 0, color: "var(--v2-gris-trait)" },
    ]);
    return [
      { key: "age", title: t("dashboard.producers.byAge"), ...age },
      { key: "sex", title: t("dashboard.producers.bySex"), ...sex },
    ];
  });
}
