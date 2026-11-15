import { Component, computed, input } from "@angular/core";

import { IconComponent } from "./icon.component";

/**
 * Pastille d'identité : l'image de la fiche (logo, photo) ou, à défaut, les initiales du nom.
 * `shape="square"` pour un logo de coopérative (icône à défaut d'initiales), `round` pour une personne.
 *
 * `<ui-avatar [src]="user.photoUrl" [name]="user.name" [size]="40" />`
 */
@Component({
  selector: "ui-avatar",
  imports: [IconComponent],
  host: {
    class: "inline-grid shrink-0 place-items-center overflow-hidden font-extrabold",
    "[class.rounded-full]": "shape() === 'round'",
    "[style.border-radius.px]": "shape() === 'square' ? size() * 0.28 : null",
    "[style.width.px]": "size()",
    "[style.height.px]": "size()",
    "[style.font-size.px]": "size() * 0.38",
    "[style.background]": "src() ? 'var(--v2-blanc)' : 'var(--v2-sauge)'",
    "[style.color]": "'var(--v2-foret)'",
    "[style.box-shadow]": "'inset 0 0 0 1px color-mix(in oklab, var(--v2-foret) 14%, transparent)'",
  },
  template: `
    @if (src(); as url) {
      <img [src]="url" alt="" class="h-full w-full object-cover" loading="lazy" decoding="async" />
    } @else if (shape() === "square") {
      <ui-icon name="apartment" [size]="size() * 0.5" />
    } @else {
      <span aria-hidden="true">{{ initials() }}</span>
    }
  `,
})
export class AvatarComponent {
  readonly src = input<string | null | undefined>(null);
  readonly name = input("");
  readonly size = input(40);
  readonly shape = input<"round" | "square">("round");

  protected readonly initials = computed(() => {
    const words = this.name().trim().split(/\s+/).filter(Boolean);
    return ((words[0]?.[0] ?? "") + (words.length > 1 ? (words.at(-1)?.[0] ?? "") : "")).toUpperCase() || "?";
  });
}
