import { Component, computed, effect, inject, input, output, signal, untracked } from "@angular/core";

import { isApiMode } from "@/lib/api/config";
import { listOrganisations, orgFromApi } from "@/lib/api/organisations";
import { fetchAllMembers } from "@/lib/api/members";
import { fetchAllPages } from "@/lib/api/pagination";
import { loadScoopStatsFromApi } from "@/lib/api/session";
import { TRANSFER_MAX_ITEMS, transferErrorKey, transferToScoop, type TransferKind } from "@/lib/api/scoops";
import type { MessageKey } from "@/lib/i18n";
import { LocaleService } from "./locale.service";
import { ProducerWorkflow } from "./producer-workflow.service";
import { StoreService } from "./store.service";
import { IconComponent, ModalComponent, SelectComponent, SnackbarService, V2_PAGE_STYLES, type SelectOption } from "./ui";

/** Ce qu'on veut transférer : la sorte, les identifiants, des libellés lisibles et les coopératives d'origine. */
export interface TransferRequest {
  kind: TransferKind;
  ids: string[];
  /** Noms affichés dans la fenêtre (organisations, personnes), dans le même ordre que `ids`. */
  labels: string[];
  /** Coopératives où se trouvent aujourd'hui les éléments : la destination ne peut pas être la seule d'entre elles. */
  fromScoopIds: string[];
}

const KIND_LABEL: Record<TransferKind, MessageKey> = {
  organisations: "transfert.kind.organisations",
  producers: "transfert.kind.producers",
  members: "transfert.kind.members",
};

const PREVIEW_COUNT = 6;

/**
 * Transfert en lot vers une autre coopérative (droit `scoop.transfer`, mode API) : choix de la destination parmi les
 * coopératives et, pour qui a le droit, la coopérative technique « Hors coopérative », motif facultatif, confirmation.
 * Le serveur déplace aussi ce qui est rattaché, en une transaction, et note l'opération dans l'audit.
 * Ouverte quand `request` est renseigné ; émet `closed` à l'annulation et après le transfert.
 */
@Component({
  selector: "app-transfer-scoop-modal",
  imports: [IconComponent, ModalComponent, SelectComponent],
  styles: [
    V2_PAGE_STYLES,
    `
      .preview {
        max-height: 160px;
        overflow-y: auto;
        border-radius: 16px;
        border: 1px solid var(--v2-bord-carte);
      }
      .preview li {
        border-top: 1px solid var(--v2-separateur);
        padding: 8px 14px;
        font-size: 14px;
        font-weight: 700;
      }
      .preview li:first-child {
        border-top: 0;
      }
    `,
  ],
  template: `
    <ui-modal
      [open]="!!request()"
      [title]="t()('transfert.title')"
      [description]="t()('transfert.description')"
      icon="apartment"
      [width]="600"
      [closeLabel]="t()('common.close')"
      (closed)="close()"
    >
      @if (request(); as current) {
        <p class="lbl">{{ t()("transfert.selection") }}</p>
        <ul class="preview mt-2">
          @for (label of preview(); track $index) {
            <li class="truncate">{{ label }}</li>
          }
          @if (hiddenCount() > 0) {
            <li class="sub">{{ t()("transfert.selectionMore", { count: hiddenCount() }) }}</li>
          }
        </ul>

        <p class="lbl mt-5">{{ t()("transfert.target.label") }}</p>
        <ui-select
          class="mt-2 block"
          leadingIcon="apartment"
          [options]="targetOptions()"
          [value]="target()"
          [placeholder]="t()('transfert.target.placeholder')"
          [label]="t()('transfert.target.label')"
          (valueChange)="target.set($event)"
        />
        @if (targetIsTechnical()) {
          <p class="sub mt-2">{{ t()("transfert.target.technicalNote") }}</p>
        }
        @if (store.can("scoop.manage")) {
          <p class="sub mt-2">{{ t()("transfert.target.newHint") }}</p>
        }

        <label class="lbl mt-5 block" for="transfer-reason">{{ t()("transfert.reason.label") }}</label>
        <textarea
          id="transfer-reason"
          class="area mt-2"
          maxlength="500"
          [placeholder]="t()('transfert.reason.placeholder')"
          [value]="reason()"
          (input)="reason.set($any($event.target).value)"
        ></textarea>

        @if (tooMany()) {
          <p class="notice mt-4" style="background: var(--v2-erreur-bg); color: var(--v2-erreur-fg)" role="alert">
            <ui-icon name="warning" [size]="18" />{{ t()("transfert.tooMany", { max: max }) }}
          </p>
        } @else if (target()) {
          <p class="mt-4 text-[15px] font-bold">
            {{ t()("transfert.summary", { count: current.ids.length, kind: t()(kindLabel(current.kind)), target: targetName() }) }}
          </p>
        }
      }
      <button modal-footer type="button" class="btn btn-ghost" [disabled]="busy()" (click)="close()">
        {{ t()("transfert.cancel") }}
      </button>
      <button modal-footer type="button" class="btn btn-primary" [disabled]="!canConfirm()" (click)="confirm()">
        {{ busy() ? t()("transfert.running") : t()("transfert.confirm")
        }}<span class="btn-chip"><ui-icon name="check" [size]="18" /></span>
      </button>
    </ui-modal>
  `,
})
export class TransferScoopModalComponent {
  readonly request = input<TransferRequest | null>(null);
  readonly closed = output<void>();
  /** Émis après un transfert réussi, une fois les listes rechargées. */
  readonly done = output<void>();

