import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from "@angular/core";

import { LocaleService } from "../locale.service";
import { IconComponent, type IconName } from "./icon.component";
import type { SelectOption } from "./select.component";

let nextId = 0;

/**
 * Liste déroulante à choix multiples (charte V2), sœur de `ui-select`.
 *
 * `<ui-multi-select [options]="opts" [values]="ids()" (valuesChange)="ids.set($event)" label="Coopératives" />`
 *
 * - Le déclencheur résume le choix : pastilles (jusqu'à `maxChips`) puis « + N », ou le texte d'invite.
 * - La liste reste ouverte pendant le choix : case à cocher par option, recherche intégrée au-delà de `searchFrom`
 *   options, ligne « Tout sélectionner / Tout désélectionner » (sur les options visibles).
 * - Clavier : ↑/↓ pour parcourir, Espace ou Entrée pour cocher, Échap pour fermer, Début/Fin.
 * - Fermeture au clic extérieur. Couleurs : tokens `--v2-*`.
 */
@Component({
  selector: "ui-multi-select",
  imports: [IconComponent],
  host: {
    class: "relative block",
    "(document:click)": "onDocumentClick($event)",
    "(window:resize)": "close(false)",
  },
  styles: `
    .trigger {
      display: flex;
      min-height: 52px;
      width: 100%;
      align-items: center;
      gap: 10px;
      border-radius: 16px;
      border: 1.5px solid var(--v2-gris-trait);
      background: var(--v2-blanc);
      padding: 6px 12px 6px 16px;
      text-align: left;
      font-size: 15px;
      font-weight: 600;
      color: var(--v2-encre);
      cursor: pointer;
      transition:
        border-color 0.15s ease,
        box-shadow 0.15s ease;
    }
    .trigger:hover {
      border-color: var(--v2-gris-texte);
    }
    .trigger:focus-visible,
    .trigger.open {
      outline: none;
      border: 2px solid var(--v2-foret);
      padding-left: 15.5px;
      box-shadow: var(--v2-halo);
    }
    .chevron {
      flex: none;
      color: var(--v2-gris-texte);
      transition: transform 0.2s ease;
    }
    .open .chevron {
      transform: rotate(180deg);
    }
    .chips {
      display: flex;
      min-width: 0;
      flex: 1;
      flex-wrap: wrap;
      gap: 6px;
    }
    .chip {
      display: inline-flex;
      max-width: 100%;
      align-items: center;
      gap: 4px;
      border-radius: 999px;
      padding: 4px 6px 4px 12px;
      font-size: 13px;
      font-weight: 700;
      background: var(--v2-sauge);
      color: var(--v2-foret);
    }
    .chip.more {
      padding: 4px 12px;
      background: var(--v2-foret);
      color: var(--v2-blanc);
    }
    .chip-x {
      display: grid;
      place-items: center;
      width: 20px;
      height: 20px;
      border: 0;
      border-radius: 99px;
      cursor: pointer;
      background: transparent;
      color: inherit;
    }
    .chip-x:hover {
      background: color-mix(in oklab, var(--v2-foret) 16%, transparent);
    }
    .panel {
      z-index: 70;
      min-width: 260px;
      border-radius: 18px;
      border: 1px solid var(--v2-bord-carte);
      background: var(--v2-blanc);
      padding: 6px;
      box-shadow: var(--v2-ombre-modale);
      animation: drop 0.16s ease both;
      position: fixed;
      display: flex;
      flex-direction: column;
    }
    @keyframes drop {
      from {
        opacity: 0;
        transform: translateY(-4px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    .filter {
      display: flex;
      height: 42px;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
      border-radius: 12px;
      background: var(--v2-creme);
      padding: 0 12px;
      color: var(--v2-gris-texte);
    }
    .filter input {
      min-width: 0;
      flex: 1;
      background: transparent;
      font-size: 14px;
      font-weight: 600;
      color: var(--v2-encre);
      outline: none;
    }
    .bulk {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 6px 10px 8px;
      font-size: 12.5px;
      font-weight: 700;
      color: var(--v2-gris-texte);
    }
    .bulk button {
      border: 0;
      background: none;
      cursor: pointer;
      font-size: 13px;
      font-weight: 800;
      color: var(--v2-foret);
      text-decoration: underline;
      text-underline-offset: 3px;
    }
    .list {
      min-height: 0;
      flex: 1;
      max-height: 280px;
      overflow-y: auto;
      overscroll-behavior: contain;
    }
    .option {
      display: flex;
      min-height: 44px;
      align-items: center;
      gap: 10px;
      border-radius: 12px;
      padding: 8px 10px;
      font-size: 14px;
      font-weight: 600;
      color: var(--v2-ardoise);
      cursor: pointer;
    }
    .option.active {
      background: var(--v2-sauge);
      color: var(--v2-encre);
    }
    .option.selected {
      color: var(--v2-foret);
      font-weight: 800;
    }
    .box {
      display: grid;
      flex: none;
      place-items: center;
      width: 20px;
      height: 20px;
      border-radius: 6px;
      border: 2px solid var(--v2-gris-trait);
      background: var(--v2-blanc);
      color: var(--v2-blanc);
    }
    .selected .box {
      border-color: var(--v2-foret);
      background: var(--v2-foret);
    }
    .hint {
      border-radius: 999px;
      padding: 1px 8px;
      font-size: 12px;
      font-weight: 700;
      background: var(--v2-creme);
      color: var(--v2-gris-texte);
    }
    .empty {
      padding: 12px;
      font-size: 13px;
      font-weight: 500;
      color: var(--v2-gris-texte);
    }
    @media (prefers-reduced-motion: reduce) {
      .panel {
        animation: none;
      }
      .chevron {
        transition: none;
      }
    }
  `,
  template: `
    <div [class.open]="open()">
      <button
        #trigger
        type="button"
        class="trigger"
        [class.open]="open()"
        [id]="ids.trigger"
        aria-haspopup="listbox"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="ids.list"
        [attr.aria-label]="label() ? label() + ' : ' + summary() : null"
        (click)="toggle()"
        (keydown)="onTriggerKey($event)"
      >
        @if (leadingIcon()) {
          <ui-icon [name]="leadingIcon()!" [size]="20" style="color: var(--v2-gris-texte)" />
        }
        @if (selected().length) {
          <span class="chips">
            @for (option of shownChips(); track option.value) {
              <span class="chip">
                <span class="truncate">{{ option.label }}</span>
                <span
                  class="chip-x"
                  role="button"
                  tabindex="-1"
                  [attr.aria-label]="t()('ui.multiselect.remove', { name: option.label })"
                  (click)="remove(option, $event)"
                >
                  <ui-icon name="close" [size]="14" />
                </span>
              </span>
            }
            @if (hiddenCount() > 0) {
              <span class="chip more">+ {{ hiddenCount() }}</span>
            }
          </span>
        } @else {
          <span class="min-w-0 flex-1 truncate" style="color: var(--v2-gris-texte)">
            {{ placeholder() || t()("ui.select.placeholder") }}
          </span>
        }
        <ui-icon name="keyboard_arrow_down" [size]="22" class="chevron" />
      </button>

      @if (open()) {
        <div
          #panel
          class="panel"
          [style.left.px]="place().left"
          [style.width.px]="place().width"
          [style.top.px]="place().top"
          [style.bottom.px]="place().bottom"
          [style.max-height.px]="place().maxHeight"
        >
          @if (searchable()) {
            <label class="filter">
              <ui-icon name="search" [size]="18" />
              <input
                #filterInput
                type="text"
                [placeholder]="t()('ui.select.search')"
                [attr.aria-label]="t()('ui.select.search')"
                [attr.aria-controls]="ids.list"
                [value]="query()"
                (input)="onQuery($any($event.target).value)"
                (keydown)="onListKey($event)"
              />
            </label>
          }
          @if (visible().length > 1) {
            <div class="bulk">
              <span>{{ t()("ui.multiselect.count", { selected: selected().length, total: options().length }) }}</span>
              <button type="button" (click)="toggleAllVisible()">
                {{ allVisibleSelected() ? t()("ui.multiselect.none") : t()("ui.multiselect.all") }}
              </button>
            </div>
          }
          <ul
            class="list"
            role="listbox"
            aria-multiselectable="true"
            [id]="ids.list"
            [attr.aria-labelledby]="ids.trigger"
            [attr.aria-activedescendant]="activeId()"
            tabindex="-1"
            (keydown)="onListKey($event)"
          >
            @for (option of visible(); track option.value; let optionIndex = $index) {
              <li
                role="option"
                class="option"
                [id]="ids.option + optionIndex"
                [class.active]="optionIndex === active()"
                [class.selected]="isSelected(option.value)"
                [attr.aria-selected]="isSelected(option.value)"
                (mouseenter)="active.set(optionIndex)"
                (click)="toggleOption(option)"
              >
                <span class="box" aria-hidden="true">
                  @if (isSelected(option.value)) {
                    <ui-icon name="check" [size]="14" />
                  }
                </span>
                @if (option.icon) {
                  <ui-icon [name]="option.icon" [size]="19" />
                }
                <span class="min-w-0 flex-1 truncate">{{ option.label }}</span>
                @if (option.hint) {
                  <span class="hint">{{ option.hint }}</span>
                }
              </li>
            } @empty {
              <li class="empty">{{ t()("ui.select.empty") }}</li>
            }
          </ul>
        </div>
      }
    </div>
  `,
})
export class MultiSelectComponent {
  readonly options = input.required<readonly SelectOption[]>();
  readonly values = input<readonly string[]>([]);
  readonly label = input<string>("");
  readonly placeholder = input<string>("");
  readonly leadingIcon = input<IconName | null>(null);
  /** Nombre de pastilles montrées dans le déclencheur avant « + N ». */
  readonly maxChips = input(3);
  /** Nombre d'options à partir duquel un champ de recherche apparaît. */
  readonly searchFrom = input(8);
  readonly valuesChange = output<string[]>();

