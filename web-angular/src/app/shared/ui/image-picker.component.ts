import { Component, computed, inject, input, output, signal } from "@angular/core";

import { imageProblem, prepareImage, type PreparedImage } from "../../../lib/image";
import { LocaleService } from "../locale.service";
import { AvatarComponent } from "./avatar.component";
import { IconComponent } from "./icon.component";

let nextId = 0;

/**
 * Champ « logo » ou « photo » d'un formulaire d'enregistrement : aperçu, glisser-déposer ou clic, retrait.
 * L'image est contrôlée (JPEG, PNG, WebP) puis réduite dans le navigateur ; le parent reçoit le fichier à envoyer
 * et l'aperçu, et garde la valeur dans son formulaire.
 *
 * `<ui-image-picker shape="square" [label]="…" [value]="logo()" [name]="nom()" (picked)="logo.set($event)" (cleared)="logo.set(null)" />`
 */
@Component({
  selector: "ui-image-picker",
  imports: [AvatarComponent, IconComponent],
  host: { class: "block" },
  styles: `
    .zone {
      display: flex;
      align-items: center;
      gap: 16px;
      border-radius: 20px;
      border: 1.5px dashed var(--v2-gris-trait);
      background: var(--v2-creme);
      padding: 14px;
      transition:
        border-color 0.15s ease,
        background-color 0.15s ease;
    }
    .zone.filled {
      border-style: solid;
      border-color: color-mix(in oklab, var(--v2-vert-pousse) 45%, transparent);
      background: var(--v2-blanc);
    }
    .zone.over {
      border-color: var(--v2-foret);
      background: var(--v2-sauge);
    }
    .zone:focus-within {
      outline: 2px solid var(--v2-foret);
      outline-offset: 2px;
    }
    .title {
      font-size: 14px;
      font-weight: 800;
      color: var(--v2-foret);
    }
    .opt {
      margin-left: 6px;
      font-size: 12px;
      font-weight: 600;
      color: var(--v2-gris-texte);
    }
    .hint {
      margin-top: 2px;
      font-size: 12.5px;
      line-height: 1.4;
      color: var(--v2-gris-texte);
    }
    .actions {
      margin-top: 10px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 36px;
      cursor: pointer;
      border-radius: 999px;
      border: 1.5px solid var(--v2-foret);
      background: var(--v2-foret);
      padding: 0 14px;
      font-size: 13px;
      font-weight: 800;
      color: var(--v2-citron);
    }
    .pill.ghost {
      background: transparent;
      color: var(--v2-foret);
    }
    .pill:hover {
      filter: brightness(1.08);
    }
    .busy {
      opacity: 0.6;
      pointer-events: none;
    }
    .err {
      margin-top: 8px;
      font-size: 12.5px;
      font-weight: 700;
      color: var(--v2-erreur-fg);
    }
  `,
  template: `
    <div
      class="zone"
      [class.filled]="!!value()"
      [class.over]="over()"
      [class.busy]="busy()"
      (dragover)="$event.preventDefault(); over.set(true)"
      (dragleave)="over.set(false)"
      (drop)="onDrop($event)"
    >
      <ui-avatar [src]="value()" [name]="name()" [shape]="shape()" [size]="84" />
      <div class="min-w-0 flex-1">
        <p class="title">
          {{ label() || (shape() === "square" ? t()("ui.image.logo") : t()("ui.image.photo")) }}
          @if (optional()) {
            <span class="opt">· {{ t()("ui.image.optional") }}</span>
          }
        </p>
        <p class="hint">{{ t()("ui.image.hint") }}</p>
        <div class="actions">
          <label class="pill" [attr.for]="uid">
            <ui-icon [name]="value() ? 'edit' : 'person'" [size]="16" />
            {{ value() ? t()("ui.image.change") : t()("ui.image.add") }}
          </label>
          @if (value()) {
            <button type="button" class="pill ghost" (click)="clear()">
              <ui-icon name="close" [size]="16" />{{ t()("ui.image.remove") }}
            </button>
          }
        </div>
        <input
          [id]="uid"
          type="file"
          class="sr-only"
          accept="image/jpeg,image/png,image/webp"
          [attr.aria-label]="label() || t()('ui.image.add')"
          (change)="onPick($event)"
        />
      </div>
    </div>
    @if (error()) {
      <p class="err" role="alert">{{ error() }}</p>
    }
  `,
})
export class ImagePickerComponent {
  readonly label = input("");
  /** Aperçu courant (adresse `data:` locale ou lien de l'API). */
  readonly value = input<string | null | undefined>(null);
  /** Nom de la fiche : donne les initiales affichées tant qu'il n'y a pas d'image (personne). */
  readonly name = input("");
  readonly shape = input<"round" | "square">("round");
  readonly optional = input(true);

  readonly picked = output<PreparedImage>();
  readonly cleared = output<void>();

  protected readonly t = inject(LocaleService).t;
  protected readonly uid = `img-${nextId++}`;
  protected readonly over = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal("");
  protected readonly hasValue = computed(() => !!this.value());

  protected onPick(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ""; // permet de rechoisir le même fichier
    if (file) void this.handle(file);
  }

  protected onDrop(ev: DragEvent): void {
    ev.preventDefault();
    this.over.set(false);
    const file = ev.dataTransfer?.files?.[0];
    if (file) void this.handle(file);
  }

  protected clear(): void {
    this.error.set("");
    this.cleared.emit();
  }

  private async handle(file: File): Promise<void> {
    this.error.set("");
    const problem = imageProblem(file);
    if (problem) {
      this.error.set(this.t()(problem === "type" ? "ui.image.errorType" : "ui.image.errorSize"));
      return;
    }
    this.busy.set(true);
    try {
      this.picked.emit(await prepareImage(file));
    } catch {
      this.error.set(this.t()("ui.image.errorRead"));
    } finally {
      this.busy.set(false);
    }
  }
}
