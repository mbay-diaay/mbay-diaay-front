import "@shared/ui/charte-v2-fonts";

import { Component, inject } from "@angular/core";
import { ExternalLink, LucideAngularModule, Mail, Phone } from "lucide-angular";

import { CRADESC, LOGIN_PHOTOS } from "@/config/brand";

import { LocaleService } from "./locale.service";
import { BrandLogoComponent, PhotoSlideshowComponent } from "./ui";

/**
 * Cadre commun des écrans d'authentification (charte V2), identique à la page de connexion : panneau forêt avec le
 * diaporama des jardins et le CRADESC mis en avant sur grand écran, bandeau CRADESC sur mobile, choix FR / WO, contact
 * du CRADESC en pied. Le contenu de l'écran se place à l'intérieur : `<app-auth-shell>…</app-auth-shell>`.
 */
@Component({
  selector: "app-auth-shell",
  imports: [LucideAngularModule, BrandLogoComponent, PhotoSlideshowComponent],
  styles: `
    a[href],
    button:not(:disabled) {
      cursor: pointer;
    }
    .mono {
      font-family: var(--v2-font-mono);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .link {
      font-weight: 700;
      color: var(--v2-foret-clair);
      text-underline-offset: 3px;
    }
    .link:hover {
      text-decoration: underline;
    }
    .ghost:focus-visible {
      outline: 2px solid var(--v2-foret);
      outline-offset: 2px;
      border-radius: 6px;
    }
  `,
  template: `
    <div
      class="charte-v2 grid min-h-screen grid-cols-[minmax(0,1fr)] lg:h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:overflow-hidden"
    >
      <aside
        class="relative hidden overflow-hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col"
        style="background: var(--v2-foret); color: var(--v2-blanc)"
      >
        <ui-photo-slideshow class="absolute inset-0" [photos]="photos" />
        <div
          class="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style="background: linear-gradient(180deg, color-mix(in oklab, var(--v2-foret) 88%, transparent) 0%, color-mix(in oklab, var(--v2-foret) 35%, transparent) 42%, color-mix(in oklab, var(--v2-foret) 70%, transparent) 68%, color-mix(in oklab, var(--v2-foret) 96%, transparent) 100%)"
        ></div>
        <div class="relative flex flex-1 flex-col px-12 py-10 xl:px-16">
          <ui-brand-logo variant="inverse" [size]="56" />
          <div class="mt-auto">
            <p class="max-w-[17em] text-[32px] font-extrabold leading-[1.08] tracking-[-0.03em] text-balance">
              {{ t()("auth.layout.headline") }}
            </p>
            <div class="mt-5 flex max-w-xl gap-4">
              <span class="mt-[0.7em] h-[3px] w-10 shrink-0 rounded-full" style="background: var(--v2-citron)"></span>
              <p class="text-[18px] font-bold leading-snug tracking-[-0.01em] text-balance" style="color: var(--v2-citron)">
                {{ t()("auth.layout.lead") }}
              </p>
            </div>
            <a
              [href]="cradesc.url"
              target="_blank"
              rel="noopener noreferrer"
              class="ghost mt-10 flex max-w-md items-center gap-4 rounded-[20px] p-3 pr-5"
              style="background: var(--v2-blanc); color: var(--v2-encre)"
              [attr.aria-label]="t()('auth.cradesc.visit')"
            >
              <img [src]="cradesc.emblem" [alt]="t()('auth.cradesc.logoAlt')" width="80" height="70" class="h-16 w-auto shrink-0" />
              <span class="min-w-0">
                <span class="mono block" style="color: var(--v2-foret-clair)">{{ t()("auth.cradesc.carriedBy") }}</span>
                <span class="block text-[20px] font-extrabold leading-tight tracking-[-0.02em]" style="color: var(--v2-terre)">{{ cradesc.acronym }}</span>
                <span class="block text-xs font-semibold leading-snug" style="color: var(--v2-ardoise)">{{ t()("auth.cradesc.fullName") }}</span>
                <span class="link mt-1.5 inline-flex items-center gap-1 text-[13px]">
                  {{ cradesc.urlLabel }}<lucide-angular [img]="icons.external" [size]="13" />
                </span>
              </span>
            </a>
          </div>
        </div>
      </aside>

      <main
        class="relative flex min-w-0 flex-col px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 sm:px-10 lg:h-screen lg:overflow-y-auto lg:px-16 lg:py-6"
      >
        <header class="flex items-center justify-between gap-3">
          <ui-brand-logo class="lg:invisible" variant="color" [size]="40" />
          <div
            class="inline-flex gap-1 rounded-[14px] border p-1 text-[13px] font-bold"
            style="border-color: var(--v2-bord-carte); background: var(--v2-blanc)"
            role="radiogroup"
            [attr.aria-label]="t()('locale.fr') + ' / ' + t()('locale.wo')"
          >
            @for (localeOption of locales; track localeOption) {
              <button
                type="button"
                role="radio"
                class="ghost rounded-[10px] px-3.5 py-1.5 transition-colors"
                [style.background]="locale() === localeOption ? 'var(--v2-foret)' : 'transparent'"
                [style.color]="locale() === localeOption ? 'var(--v2-blanc)' : 'var(--v2-ardoise)'"
                [attr.aria-checked]="locale() === localeOption"
                (click)="localeService.setLocale(localeOption)"
              >
                {{ t()(localeOption === "fr" ? "locale.fr" : "locale.wo") }}
              </button>
            }
          </div>
        </header>

        <a
          [href]="cradesc.url"
          target="_blank"
          rel="noopener noreferrer"
          class="ghost mt-5 flex items-center gap-3 rounded-[20px] border p-3 lg:hidden"
          style="border-color: var(--v2-bord-carte); background: var(--v2-blanc)"
          [attr.aria-label]="t()('auth.cradesc.visit')"
        >
          <img [src]="cradesc.emblem" alt="" width="60" height="52" class="h-11 w-auto shrink-0" />
          <span class="min-w-0">
            <span class="mono block" style="color: var(--v2-gris-texte)">{{ t()("auth.cradesc.carriedBy") }}</span>
            <span class="block text-[15px] font-extrabold" style="color: var(--v2-terre)">{{ cradesc.acronym }}</span>
            <span class="block truncate text-xs font-medium" style="color: var(--v2-gris-texte)">{{ t()("auth.cradesc.fullName") }}</span>
          </span>
        </a>

        <div class="flex flex-1 items-start justify-center py-8 lg:items-center lg:py-4">
          <div class="w-full max-w-[480px]">
            <ng-content />
            <div class="mt-8 flex items-center gap-4 border-t pt-6" style="border-color: var(--v2-bord-carte)">
              <span class="grid size-12 shrink-0 place-items-center rounded-[14px] border" style="border-color: var(--v2-bord-carte); background: var(--v2-blanc)">
                <img [src]="cradesc.emblem" alt="" width="40" height="34" class="h-8 w-auto" />
              </span>
              <div class="min-w-0 text-[15px]">
                <p class="font-bold">{{ t()("auth.help.title") }}</p>
                <div class="mt-0.5 flex flex-wrap gap-x-4 gap-y-1">
                  <a [href]="'mailto:' + cradesc.email" class="link inline-flex items-center gap-1.5">
                    <lucide-angular [img]="icons.mail" [size]="15" />{{ cradesc.email }}
                  </a>
                  <a [href]="'tel:' + cradesc.phoneHref" class="link inline-flex items-center gap-1.5 tabular-nums">
                    <lucide-angular [img]="icons.phone" [size]="15" />{{ cradesc.phone }}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  `,
})
export class AuthShellComponent {
  protected readonly localeService = inject(LocaleService);
  protected readonly t = this.localeService.t;
  protected readonly locale = this.localeService.locale;
  protected readonly locales = ["fr", "wo"] as const;
  protected readonly cradesc = CRADESC;
  protected readonly photos = LOGIN_PHOTOS;
  protected readonly icons = { external: ExternalLink, mail: Mail, phone: Phone };
}