  protected readonly t = inject(LocaleService).t;
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);
  private readonly triggerRef = viewChild<ElementRef<HTMLButtonElement>>("trigger");
  private readonly filterRef = viewChild<ElementRef<HTMLInputElement>>("filterInput");
  private readonly panelRef = viewChild<ElementRef<HTMLElement>>("panel");

  private readonly uid = nextId++;
  protected readonly ids = { trigger: `msel-${this.uid}`, list: `msel-${this.uid}-list`, option: `msel-${this.uid}-opt-` };

  protected readonly open = signal(false);
  protected readonly place = signal<{ left: number; width: number; top: number | null; bottom: number | null; maxHeight: number }>({
    left: 0,
    width: 260,
    top: 0,
    bottom: null,
    maxHeight: 360,
  });
  protected readonly query = signal("");
  protected readonly active = signal(0);

  protected readonly selected = computed(() => {
    const chosen = new Set(this.values());
    return this.options().filter((option) => chosen.has(option.value));
  });
  protected readonly shownChips = computed(() => this.selected().slice(0, this.maxChips()));
  protected readonly hiddenCount = computed(() => Math.max(0, this.selected().length - this.maxChips()));
  protected readonly summary = computed(() =>
    this.selected().length ? this.selected().map((option) => option.label).join(", ") : this.placeholder() || this.t()("ui.select.placeholder"),
  );
  protected readonly searchable = computed(() => this.options().length >= this.searchFrom());
  protected readonly visible = computed(() => {
    const norm = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const needle = norm(this.query().trim());
    return needle ? this.options().filter((option) => norm(option.label).includes(needle)) : this.options();
  });
  protected readonly allVisibleSelected = computed(
    () => this.visible().length > 0 && this.visible().every((option) => this.isSelected(option.value)),
  );
  protected readonly activeId = computed(() => (this.open() && this.visible().length ? this.ids.option + this.active() : null));

  constructor() {
    afterNextRender(() => {
      const onScroll = (event: Event) => this.onScroll(event);
      window.addEventListener("scroll", onScroll, true);
      this.destroyRef.onDestroy(() => window.removeEventListener("scroll", onScroll, true));
    });
    effect(() => {
      if (!this.open()) return;
      untracked(() => {
        this.active.set(0);
        queueMicrotask(() => this.filterRef()?.nativeElement.focus({ preventScroll: true }));
      });
    });
  }

  protected isSelected(value: string): boolean {
    return this.values().includes(value);
  }

  protected toggle(): void {
    if (!this.open()) this.measure();
    this.open.update((current) => !current);
    if (!this.open()) this.query.set("");
  }

  protected toggleOption(option: SelectOption): void {
    const next = this.isSelected(option.value)
      ? this.values().filter((value) => value !== option.value)
      : [...this.values(), option.value];
    this.valuesChange.emit(this.options().map((item) => item.value).filter((value) => next.includes(value)));
  }

  protected remove(option: SelectOption, event: Event): void {
    event.stopPropagation();
    this.valuesChange.emit(this.values().filter((value) => value !== option.value));
  }

  /** Coche (ou décoche) toutes les options visibles, la recherche en cours comprise. */
  protected toggleAllVisible(): void {
    const visibleValues = this.visible().map((option) => option.value);
    const next = this.allVisibleSelected()
      ? this.values().filter((value) => !visibleValues.includes(value))
      : [...new Set([...this.values(), ...visibleValues])];
    this.valuesChange.emit(this.options().map((item) => item.value).filter((value) => next.includes(value)));
  }

  private measure(): void {
    const trigger = this.triggerRef()?.nativeElement;
    if (!trigger || typeof window === "undefined") return;
    const rect = trigger.getBoundingClientRect();
    const gap = 8;
    const margin = 12;
    const wanted = 380;
    const below = window.innerHeight - rect.bottom - gap - margin;
    const above = rect.top - gap - margin;
    const up = below < Math.min(wanted, 260) && above > below;
    const width = Math.max(rect.width, 260);
    const left = Math.min(Math.max(margin, rect.left), window.innerWidth - width - margin);
    this.place.set({
      left,
      width,
      top: up ? null : rect.bottom + gap,
      bottom: up ? window.innerHeight - rect.top + gap : null,
      maxHeight: Math.max(180, Math.min(wanted, up ? above : below)),
    });
    requestAnimationFrame(() => this.correct());
  }

  /** Compense un ancêtre transformé (modale animée) qui sert de repère au positionnement fixe. */
  private correct(): void {
    const panel = this.panelRef()?.nativeElement;
    if (!panel) return;
    const placed = this.place();
    const rect = panel.getBoundingClientRect();
    const deltaX = rect.left - placed.left;
    const deltaY = placed.top !== null ? rect.top - placed.top : rect.bottom - (window.innerHeight - (placed.bottom ?? 0));
    if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;
    this.place.set({
      ...placed,
      left: placed.left - deltaX,
      top: placed.top !== null ? placed.top - deltaY : null,
      bottom: placed.bottom !== null ? placed.bottom + deltaY : null,
    });
  }

  protected onScroll(event: Event): void {
    if (!this.open()) return;
    const panel = this.panelRef()?.nativeElement;
    if (panel && event.target instanceof Node && panel.contains(event.target)) return;
    this.close(false);
  }

  protected onQuery(value: string): void {
    this.query.set(value);
    this.active.set(0);
  }

  protected onTriggerKey(event: KeyboardEvent): void {
    if (!this.open() && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      this.measure();
      this.open.set(true);
      return;
    }
    if (this.open()) this.onListKey(event);
  }

  protected onListKey(event: KeyboardEvent): void {
    const count = this.visible().length;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (count) this.active.update((index) => (index + 1) % count);
        break;
      case "ArrowUp":
        event.preventDefault();
        if (count) this.active.update((index) => (index - 1 + count) % count);
        break;
      case "Home":
        event.preventDefault();
        this.active.set(0);
        break;
      case "End":
        event.preventDefault();
        this.active.set(Math.max(0, count - 1));
        break;
      case "Enter":
      case " ": {
        if (event.key === " " && event.target instanceof HTMLInputElement) break;
        event.preventDefault();
        const option = this.visible()[this.active()];
        if (option) this.toggleOption(option);
        break;
      }
      case "Escape":
        event.preventDefault();
        this.close(true);
        break;
      case "Tab":
        this.close(false);
        break;
    }
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.close(false);
  }

  protected close(refocus: boolean): void {
    this.open.set(false);
    this.query.set("");
    if (refocus) this.triggerRef()?.nativeElement.focus();
  }
}
