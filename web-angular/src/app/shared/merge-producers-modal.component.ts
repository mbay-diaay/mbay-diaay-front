import { Component, computed, effect, inject, input, output, signal, untracked } from "@angular/core";
import { RouterLink } from "@angular/router";

import { fmtAge } from "@/lib/format";
import { compareProducers, differingFieldLabels, mergeErrorKey, mergeProducers } from "@/lib/api/producers";
import { suggestedKeepId, type DuplicateGroup } from "@/lib/quality-real";
import { LocaleService } from "@shared/locale.service";
import { ProducerWorkflow } from "@shared/producer-workflow.service";
import { StoreService } from "@shared/store.service";
import { IconComponent, initialsOf, ModalComponent, SnackbarService, V2_PAGE_STYLES } from "@shared/ui";

/**
 * Modale de fusion réelle (mode API) partagée par la page Doublons et la page « Comparer les fiches » :
 * choix de la fiche gardée, commentaire, puis fusion des autres fiches une par une.
 * Ouverte quand `group` est renseigné ; émet `closed` à l'annulation et après la fusion.
 */
@Component({
  selector: "app-merge-producers-modal",
  imports: [IconComponent, ModalComponent, RouterLink],
  styles: [
    V2_PAGE_STYLES,
    `
      .alerte {
        display: flex;
        gap: 12px;
        align-items: flex-start;
        border-radius: 18px;
        padding: 14px 18px;
        background: var(--v2-attente-bg);
        color: var(--v2-attente-fg);
      }
      .alerte-ico {
        display: grid;
        flex: none;
        place-items: center;
        width: 36px;
        height: 36px;
        border-radius: 12px;
        background: color-mix(in oklab, var(--v2-attente-fg) 14%, transparent);
      }
      .alerte-texte {
        margin: 0;
        font-size: 15px;
        font-weight: 600;
        line-height: 1.45;
      }
      .keep-grid {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
      }
      .keep-card {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        border-radius: 18px;
        border: 1.5px solid var(--v2-bord-carte);
        background: var(--v2-blanc);
        padding: 12px 14px;
        text-align: left;
        cursor: pointer;
      }
      .keep-card:hover {
        border-color: var(--v2-gris-texte);
      }
      .keep-card.on {
        border: 2px solid var(--v2-foret);
        background: var(--v2-sauge);
        padding: 11.5px 13.5px;
      }
      .keep-card .photo {
        width: 40px;
        height: 40px;
        flex: none;
        border-radius: 999px;
        object-fit: cover;
      }
      .keep-radio {
        flex: none;
        margin-top: 2px;
        height: 18px;
        width: 18px;
        border-radius: 999px;
        border: 2px solid var(--v2-gris-texte);
        display: grid;
        place-items: center;
      }
      .keep-card.on .keep-radio {
        border-color: var(--v2-foret);
      }
      .keep-card.on .keep-radio::after {
        content: "";
        height: 8px;
        width: 8px;
        border-radius: 999px;
        background: var(--v2-foret);
      }
    `,
  ],
  template: `
    <ui-modal
      [open]="!!group()"
      [title]="t()('qualite.merge.title')"
      [description]="t()('qualite.merge.description')"
      icon="hub"
      [width]="640"
      [closeLabel]="t()('common.close')"
      (closed)="close()"
    >
      @if (group(); as current) {
        @if (scoopMismatch()) {
          <div class="alerte" role="alert">
            <span class="alerte-ico" aria-hidden="true"><ui-icon name="warning" [size]="20" /></span>
            <p class="alerte-texte">{{ t()("qualite.merge.differentScoop") }}</p>
          </div>
        }
        <div class="keep-grid mt-4" role="radiogroup" [attr.aria-label]="t()('qualite.merge.keepLabel')">
          @for (member of current.members; track member.id) {
            <button
              type="button"
              role="radio"
              class="keep-card"
              [class.on]="keepId() === member.id"
              [attr.aria-checked]="keepId() === member.id"
              (click)="keepId.set(member.id)"
            >
              <span class="keep-radio" aria-hidden="true"></span>
              @if (member.photoUrl) {
                <img class="photo" [src]="member.photoUrl" alt="" />
              } @else {
                <span class="avatar">{{ initials(member.firstName + " " + member.lastName) }}</span>
              }
              <span class="min-w-0 flex-1">
                <span class="block truncate font-bold">{{ member.firstName }} {{ member.lastName }}</span>
                <span class="sub block">{{ member.code }}</span>
                <span class="sub block truncate">{{ scoopName(member.scoopId) }}</span>
                <span class="sub block truncate">{{ member.village || "—" }}</span>
                <span class="sub block"
                  >{{ member.age === null ? t()("qualite.merge.noAge") : fmtAge(member.age) }} ·
                  {{ t()("qualite.merge.plots", { n: plotCount(member.id) }) }}</span
                >
                @if (suggestedId() === member.id) {
                  <span class="badge mt-1" style="background: var(--v2-succes-bg); color: var(--v2-succes-fg)">{{
                    t()("qualite.merge.suggested")
                  }}</span>
                }
              </span>
            </button>
          }
        </div>
        <p class="sub mt-4 font-semibold">{{ mergeSummary() }}</p>
        <!-- Règle stricte : le serveur doit confirmer que les fiches sont identiques avant toute fusion -->
        @if (check().state === "loading") {
          <p class="sub mt-3" aria-live="polite">{{ t()("qualite.strict.verdict.checking") }}</p>
        } @else if (check().state === "error") {
          <div class="alerte mt-3" role="alert">
            <span class="alerte-ico" aria-hidden="true"><ui-icon name="warning" [size]="20" /></span>
            <p class="alerte-texte">{{ t()("qualite.strict.verdict.errorBody") }}</p>
          </div>
        } @else if (check().state === "differ") {
          <div class="alerte mt-3" role="alert">
            <span class="alerte-ico" aria-hidden="true"><ui-icon name="warning" [size]="20" /></span>
            <div>
              <p class="alerte-texte">{{ t()("qualite.strict.differHint") }}</p>
              @if (check().labels.length) {
                <p class="alerte-texte mt-1">{{ t()("qualite.merge.differences", { fields: check().labels.join(", ") }) }}</p>
              }
              <a class="mt-2 inline-block font-extrabold underline" [routerLink]="['/dashboard/qualite/doublons/comparer']" [queryParams]="{ fiches: compareCodes() }" (click)="close()">
                {{ t()("qualite.compare.decision.openSheets") }}
              </a>
            </div>
          </div>
        }
        <label class="lbl mt-4 block" for="merge-comment">{{ t()("qualite.merge.comment") }}</label>
        <textarea
          id="merge-comment"
          class="area mt-2"
          [placeholder]="t()('qualite.merge.commentPlaceholder')"
          [value]="comment()"
          (input)="comment.set($any($event.target).value)"
        ></textarea>
      }
      <button modal-footer type="button" class="btn btn-ghost" [disabled]="busy()" (click)="close()">
        {{ t()("qualite.merge.cancel") }}
      </button>
      <button
        modal-footer
        type="button"
        class="btn btn-primary"
        [disabled]="busy() || scoopMismatch() || !keepId() || check().state !== 'identical'"
        (click)="confirm()"
      >
        {{ busy() ? t()("qualite.merge.running") : t()("qualite.merge.confirm")
        }}<span class="btn-chip"><ui-icon name="check" [size]="18" /></span>
      </button>
    </ui-modal>
  `,
})
export class MergeProducersModalComponent {
  readonly group = input<DuplicateGroup | null>(null);
  readonly closed = output<void>();
  /** Émis après une fusion réussie ou partielle (au moins une fiche rattachée). */
  readonly merged = output<void>();

