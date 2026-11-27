import { Component, inject, input, signal } from "@angular/core";

import { sourceRowsOf, type SourceRow } from "@/lib/api/origin";
import { getProducer } from "@/lib/api/producers";
import { isApiMode } from "@/lib/api/config";
import { LocaleService } from "./locale.service";
import { IconComponent } from "./ui";

/**
 * Panneau « Données d'origine du fichier » (décision Q-17) : la ligne du fichier reçu, colonne par colonne, sans aucune
 * modification. Repliable ; la ligne n'est lue sur le serveur (`sourceValues` du détail de la fiche) qu'à l'ouverture.
 * Rien n'est gardé dans le navigateur. Le serveur protège la CNI, le téléphone et les contacts : sans le droit de lecture
 * complète (`identity.read_full`) les valeurs arrivent masquées ; avec le droit, la lecture est tracée dans l'audit.
 * `<app-source-values-panel [producerId]="current.id" />`
 */
@Component({
  selector: "app-source-values-panel",
  imports: [IconComponent],
  styles: `
    :host {
      display: block;
    }
    .card {
      border-radius: 20px;
      border: 1px solid var(--v2-bord-carte);
      background: var(--v2-blanc);
    }
    .head {
      display: flex;
      width: 100%;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 18px;
      font-size: 16px;
      font-weight: 800;
      text-align: left;
    }
    .body {
      border-top: 1px solid var(--v2-separateur);
      padding: 14px 18px 18px;
    }
    .aide {
      max-width: 62ch;
      font-size: 14px;
      color: var(--v2-gris-texte);
    }
    table {
      margin-top: 12px;
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    th,
    td {
      border-top: 1px solid var(--v2-separateur);
      padding: 8px 10px;
      text-align: left;
      vertical-align: top;
    }
    th {
      width: 40%;
      font-weight: 700;
      color: var(--v2-ardoise);
    }
    td {
      word-break: break-word;
    }
  `,
  template: `
    <section class="card">
      <button type="button" class="head" [attr.aria-expanded]="open()" (click)="toggle()">
        <span class="flex items-center gap-2"><ui-icon name="database" [size]="18" />{{ t()("origine.title") }}</span>
        <ui-icon [name]="open() ? 'keyboard_arrow_down' : 'chevron_right'" [size]="20" />
      </button>
      @if (open()) {
        <div class="body">
          <p class="aide">{{ t()("origine.help") }}</p>
          @switch (state()) {
            @case ("loading") {
              <p class="sub mt-3">{{ t()("origine.loading") }}</p>
            }
            @case ("error") {
              <p class="mt-3 text-[14px] font-bold" style="color: var(--v2-erreur-fg)" role="alert">{{ t()("origine.error") }}</p>
            }
            @default {
              @if (rows().length) {
                <div class="overflow-x-auto"><table>
                  <caption class="sr-only">
                    {{ t()("origine.title") }}
                  </caption>
                  <thead class="sr-only">
                    <tr>
                      <th>{{ t()("origine.col.column") }}</th>
                      <th>{{ t()("origine.col.value") }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of rows(); track row.column) {
                      <tr>
                        <th scope="row">{{ row.column }}</th>
                        <td class="tabular-nums">{{ shown(row) }}</td>
                      </tr>
                    }
                  </tbody>
                </table></div>
              } @else {
                <p class="sub mt-3">{{ t()("origine.empty") }}</p>
              }
            }
          }
        </div>
      }
    </section>
  `,
})
export class SourceValuesPanelComponent {
  readonly producerId = input.required<string>();
  protected readonly t = inject(LocaleService).t;
  protected readonly open = signal(false);
  protected readonly state = signal<"idle" | "loading" | "ready" | "error">("idle");
  protected readonly rows = signal<SourceRow[]>([]);
  private loadedFor = "";

  protected toggle(): void {
    this.open.update((value) => !value);
    if (this.open()) void this.load();
  }

  private async load(): Promise<void> {
    const id = this.producerId();
    if (!isApiMode() || this.loadedFor === id) return;
    this.state.set("loading");
    try {
      const detail = await getProducer(id);
      this.rows.set(sourceRowsOf(detail.sourceValues));
      this.loadedFor = id;
      this.state.set("ready");
    } catch {
      this.state.set("error");
    }
  }

  /** Valeur affichée telle que le serveur la renvoie (il masque CNI, téléphone et contacts sans `identity.read_full`). */
  protected shown(row: SourceRow): string {
    return row.value || "—";
  }
}
