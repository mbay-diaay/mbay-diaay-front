import {
  Component,
  ElementRef,
  HostListener,
  viewChild,
  inject,
  input,
  OnDestroy,
  output,
  signal,
} from "@angular/core";

import { isApiMode } from "@/lib/api/config";
import { fetchProducersPage } from "@/lib/api/producers";
import { StoreService } from "../store.service";
import { IconComponent } from "./icon.component";

export type ProducerSelection = {
  /** Identifiant texte (ex. `CON-00002`) ou identifiant interne si le code est absent. */
  id: string;
  code: string;
  name: string;
  scoopId: string;
};

let nextProducerSelectId = 0;

/**
 * Champ de sélection de producteur / membre avec recherche côté serveur (`/producers?q=`, pages de 20, délai 250 ms).
 */
@Component({
  selector: "ui-producer-select",
  standalone: true,
  imports: [IconComponent],
  styles: [
    `
      :host {
        display: block;
      }
      .label {
        display: block;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--v2-ardoise);
      }
      .ps-box {
        position: relative;
        margin-top: 8px;
        display: flex;
        align-items: center;
        height: 52px;
        border-radius: 16px;
        border: 1.5px solid var(--v2-gris-trait);
        background: var(--v2-blanc);
        color: var(--v2-encre);
        transition:
          border-color 0.15s ease,
          box-shadow 0.15s ease;
      }
      .ps-box:hover {
        border-color: var(--v2-gris-texte);
      }
      .ps-box:focus-within {
        border: 2px solid var(--v2-foret);
        box-shadow: var(--v2-halo);
      }
      .ps-icon {
        display: grid;
        width: 48px;
        flex: none;
        place-items: center;
        color: var(--v2-gris-texte);
        pointer-events: none;
      }
      .ps-input {
        flex: 1;
        min-width: 0;
        height: 100%;
        border: none;
        outline: none;
        background: transparent;
        color: var(--v2-encre);
        font-size: 15px;
        font-weight: 600;
        padding-right: 8px;
      }
      .ps-input::placeholder {
        color: var(--v2-gris-texte);
        font-weight: 500;
        opacity: 0.8;
      }
      .ps-clear {
        display: grid;
        width: 40px;
        height: 100%;
        flex: none;
        place-items: center;
        border: none;
        background: transparent;
        color: var(--v2-gris-texte);
        cursor: pointer;
      }
      .ps-clear:hover {
        color: var(--v2-foret);
      }
      /* Liste flottante au-dessus du reste (position fixe : jamais coupée par le défilement de la fenêtre modale). */
      .ps-menu {
        position: fixed;
        z-index: 1000;
        max-height: 232px;
        overflow-y: auto;
        background: var(--v2-blanc);
        border: 1.5px solid var(--v2-gris-trait);
        border-radius: 16px;
        padding: 6px;
        box-shadow: 0 12px 32px color-mix(in oklab, var(--v2-encre) 18%, transparent);
      }
      .ps-option {
        width: 100%;
        text-align: left;
        border: none;
        background: transparent;
        color: var(--v2-encre);
        padding: 10px 12px;
        border-radius: 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        font-size: 14px;
        font-weight: 600;
      }
      .ps-option:hover,
      .ps-option:focus-visible {
        background: var(--v2-sauge);
        outline: none;
      }
      .ps-meta {
        font-size: 12px;
        font-weight: 700;
        color: var(--v2-gris-texte);
        white-space: nowrap;
      }
      .ps-empty {
        padding: 12px;
        font-size: 14px;
        font-weight: 500;
        color: var(--v2-gris-texte);
      }
    `,
  ],
  template: `
    <div class="ps-wrap">
      @if (label()) {
        <label class="label" [attr.for]="inputId">{{ label() }}</label>
      }
      <div class="ps-box" #box>
        <span class="ps-icon" aria-hidden="true"><ui-icon name="person" [size]="20" /></span>
        <input
          type="text"
          class="ps-input"
          [id]="inputId"
          autocomplete="off"
          [placeholder]="placeholder()"
          [value]="displayText()"
          (focus)="onFocus()"
          (input)="onQueryInput($any($event.target).value)"
        />
        @if (selected()) {
          <button type="button" class="ps-clear" title="Effacer" aria-label="Effacer la sélection" (click)="clearSelection()">
            <ui-icon name="close" [size]="18" />
          </button>
        }
      </div>

      @if (open()) {
        <div class="ps-menu" role="listbox" [style.top.px]="menuTop()" [style.bottom.px]="menuBottom()" [style.left.px]="menuLeft()" [style.width.px]="menuWidth()">
          @if (loading()) {
            <div class="ps-empty">Recherche…</div>
          } @else if (options().length === 0) {
            <div class="ps-empty">Aucun producteur trouvé</div>
          } @else {
            @for (option of options(); track option.id + option.scoopId) {
              <button type="button" class="ps-option" (click)="choose(option)">
                <span>{{ option.name }}</span>
                <span class="ps-meta">{{ option.code || option.id }}</span>
              </button>
            }
          }
        </div>
      }
    </div>
  `,
})
export class ProducerSelectComponent implements OnDestroy {
  protected readonly inputId = `producer-select-${nextProducerSelectId++}`;
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly store = inject(StoreService);