  private readonly store = inject(StoreService);
  private readonly locale = inject(LocaleService);
  protected readonly t = this.locale.t;
  private readonly snackbar = inject(SnackbarService);
  private readonly flow = inject(ProducerWorkflow);
  protected readonly initials = initialsOf;
  protected readonly fmtAge = fmtAge;

  protected readonly keepId = signal("");
  /**
   * Comparaison stricte de la fiche gardée avec chacune des autres (`GET /producers/:keepId/compare`) : la fusion n'est
   * possible que si le serveur répond « identiques » pour toutes. `labels` : champs qui diffèrent, en français.
   */
  protected readonly check = signal<{ state: "idle" | "loading" | "error" | "identical" | "differ"; labels: string[] }>({
    state: "idle",
    labels: [],
  });
  private checkToken = 0;
  protected readonly comment = signal("");
  protected readonly busy = signal(false);

  constructor() {
    // À chaque ouverture : fiche gardée suggérée et commentaire vide.
    effect(() => {
      const current = this.group();
      untracked(() => {
        this.comment.set("");
        this.keepId.set(current ? suggestedKeepId(current.members, (id) => this.plotCount(id)) : "");
      });
    });
  }

  /** Codes des fiches du groupe, pour ouvrir la page « Comparer les fiches ». */
  protected readonly compareCodes = computed(() => (this.group()?.members ?? []).map((member) => member.code).join(","));

