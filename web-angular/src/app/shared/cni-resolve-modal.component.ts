import { Component, effect, inject, input, output, signal, untracked } from "@angular/core";

import { ALERT_NOTE_MAX, alertErrorKey, resolveQualityAlert, type QualityAlertDto } from "@/lib/api/quality-alerts";
import { LocaleService } from "./locale.service";
import { IconComponent, ModalComponent, SnackbarService, V2_PAGE_STYLES } from "./ui";

/**
 * Résolution manuelle d'une alerte « CNI proches : à vérifier » (`POST /quality/alerts/:id/resolve`, droit
 * `quality.review` ou `alert.manage`). C'est une vérification faite par une personne : aucune fiche n'est modifiée ni
 * fusionnée. La note est facultative et ne doit contenir ni nom, ni téléphone, ni CNI.
 * Ouverte quand `alert` est renseignée ; émet `closed`, puis `resolved` avec l'alerte mise à jour.
 */
@Component({
  selector: "app-cni-resolve-modal",
  imports: [IconComponent, ModalComponent],
  styles: [V2_PAGE_STYLES],
  template: `
    <ui-modal
      [open]="!!alert()"
      [title]="t()('cni.resolve.title')"
      [description]="t()('cni.resolve.description')"
      icon="task_alt"
      [width]="580"
      [closeLabel]="t()('common.close')"
      (closed)="close()"
    >
      @if (alert(); as current) {
        <p class="text-[15px] font-bold">
          {{ current.producerCode ?? current.producerId }}
          @if (current.otherProducerCode) {
            · {{ current.otherProducerCode }}
          }
        </p>
        <label class="lbl mt-4 block" for="cni-resolve-note">{{ t()("cni.resolve.note") }}</label>
        <textarea
          id="cni-resolve-note"
          class="area mt-2"
          [attr.maxlength]="noteMax"
          [placeholder]="t()('cni.resolve.notePlaceholder')"
          [value]="note()"
          (input)="note.set($any($event.target).value)"
        ></textarea>
        <p class="sub mt-2">{{ t()("cni.resolve.noteHint") }}</p>
      }
      <button modal-footer type="button" class="btn btn-ghost" [disabled]="busy()" (click)="close()">
        {{ t()("cni.resolve.cancel") }}
      </button>
      <button modal-footer type="button" class="btn btn-primary" [disabled]="busy()" (click)="confirm()">
        {{ busy() ? t()("cni.resolve.running") : t()("cni.resolve.confirm")
        }}<span class="btn-chip"><ui-icon name="check" [size]="18" /></span>
      </button>
    </ui-modal>
  `,
})
export class CniResolveModalComponent {
  readonly alert = input<QualityAlertDto | null>(null);
  readonly closed = output<void>();
  readonly resolved = output<QualityAlertDto>();

  protected readonly t = inject(LocaleService).t;
  private readonly snackbar = inject(SnackbarService);
  protected readonly noteMax = ALERT_NOTE_MAX;
  protected readonly note = signal("");
  protected readonly busy = signal(false);

  constructor() {
    effect(() => {
      this.alert();
      untracked(() => this.note.set(""));
    });
  }

  protected close(): void {
    if (this.busy()) return;
    this.closed.emit();
  }

  protected async confirm(): Promise<void> {
    const current = this.alert();
    if (!current || this.busy()) return;
    this.busy.set(true);
    try {
      const updated = await resolveQualityAlert(current.id, this.note());
      this.busy.set(false);
      this.snackbar.success(this.t()("cni.resolve.success"));
      this.resolved.emit(updated);
      this.closed.emit();
    } catch (error) {
      this.busy.set(false);
      this.snackbar.error(this.t()(alertErrorKey(error)));
    }
  }
}
