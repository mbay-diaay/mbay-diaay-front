import "@shared/ui/charte-v2-fonts";

import { Component, inject, signal } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";

import { CRADESC, LOGIN_PHOTOS } from "@/config/brand";
import { isAccessCode, safeRedirect, unlock } from "@/lib/site-gate";
import { LocaleService } from "@shared/locale.service";
import { BrandLogoComponent, IconComponent } from "@shared/ui";

/**
 * Écran « site en construction » (charte V2) : photo des Niayes sous voile forêt, logo, message et champ du code
 * d'accès. Le bon code ouvre le site dans ce navigateur et renvoie vers la page demandée (`?redirect=`).
 * Voir `src/lib/site-gate.ts` pour le code, les pages restées ouvertes et la désactivation à l'ouverture.
 */
@Component({
  selector: "app-construction-page",
  imports: [BrandLogoComponent, IconComponent],
  host: { class: "block" },
  styles: `
    :host {
      font-family: var(--v2-font);
    }
    .screen {
      position: relative;
      min-height: 100vh;
      min-height: 100dvh;
      display: grid;
      place-items: center;
      overflow: hidden;
      background: var(--v2-foret);
      padding-block: 32px;
      padding-left: max(16px, env(safe-area-inset-left, 0px));
      padding-right: max(16px, env(safe-area-inset-right, 0px));
    }
    .photo {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .veil {
      position: absolute;
      inset: 0;
      background: linear-gradient(160deg, color-mix(in oklab, var(--v2-foret) 78%, transparent), var(--v2-foret) 85%);
    }
    .card {
      position: relative;
      width: min(100%, 460px);
      display: grid;
      gap: 22px;
      border-radius: 28px;
      background: var(--v2-creme);
      color: var(--v2-encre);
      padding: 32px 28px;
      box-shadow: var(--v2-ombre-modale);
    }
    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      width: fit-content;
      border-radius: 999px;
      background: var(--v2-sauge);
      color: var(--v2-foret);
      padding: 4px 12px;
      font-family: var(--v2-font-mono);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--v2-vert-pousse);
      animation: pulse 1.6s ease-in-out infinite;
    }
    @keyframes pulse {
      50% {
        opacity: 0.35;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .dot {
        animation: none;
      }
    }
    h1 {
      margin: 0;
      font-size: clamp(26px, 6vw, 32px);
      line-height: 1.15;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: var(--v2-foret);
      text-wrap: balance;
    }
    .text {
      margin: 0;
      color: var(--v2-gris-texte);
      font-size: 15px;
      line-height: 1.55;
    }
    .label {
      display: block;
      margin-bottom: 8px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--v2-ardoise);
    }
    .field {
      width: 100%;
      height: 54px;
      border-radius: var(--v2-radius-champ);
      border: 1.5px solid var(--v2-gris-trait);
      background: var(--v2-blanc);
      padding: 0 16px;
      font-family: var(--v2-font-mono);
      font-size: 17px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--v2-encre);
    }
    .field:focus {
      outline: none;
      border-color: var(--v2-foret);
      box-shadow: 0 0 0 4px color-mix(in oklab, var(--v2-foret) 15%, transparent);
    }
    .field.bad {
      border-color: var(--v2-erreur-fg);
    }
    .err {
      margin: 8px 0 0;
      font-size: 13px;
      font-weight: 600;
      color: var(--v2-erreur-fg);
    }
    .btn {
      display: flex;
      width: 100%;
      height: 56px;
      align-items: center;
      justify-content: space-between;
      border: 0;
      border-radius: 999px;
      background: var(--v2-foret);
      color: var(--v2-blanc);
      padding: 0 8px 0 24px;
      font: 700 16px var(--v2-font);
      cursor: pointer;
    }
    .btn:focus-visible {
      outline: 2px solid var(--v2-foret);
      outline-offset: 3px;
    }
    .chip {
      display: grid;
      width: 42px;
      height: 42px;
      place-items: center;
      border-radius: 999px;
      background: var(--v2-citron);
      color: var(--v2-foret);
    }
    .help {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 14px;
      border-top: 1px solid var(--v2-lin);
      padding-top: 16px;
      font-size: 13px;
      color: var(--v2-gris-texte);
    }
    .help a {
      color: var(--v2-foret);
      font-weight: 700;
      text-decoration: none;
    }
    .help a:hover {
      text-decoration: underline;
    }
  `,
  template: `
    <main class="screen">
      <img class="photo" [src]="photo.src" alt="" decoding="async" [style.object-position]="photo.position" />
      <div class="veil" aria-hidden="true"></div>

      <section class="card" aria-labelledby="gate-title">
        <ui-brand-logo [size]="44" />
        <div class="grid gap-3">
          <span class="eyebrow"><span class="dot" aria-hidden="true"></span>{{ t()("gate.eyebrow") }}</span>
          <h1 id="gate-title">{{ t()("gate.title") }}</h1>
          <p class="text">{{ t()("gate.text") }}</p>
        </div>

        <form class="grid gap-4" novalidate (submit)="$event.preventDefault(); submit()">
          <div>
            <label class="label" for="gate-code">{{ t()("gate.label") }}</label>
            <input
              id="gate-code"
              class="field"
              [class.bad]="!!error()"
              type="text"
              autocomplete="off"
              autocapitalize="characters"
              spellcheck="false"
              [placeholder]="t()('gate.placeholder')"
              [value]="code()"
              [attr.aria-invalid]="!!error()"
              [attr.aria-describedby]="error() ? 'gate-error' : null"
              (input)="code.set($any($event.target).value); error.set('')"
            />
            @if (error()) {
              <p id="gate-error" class="err" role="alert">{{ error() }}</p>
            }
          </div>
          <button type="submit" class="btn">
            {{ t()("gate.submit") }}<span class="chip"><ui-icon name="arrow_outward" [size]="20" /></span>
          </button>
        </form>

        <p class="help">
          <span>{{ t()("gate.help") }}</span>
          <a [href]="'mailto:' + cradesc.email">{{ cradesc.email }}</a>
          <a [href]="'tel:' + cradesc.phoneHref">{{ cradesc.phone }}</a>
        </p>
      </section>
    </main>
  `,
})
export default class ConstructionPage {
  protected readonly t = inject(LocaleService).t;
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly cradesc = CRADESC;
  protected readonly photo = LOGIN_PHOTOS[1] ?? LOGIN_PHOTOS[0]!;
  protected readonly code = signal("");
  protected readonly error = signal("");

  protected submit(): void {
    if (!this.code().trim()) {
      this.error.set(this.t()("gate.empty"));
      return;
    }
    if (!isAccessCode(this.code())) {
      this.error.set(this.t()("gate.error"));
      return;
    }
    unlock();
    void this.router.navigateByUrl(safeRedirect(this.route.snapshot.queryParamMap.get("redirect")));
  }
}
