import { Component, computed, inject, input } from "@angular/core";

import { BRAND } from "@/config/brand";
import { BrandingService } from "../branding.service";
import { LocaleService } from "../locale.service";

/**
 * Logo Mbay Diaay, charte V2 (« Proposition 1 », composition horizontale principale) :
 * symbole officiel + logotype Poppins Bold sur deux lignes + signature facultative.
 *
 * Variantes autorisées par la charte (p. 03) — à n'utiliser que sur leur fond :
 * - `color`   : fond blanc ou crème. « Mbay » vert pousse, « Diaay » marron CRADESC (variante 3a).
 * - `inverse` : fond forêt uniquement. « Mbay » blanc, « Diaay » citron.
 *
 * Ordre, proportions et typographie sont figés (p. 08) : ne pas recomposer ici.
 * Utilisé sous `.charte-v2` (tokens `--v2-*`).
 */
@Component({
  selector: "ui-brand-logo",
  host: { class: "inline-flex items-center" },
  styles: `
    .custom-chip {
      border-radius: 14px;
      background: #ffffff;
    }
  `,
  template: `
    @if (customSrc(); as src) {
      <!-- Logo choisi par le super administrateur : image complète (symbole et nom), à la hauteur demandée. -->
      <span
        class="inline-flex items-center"
        [class.custom-chip]="onChip()"
        [style.padding.px]="onChip() ? Math.max(4, size() * 0.12) : 0"
      >
        <img [src]="src" [alt]="t()('brand.logoAlt')" [style.height.px]="size()" class="w-auto max-w-[220px] shrink-0 object-contain" />
      </span>
    } @else {
    <img
      [src]="symbolSrc()"
      [alt]="wordmark() ? '' : t()('brand.logoAlt')"
      [attr.aria-hidden]="wordmark() ? true : null"
      [style.height.px]="size()"
      class="w-auto shrink-0"
    />
    @if (wordmark()) {
      <span class="ml-3 flex flex-col" [attr.aria-label]="brand.name" role="img">
        <span
          class="font-bold leading-[0.95] tracking-[-0.01em]"
          [style.font-family]="'var(--v2-font-logo)'"
          [style.font-size.px]="size() * 0.46"
        >
          <span [style.color]="first()">{{ brand.wordmark[0] }}</span><br />
          <span [style.color]="second()">{{ brand.wordmark[1] }}</span>
        </span>
        @if (signature()) {
          <span
            class="mt-1 font-medium"
            [style.font-family]="'var(--v2-font-logo)'"
            [style.font-size.px]="Math.max(9, size() * 0.15)"
            [style.color]="signatureColor()"
            >{{ t()("auth.layout.signature") }}</span
          >
        }
      </span>
    }
    }
  `,
})
export class BrandLogoComponent {
  readonly variant = input<"color" | "inverse">("color");
  /** Hauteur du symbole en px. Charte : ≥ 24 px seul, ≥ 96 px de large sans signature. */
  readonly size = input(48);
  readonly wordmark = input(true);
  /** Signature « Cultivons • Gérez • Valorisons » : à masquer sous 140 px de large (charte p. 07). */
  readonly signature = input(false);

  protected readonly brand = BRAND;
  private readonly branding = inject(BrandingService);

  /**
   * Logo choisi dans les réglages. Sur fond foncé sans logo « fond foncé », le logo « fond clair » est posé sur une
   * pastille blanche pour rester lisible.
   */
  protected readonly customSrc = computed(() => {
    this.branding.branding();
    if (this.variant() === "color") return this.branding.colorLogo();
    return this.branding.inverseLogo() ?? this.branding.colorLogo();
  });
  protected readonly onChip = computed(
    () => this.variant() === "inverse" && !this.branding.inverseLogo() && !!this.branding.colorLogo(),
  );
  protected readonly Math = Math;
  protected readonly t = inject(LocaleService).t;

  protected readonly symbolSrc = computed(() =>
    this.variant() === "inverse" ? BRAND.symbol.inverse : BRAND.symbol.color,
  );
  protected readonly first = computed(() =>
    this.variant() === "inverse" ? "var(--v2-blanc)" : "var(--v2-vert-pousse)",
  );
  protected readonly second = computed(() =>
    this.variant() === "inverse" ? "var(--v2-citron)" : "var(--v2-terre)",
  );
  protected readonly signatureColor = computed(() =>
    this.variant() === "inverse"
      ? "color-mix(in oklab, var(--v2-blanc) 75%, transparent)"
      : "var(--v2-vert-pousse)",
  );
}
