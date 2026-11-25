import { Component, computed, effect, inject, input, signal, untracked } from "@angular/core";
import { RouterLink } from "@angular/router";

import { ALERT_REASON_KEY, listProducerAlerts, type QualityAlertDto } from "@/lib/api/quality-alerts";
import { CniAlertsService } from "./cni-alerts.service";
import { CniResolveModalComponent } from "./cni-resolve-modal.component";
import { LocaleService } from "./locale.service";
import { StoreService } from "./store.service";
import { IconComponent } from "./ui";

/**
 * Encadré rouge de la fiche producteur : « CNI proches : à vérifier », avec l'explication (ce n'est pas un doublon),
 * l'autre fiche concernée et la résolution manuelle. Lu sur le serveur (`GET /quality/alerts/producer/:id`), visible
 * seulement pour un compte qui a le droit de voir les alertes, et seulement s'il y a une alerte ouverte.
 * Aucune valeur de CNI n'est affichée.
 */
@Component({
  selector: "app-cni-alert-panel",
  imports: [CniResolveModalComponent, IconComponent, RouterLink],
  styles: `
    :host {
      display: block;
    }
    .panel {
      display: flex;
      gap: 14px;
      align-items: flex-start;
      margin-top: 16px;
      border-radius: 20px;
      padding: 16px 18px;
      background: var(--v2-erreur-bg);
      color: var(--v2-erreur-fg);
    }
    .panel.format {
      background: var(--v2-attente-bg);
      color: var(--v2-attente-fg);
    }
    .ico {
      display: grid;
      flex: none;
      place-items: center;
      width: 40px;
      height: 40px;
      border-radius: 12px;
      background: color-mix(in oklab, currentColor 14%, transparent);
    }
    .titre {
      font-size: 16px;
      font-weight: 800;
    }
    .texte {
      margin-top: 4px;
      max-width: 62ch;
      font-size: 14px;
      font-weight: 500;
      line-height: 1.5;
    }
    ul {
      margin-top: 12px;
      display: grid;
      gap: 8px;
    }
    li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      border-radius: 14px;
      background: var(--v2-blanc);
      color: var(--v2-encre);
      padding: 10px 12px;
      font-size: 14px;
      font-weight: 600;
    }
    .sub {
      font-size: 13px;
      font-weight: 500;
      color: var(--v2-gris-texte);
    }
  `,
  template: `
    @if (formatAlerts().length) {
      <section class="panel format rise" role="note">
        <span class="ico" aria-hidden="true"><ui-icon name="info" [size]="22" /></span>
        <div class="min-w-0 flex-1">
          <p class="titre">{{ t()("cni.format.title") }}</p>
          <p class="texte">{{ t()("cni.format.message") }}</p>
          <ul>
            @for (alert of formatAlerts(); track alert.id) {
              <li>
                <span class="min-w-0">
                  {{ t()("cni.format.fiche") }}
                  <span class="sub block">{{ t()(reasonKey(alert)) }}</span>
                </span>
                <button type="button" class="btn btn-primary" (click)="resolving.set(alert)">
                  {{ t()("cni.fiche.resolve") }}<span class="btn-chip"><ui-icon name="check" [size]="18" /></span>
                </button>
              </li>
            }
          </ul>
        </div>
      </section>
    }
    @if (visible()) {
      <section class="panel rise" role="alert" aria-live="polite">
        <span class="ico" aria-hidden="true"><ui-icon name="warning" [size]="22" /></span>
        <div class="min-w-0 flex-1">
          <p class="titre">{{ t()("cni.fiche.title") }}</p>
          <p class="texte">{{ t()("cni.explain.body") }}</p>
          <ul>
            @for (alert of closeAlerts(); track alert.id) {
              <li>
                <span class="min-w-0">
                  @if (alert.otherProducerId) {
                    {{ t()("cni.fiche.other", { code: alert.otherProducerCode ?? alert.otherProducerId }) }}
                  } @else {
                    {{ t()("cni.fiche.otherHidden") }}
                  }
                  <span class="sub block">{{ t()(reasonKey(alert)) }}</span>
                </span>
                <span class="flex flex-wrap gap-2">
                  @if (alert.otherProducerId) {
                    <a class="btn btn-ghost" [routerLink]="['/dashboard/producteurs', alert.otherProducerId]">
                      <ui-icon name="visibility" [size]="18" />{{ t()("cni.fiche.openOther") }}
                    </a>
                  }
                  <button type="button" class="btn btn-primary" (click)="resolving.set(alert)">
                    {{ t()("cni.fiche.resolve") }}<span class="btn-chip"><ui-icon name="check" [size]="18" /></span>
                  </button>
                </span>
              </li>
            }
          </ul>
        </div>
      </section>
    }
    @if (canView()) {
      <app-cni-resolve-modal [alert]="resolving()" (closed)="resolving.set(null)" (resolved)="afterResolve()" />
    }
  `,
})
export class CniAlertPanelComponent {
  readonly producerId = input.required<string>();

  protected readonly t = inject(LocaleService).t;
  private readonly alerts = inject(CniAlertsService);
  protected readonly store = inject(StoreService);
  protected readonly items = signal<QualityAlertDto[]>([]);
  protected readonly resolving = signal<QualityAlertDto | null>(null);

  protected readonly canView = this.alerts.canView;
  private readonly openAlerts = computed(() => this.items().filter((alert) => alert.status === "ouverte"));
  /** Alertes rouges : CNI différentes mais proches (deux fiches). */
  protected readonly closeAlerts = computed(() => this.openAlerts().filter((alert) => alert.kind === "cni_proches"));
  /** Alertes de format : une seule fiche, valeur jamais affichée. */
  protected readonly formatAlerts = computed(() => this.openAlerts().filter((alert) => alert.kind === "cni_format_inhabituel"));
  protected readonly visible = computed(() => this.alerts.canView() && this.closeAlerts().length > 0);

  constructor() {
    effect(() => {
      const producerId = this.producerId();
      if (!this.alerts.canView()) return untracked(() => this.items.set([]));
      untracked(() => void this.load(producerId));
    });
  }

  protected reasonKey(alert: QualityAlertDto) {
    return ALERT_REASON_KEY[alert.reason];
  }

  private async load(producerId: string): Promise<void> {
    try {
      const items = await listProducerAlerts(producerId);
      if (producerId === this.producerId()) this.items.set(items);
    } catch {
      this.items.set([]);
    }
  }

  /** Après une résolution : relit la fiche et la liste des fiches signalées (la pastille disparaît des listes). */
  protected afterResolve(): void {
    void this.load(this.producerId());
    void this.alerts.refresh();
  }
}