  protected readonly store = inject(StoreService);
  private readonly locale = inject(LocaleService);
  protected readonly t = this.locale.t;
  private readonly snackbar = inject(SnackbarService);
  private readonly flow = inject(ProducerWorkflow);

  protected readonly max = TRANSFER_MAX_ITEMS;
  protected readonly target = signal("");
  protected readonly reason = signal("");
  protected readonly busy = signal(false);

  constructor() {
    // À chaque ouverture : destination et motif vides.
    effect(() => {
      this.request();
      untracked(() => {
        this.target.set("");
        this.reason.set("");
      });
    });
  }

  protected kindLabel(kind: TransferKind): MessageKey {
    return KIND_LABEL[kind];
  }

  protected readonly preview = computed(() => (this.request()?.labels ?? []).slice(0, PREVIEW_COUNT));
  protected readonly hiddenCount = computed(() => Math.max(0, (this.request()?.ids.length ?? 0) - PREVIEW_COUNT));
  protected readonly tooMany = computed(() => (this.request()?.ids.length ?? 0) > TRANSFER_MAX_ITEMS);

  /** Les coopératives du compte, puis la coopérative technique (le droit de transfert est exigé pour la voir). */
  private readonly targets = computed(() => {
    const state = this.store.state();
    const origin = this.request()?.fromScoopIds ?? [];
    const onlyOrigin = origin.length === 1 ? origin[0] : null;
    const real = state.scoops.filter((scoop) => !scoop.archived);
    const technical = this.store.can("scoop.transfer") ? state.technicalScoops : [];
    return [...real.map((scoop) => ({ scoop, technical: false })), ...technical.map((scoop) => ({ scoop, technical: true }))].filter(
      (entry) => entry.scoop.id !== onlyOrigin,
    );
  });

  protected readonly targetOptions = computed<SelectOption[]>(() =>
    this.targets().map(({ scoop, technical }) => ({
      value: scoop.id,
      label: scoop.name,
      icon: technical ? "layers" : "apartment",
      ...(technical && { hint: this.t()("transfert.target.technicalHint") }),
    })),
  );

  protected readonly targetName = computed(() => this.targets().find((entry) => entry.scoop.id === this.target())?.scoop.name ?? "");
  protected readonly targetIsTechnical = computed(() => !!this.targets().find((entry) => entry.scoop.id === this.target())?.technical);

  protected readonly canConfirm = computed(
    () => isApiMode() && !this.busy() && !!this.request()?.ids.length && !!this.target() && !this.tooMany(),
  );

  protected close() {
    if (this.busy()) return;
    this.closed.emit();
  }

  protected async confirm() {
    const current = this.request();
    if (!current || !this.canConfirm()) return;
    this.busy.set(true);
    try {
      const result = await transferToScoop({
        kind: current.kind,
        ids: current.ids,
        targetScoopId: this.target(),
        reason: this.reason(),
      });
      await this.reload();
      this.busy.set(false);
      this.snackbar.success(
        this.t()("transfert.success", {
          target: this.targetName(),
          organisations: result.moved.organisations,
          producers: result.moved.producers,
          members: result.moved.members,
          plots: result.moved.plots,
        }),
      );
      this.closed.emit();
      this.done.emit();
    } catch (error) {
      this.busy.set(false);
      this.snackbar.error(this.t()(transferErrorKey(error)));
    }
  }

  /** Recharge ce que le transfert a pu déplacer : organisations, producteurs et parcelles, adhérents, chiffres. */
  private async reload(): Promise<void> {
    await Promise.allSettled([
      fetchAllPages(listOrganisations).then((items) => this.store.actions.replaceOrgsFromApi(items.map(orgFromApi))),
      this.flow.hydrate(),
      fetchAllMembers().then((items) => this.store.actions.replaceMembersFromApi(items)),
      loadScoopStatsFromApi(),
    ]);
  }
}