  readonly label = input("Producteur");
  readonly placeholder = input("Rechercher par nom ou code (ex. CON-00002)…");
  readonly scoopId = input<string | undefined>(undefined);
  readonly selected = input<ProducerSelection | null>(null);

  readonly selectedChange = output<ProducerSelection | null>();

  private readonly box = viewChild<ElementRef<HTMLElement>>("box");
  protected readonly menuTop = signal<number | null>(null);
  protected readonly menuBottom = signal<number | null>(null);
  protected readonly menuLeft = signal(0);
  protected readonly menuWidth = signal(0);
  protected readonly open = signal(false);
  protected readonly loading = signal(false);
  protected readonly searchText = signal("");
  protected readonly options = signal<ProducerSelection[]>([]);

  /** Le défilement de la fenêtre modale ne remonte pas : on l'écoute en phase de capture. */
  private readonly onScrollCapture = () => this.placeMenu();

  constructor() {
    window.addEventListener("scroll", this.onScrollCapture, true);
  }

  ngOnDestroy() {
    window.removeEventListener("scroll", this.onScrollCapture, true);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
  }

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private requestCounter = 0;

  protected displayText(): string {
    const current = this.selected();
    if (!this.open() && current) {
      return current.code ? `${current.name} (${current.code})` : current.name;
    }
    return this.searchText();
  }

  protected onFocus() {
    this.open.set(true);
    this.placeMenu();
    if (this.options().length === 0) {
      void this.fetchOptions(this.searchText());
    }
  }

  protected onQueryInput(value: string) {
    this.searchText.set(value);
    this.open.set(true);
    this.placeMenu();
    if (this.selected()) {
      this.selectedChange.emit(null);
    }
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      void this.fetchOptions(value);
    }, 250);
  }

  protected choose(option: ProducerSelection) {
    this.selectedChange.emit(option);
    this.searchText.set("");
    this.open.set(false);
  }

  protected clearSelection() {
    this.selectedChange.emit(null);
    this.searchText.set("");
    this.open.set(true);
    void this.fetchOptions("");
  }

  private async fetchOptions(query: string) {
    const trimmed = query.trim();
    const requestId = ++this.requestCounter;
    if (!isApiMode()) {
      const lower = trimmed.toLowerCase();
      const scoop = this.scoopId();
      const items = this.store
        .state()
        .producers.filter((producer) => {
          if (scoop && producer.scoopId !== scoop) return false;
          if (!lower) return true;
          const fullName = `${producer.firstName} ${producer.lastName}`.toLowerCase();
          return (
            fullName.includes(lower) ||
            (producer.code ?? "").toLowerCase().includes(lower) ||
            producer.id.toLowerCase().includes(lower)
          );
        })
        .slice(0, 20)
        .map((producer) => ({
          id: producer.code || producer.id,
          code: producer.code || producer.id,
          name: `${producer.firstName} ${producer.lastName}`.trim(),
          scoopId: producer.scoopId,
        }));
      this.options.set(items);
      return;
    }

    this.loading.set(true);
    try {
      const res = await fetchProducersPage({
        page: 1,
        limit: 20,
        q: trimmed || undefined,
        scoopId: this.scoopId() || undefined,
      });
      if (requestId !== this.requestCounter) return;
      this.options.set(
        res.items.map((producer) => ({
          id: producer.code || producer.id,
          code: producer.code || producer.id,
          name: `${producer.firstName} ${producer.lastName}`.trim(),
          scoopId: producer.scoopId,
        })),
      );
    } catch {
      if (requestId === this.requestCounter) {
        this.options.set([]);
      }
    } finally {
      if (requestId === this.requestCounter) {
        this.loading.set(false);
      }
    }
  }

  /** Place la liste sous le champ, ou au-dessus s'il n'y a pas assez de place en bas de l'écran. */
  @HostListener("window:resize")
  protected placeMenu() {
    const element = this.box()?.nativeElement;
    if (!element || !this.open()) return;
    const rect = element.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom;
    this.menuLeft.set(rect.left);
    this.menuWidth.set(rect.width);
    if (below < 260 && rect.top > below) {
      this.menuTop.set(null);
      this.menuBottom.set(window.innerHeight - rect.top + 8);
    } else {
      this.menuBottom.set(null);
      this.menuTop.set(rect.bottom + 8);
    }
  }

  @HostListener("document:click", ["$event"])
  onDocumentClick(event: MouseEvent) {
    if (!this.open()) return;
    const target = event.target as Node | null;
    if (target && !this.host.nativeElement.contains(target)) {
      this.open.set(false);
    }
  }
}