  private readonly runCheck = effect(() => {
    const current = this.group();
    const keep = this.keepId();
    untracked(() => void this.verify(current?.members.map((member) => member.id) ?? [], keep));
  });

  private async verify(ids: string[], keep: string): Promise<void> {
    const token = ++this.checkToken;
    const others = ids.filter((id) => id !== keep);
    if (!keep || !others.length) {
      this.check.set({ state: "idle", labels: [] });
      return;
    }
    this.check.set({ state: "loading", labels: [] });
    try {
      const results = await Promise.all(others.map((id) => compareProducers(keep, id)));
      if (token !== this.checkToken) return;
      const labels = [...new Set(results.flatMap((result) => result.fields.map((field) => field.label)))];
      this.check.set({ state: results.every((result) => result.identical) ? "identical" : "differ", labels });
    } catch {
      if (token !== this.checkToken) return;
      this.check.set({ state: "error", labels: [] });
    }
  }

  protected readonly suggestedId = computed(() => {
    const current = this.group();
    return current ? suggestedKeepId(current.members, (id) => this.plotCount(id)) : "";
  });

  protected readonly scoopMismatch = computed(() => {
    const current = this.group();
    return !!current && new Set(current.members.map((member) => member.scoopId)).size > 1;
  });

  protected readonly mergeSummary = computed(() => {
    const current = this.group();
    const keep = current?.members.find((member) => member.id === this.keepId());
    if (!current || !keep) return "";
    const others = current.members.filter((member) => member.id !== keep.id);
    const t = this.t();
    const keepLabel = `${keep.firstName} ${keep.lastName} (${keep.code})`;
    const otherLabel = others.map((member) => `${member.firstName} ${member.lastName} (${member.code})`).join(", ");
    const base = t("qualite.merge.summary", { others: otherLabel, keep: keepLabel });
    return others.length > 1 ? `${base} ${t("qualite.merge.summaryMany", { n: others.length, keep: keep.code })}` : base;
  });

  protected plotCount(producerId: string): number {
    return this.store.state().plots.filter((plot) => plot.producerId === producerId).length;
  }

  protected scoopName(id: string): string {
    return this.store.state().scoops.find((scoop) => scoop.id === id)?.name ?? "—";
  }

  protected close() {
    if (this.busy()) return;
    this.closed.emit();
  }

  /** Fusionne les autres fiches dans la fiche gardée, une par une ; s'arrête à la première erreur. */
  protected async confirm() {
    const current = this.group();
    const keepId = this.keepId();
    if (!current || !keepId || this.scoopMismatch() || this.busy() || this.check().state !== "identical") return;
    const keep = current.members.find((member) => member.id === keepId);
    const others = current.members.filter((member) => member.id !== keepId);
    if (!keep) return;
    this.busy.set(true);
    let done = 0;
    let failure: { code: string; reason: string } | null = null;
    for (const other of others) {
      try {
        await mergeProducers(keepId, other.id, this.comment());
        done += 1;
      } catch (error) {
        const labels = differingFieldLabels(error);
        const reason = this.t()(mergeErrorKey(error));
        failure = {
          code: other.code,
          reason: labels.length ? `${reason} ${this.t()("qualite.merge.differences", { fields: labels.join(", ") })}` : reason,
        };
        break;
      }
    }
    if (done) await this.flow.hydrate();
    this.busy.set(false);
    const t = this.t();
    if (!failure) {
      this.closed.emit();
      this.merged.emit();
      this.snackbar.success(t("qualite.merge.success", { n: done, keep: keep.code }));
    } else if (done) {
      this.closed.emit();
      this.merged.emit();
      this.snackbar.error(t("qualite.merge.partial", { done, keep: keep.code, ...failure }));
    } else {
      this.snackbar.error(t("qualite.merge.failed", failure));
    }
  }
}
