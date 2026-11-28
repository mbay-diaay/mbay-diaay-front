import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  signal,
  afterNextRender,
  HostListener,
  Injector,
  viewChild,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { Router } from "@angular/router";

import { can, inScope, type Session } from "@/lib/store";
import { maskPhone } from "@/lib/format";
import { NAV, navAllowed, type NavItem } from "@/lib/nav";
import { LocaleService } from "./locale.service";
import { StoreService } from "./store.service";
import { LucideAngularModule } from "lucide-angular";
import { IconComponent } from "./ui/icon.component";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const digits = (s: string) => s.replace(/\D/g, "");

/**
 * Palette de commandes : ⌘K / Ctrl+K,
 * pages autorisées + producteurs / organisations filtrés par recherche texte (ou téléphone si droit).
 */
@Component({
  selector: "app-command-palette",
  imports: [CommonModule, LucideAngularModule, IconComponent],
  styles: `
    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 120;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding: 12px;
      padding-top: 10vh;
      background: color-mix(in oklab, var(--v2-encre) 45%, transparent);
      animation: fade 0.18s ease both;
    }
    .sheet {
      display: flex;
      width: 100%;
      max-width: 640px;
      max-height: min(76vh, 600px);
      flex-direction: column;
      overflow: hidden;
      border-radius: 28px;
      background: var(--v2-blanc);
      color: var(--v2-encre);
      font-family: var(--v2-font);
      box-shadow: var(--v2-ombre-modale);
      animation: rise 0.24s cubic-bezier(0.32, 0.72, 0, 1) backwards;
    }
    /* En-tête clair : le champ de recherche seul, sans bandeau coloré. */
    .head {
      border-bottom: 1px solid var(--v2-separateur);
      padding: 16px 16px 14px;
    }
    .search {
      position: relative;
      display: flex;
      align-items: center;
    }
    .search .ico {
      pointer-events: none;
      position: absolute;
      left: 16px;
      display: grid;
      place-items: center;
      color: var(--v2-gris-texte);
    }
    .search input {
      width: 100%;
      height: 52px;
      border: 1.5px solid var(--v2-gris-trait);
      border-radius: 16px;
      background: var(--v2-blanc);
      padding: 0 70px 0 50px;
      font-size: 16px;
      font-weight: 600;
      color: var(--v2-encre);
    }
    .search input::placeholder {
      color: var(--v2-gris-texte);
      font-weight: 500;
    }
    .search input:hover {
      border-color: var(--v2-gris-texte);
    }
    .search input:focus-visible {
      outline: none;
      border: 2px solid var(--v2-foret);
      box-shadow: var(--v2-halo);
    }
    .search .esc {
      position: absolute;
      right: 14px;
      border-radius: 8px;
      border: 1px solid var(--v2-gris-trait);
      background: var(--v2-creme);
      padding: 2px 8px;
      font-family: var(--v2-font-mono);
      font-size: 11px;
      font-weight: 700;
      color: var(--v2-ardoise);
    }
    .body {
      flex: 1;
      overflow-y: auto;
      padding: 10px 12px 14px;
    }
    .hint {
      margin: 6px 8px 4px;
      font-size: 13px;
      font-weight: 500;
      color: var(--v2-gris-texte);
    }
    .group {
      margin: 14px 8px 6px;
      font-size: 11.5px;
      font-weight: 800;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      color: var(--v2-ardoise);
    }
    .group:first-child {
      margin-top: 6px;
    }
    .row {
      display: flex;
      width: 100%;
      align-items: center;
      gap: 12px;
      border: none;
      border-radius: 16px;
      background: transparent;
      padding: 9px 10px;
      text-align: left;
      font-size: 14.5px;
      font-weight: 600;
      color: var(--v2-encre);
      cursor: pointer;
      transition: background-color 0.12s ease;
    }
    .row:hover,
    .row:focus-visible {
      background: var(--v2-creme);
      outline: none;
    }
    .bubble {
      display: grid;
      flex: none;
      width: 36px;
      height: 36px;
      place-items: center;
      border-radius: 12px;
      background: var(--v2-sauge);
      color: var(--v2-foret);
    }
    .row .main {
      display: flex;
      min-width: 0;
      flex: 1;
      flex-direction: column;
    }
    .row .main strong {
      font-weight: 700;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .row .meta {
      font-size: 12.5px;
      font-weight: 500;
      color: var(--v2-gris-texte);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .empty {
      padding: 36px 16px;
      text-align: center;
      font-size: 14px;
      font-weight: 600;
      color: var(--v2-gris-texte);
    }
    .foot {
      display: flex;
      align-items: center;
      gap: 14px;
      border-top: 1px solid var(--v2-separateur);
      background: var(--v2-creme);
      padding: 10px 18px;
      font-size: 12px;
      font-weight: 600;
      color: var(--v2-gris-texte);
    }
    .foot kbd {
      margin-right: 5px;
      border-radius: 6px;
      border: 1px solid var(--v2-gris-trait);
      background: var(--v2-blanc);
      padding: 1px 6px;
      font-family: var(--v2-font-mono);
      font-size: 11px;
      color: var(--v2-ardoise);
    }
    @keyframes fade {
      from {
        opacity: 0;
      }
    }
    @keyframes rise {
      from {
        opacity: 0;
        transform: translateY(14px) scale(0.98);
      }
    }
  `,
  template: `
    @if (open()) {
      <div class="backdrop" (click)="closeFromBackdrop($event)" role="presentation">
        <div
          class="sheet"
          (click)="$event.stopPropagation()"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cmd-palette-title"
        >
          <h2 id="cmd-palette-title" class="sr-only">{{ t()("shell.palette.title") }}</h2>
          <div class="head">
            <div class="search">
              <span class="ico" aria-hidden="true"><ui-icon name="search" [size]="22" /></span>
              <input
                #qInput
                type="search"
                [attr.aria-label]="t()('shell.palette.placeholder')"
                [placeholder]="t()('shell.palette.placeholder')"
                [value]="q()"
                (input)="onQuery($any($event.target).value)"
              />
              <span class="esc" aria-hidden="true">Échap</span>
            </div>
          </div>
          <div class="body">
            @if (!q().trim() && pageItems().length > 0) {
              <p class="hint">{{ t()("shell.palette.hint") }}</p>
            }
            @if (hasAnyResults()) {
              @if (pageItems().length > 0) {
                <div class="group">{{ t()("shell.palette.pages") }}</div>
                @for (item of pageItems(); track item.to) {
                  <button type="button" class="row" (click)="goPage(item)">
                    <span class="bubble"><lucide-angular [img]="item.icon" class="size-[18px]" /></span>
                    <span class="main"><strong>{{ t()(item.labelKey) }}</strong></span>
                  </button>
                }
              }
              @if (producerHits().length > 0) {
                <div class="group">{{ t()("shell.palette.producers") }}</div>
                @for (producer of producerHits(); track producer.id) {
                  <button type="button" class="row" (click)="goProducer(producer.id)">
                    <span class="bubble"><ui-icon name="person" [size]="20" /></span>
                    <span class="main">
                      <strong>{{ producer.firstName }} {{ producer.lastName }}</strong>
                      <span class="meta">
                        {{ producer.code }} · {{ producer.village }}
                        @if (showPhoneHit()(producer)) {
                          <span> · {{ store.phone(producer.phone) }}</span>
                        }
                      </span>
                    </span>
                  </button>
                }
              }
              @if (orgHits().length > 0) {
                <div class="group">{{ t()("shell.palette.orgs") }}</div>
                @for (org of orgHits(); track org.id) {
                  <button type="button" class="row" (click)="goOrg(org.id)">
                    <span class="bubble"><ui-icon name="apartment" [size]="20" /></span>
                    <span class="main">
                      <strong>{{ org.name }}</strong>
                      <span class="meta">{{ org.village }}</span>
                    </span>
                  </button>
                }
              }
            } @else if (q().trim()) {
              <p class="empty">{{ t()("shell.palette.empty", { q: q() }) }}</p>
            }
          </div>
          <div class="foot" aria-hidden="true">
            <span><kbd>⌘</kbd><kbd>K</kbd>ouvrir ou fermer</span>
            <span><kbd>Échap</kbd>fermer</span>
          </div>
        </div>
      </div>
    }
  `,
})
export class CommandPaletteComponent {
  private readonly router = inject(Router);
  protected readonly store = inject(StoreService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  protected readonly localeService = inject(LocaleService);

  private readonly qInput = viewChild<ElementRef<HTMLInputElement>>("qInput");

  protected readonly t = this.localeService.t;
  protected readonly maskPhone = maskPhone;

  /** Ouverture depuis le shell (bouton loupe). */
  readonly open = signal(false);
  protected readonly q = signal("");
  protected readonly session = computed<Session | null>(() => this.store.state().session);

  protected readonly needle = computed(() => norm(this.q().trim()));

  protected readonly byPhone = computed(() => {
    const session = this.session();
    const q = this.q();
    if (!session || !can(session, "producer.edit")) return "";
    const d = digits(q);
    return d.length >= 4 ? d : "";
  });

  protected readonly pageItems = computed((): NavItem[] => {
    const session = this.session();
    const n = this.needle();
    if (!session) return [];
    const match = (s: string) => !n || norm(s).includes(n);
    const t = this.t();
    return NAV.flatMap((g) => g.items).filter(
      (i) => !i.soon && navAllowed(session, i) && match(t(i.labelKey)),
    );
  });

  protected readonly producerHits = computed(() => {
    const session = this.session();
    const n = this.needle();
    const phoneQ = this.byPhone();
    if (!session || !n) return [];
    const match = (s: string) => !n || norm(s).includes(n);
    const producers = this.store.state().producers.filter((p) => !p.mergedInto);
    const mine = inScope(producers, session);
    return mine
      .filter(
        (p) =>
          match(`${p.firstName} ${p.lastName} ${p.code} ${p.village}`) ||
          (!!phoneQ && digits(p.phone).includes(phoneQ)),
      )
      .slice(0, 8);
  });

  protected readonly showPhoneHit = computed(() => {
    const phoneQ = this.byPhone();
    return (p: { phone: string }) => !!phoneQ && digits(p.phone).includes(phoneQ);
  });

  protected readonly orgHits = computed(() => {
    const session = this.session();
    const n = this.needle();
    if (!session || !n) return [];
    const match = (s: string) => !n || norm(s).includes(n);
    const orgs = inScope(this.store.state().orgs, session);
    return orgs.filter((o) => match(`${o.name} ${o.village}`)).slice(0, 6);
  });

  protected readonly hasAnyResults = computed(
    () =>
      this.pageItems().length > 0 ||
      this.producerHits().length > 0 ||
      this.orgHits().length > 0,
  );

  constructor() {
    afterNextRender(() => {
      const onKey = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
          e.preventDefault();
          this.toggle();
        }
      };
      document.addEventListener("keydown", onKey);
      this.destroyRef.onDestroy(() => document.removeEventListener("keydown", onKey));
    });
  }

  /** Ouvre la palette (bouton en-tête). */
  show(): void {
    this.open.set(true);
    this.focusInputSoon();
  }

  protected toggle(): void {
    const next = !this.open();
    this.open.set(next);
    if (next) this.focusInputSoon();
    else {
      this.q.set("");
    }
  }

  protected onQuery(v: string): void {
    this.q.set(v);
  }

  protected closeFromBackdrop(e: MouseEvent): void {
    if (e.target === e.currentTarget) this.close();
  }

  protected close(): void {
    this.open.set(false);
    this.q.set("");
  }

  /** Appelé depuis un clic ou un raccourci : hors contexte d'injection, on passe l'injecteur (NG0203). */
  private focusInputSoon(): void {
    afterNextRender(
      () => {
        const el = this.qInput()?.nativeElement;
        el?.focus();
        el?.select();
      },
      { injector: this.injector },
    );
  }

  @HostListener("document:keydown.escape")
  protected onEscape(): void {
    if (this.open()) this.close();
  }

  protected goPage(i: NavItem): void {
    this.close();
    void this.router.navigateByUrl(i.to);
  }

  protected goProducer(id: string): void {
    this.close();
    void this.router.navigate(["/dashboard/producteurs", id]);
  }

  protected goOrg(id: string): void {
    this.close();
    void this.router.navigate(["/dashboard/organisations", id]);
  }
}
