import { Component, computed, effect, inject, input, output, signal, untracked } from "@angular/core";

import { isApiMode } from "@/lib/api/config";
import { fetchAllMembers } from "@/lib/api/members";
import { listOrganisations, orgFromApi } from "@/lib/api/organisations";
import { MOVE_MAX_ITEMS, moveErrorKey, moveToOrganisation, type MoveKind } from "@/lib/api/organisation-move";
import { fetchAllPages } from "@/lib/api/pagination";
import { loadScoopStatsFromApi } from "@/lib/api/session";
import type { MessageKey } from "@/lib/i18n";
import { inScope } from "@/lib/scope";
import { LocaleService } from "./locale.service";
import { ProducerWorkflow } from "./producer-workflow.service";
import { StoreService } from "./store.service";
import { IconComponent, ModalComponent, SelectComponent, SnackbarService, V2_PAGE_STYLES, type SelectOption } from "./ui";

/** Ce qu'on veut déplacer : la sorte, les identifiants et, pour chacun, un libellé, sa coopérative et son organisation actuelle. */
export interface MoveRequest {
  kind: MoveKind;
  ids: string[];
  /** Noms affichés dans la fenêtre, dans le même ordre que `ids`. */
  labels: string[];
  /** Coopérative de chaque élément, dans le même ordre que `ids`. */
  scoopIds: string[];
  /** Organisation actuelle de chaque élément (vide si aucune), dans le même ordre que `ids`. */
  orgIds: string[];
}

const KIND_LABEL: Record<MoveKind, MessageKey> = {
  producers: "deplacer.kind.producers",
  members: "deplacer.kind.members",
};

const PREVIEW_COUNT = 6;

/**
 * « Déplacer vers une organisation » en lot (droit `org.manage` ou `scoop.transfer`, mode API) : choix d'une organisation
 * EXISTANTE, motif facultatif, confirmation, rechargement. Le serveur fait tout en une transaction, garde l'ancienne
 * organisation dans l'historique et note l'opération dans l'audit. Une organisation d'une autre coopérative n'est
 * acceptée qu'avec le droit de transférer vers une coopérative (le serveur vérifie aussi).
 * Ouverte quand `request` est renseigné ; émet `closed` à l'annulation et après le déplacement.
 */
@Component({
  selector: "app-move-to-organisation-modal",
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
      [title]="t()('deplacer.title')"
      [description]="t()('deplacer.description')"
      icon="apartment"
      [width]="600"
      [closeLabel]="t()('common.close')"
      (closed)="close()"
    >
      @if (request(); as current) {
        <p class="lbl">{{ t()("deplacer.selection") }}</p>
        <ul class="preview mt-2">
          @for (label of preview(); track $index) {
            <li class="truncate">{{ label }}</li>
          }
          @if (hiddenCount() > 0) {
            <li class="sub">{{ t()("deplacer.selectionMore", { count: hiddenCount() }) }}</li>
          }
        </ul>

        <p class="lbl mt-5">{{ t()("deplacer.target.label") }}</p>
        @if (targetOptions().length) {
          <ui-select
            class="mt-2 block"
            leadingIcon="apartment"
            [options]="targetOptions()"
            [value]="target()"
            [placeholder]="t()('deplacer.target.placeholder')"
            [label]="t()('deplacer.target.label')"
            (valueChange)="target.set($event)"
          />
        } @else {
          <p class="sub mt-2">{{ t()("deplacer.target.empty") }}</p>
        }
        @if (changesScoop()) {
          <p class="sub mt-2">
            {{ t()(canTransfer() ? "deplacer.target.otherScoop" : "deplacer.target.otherScoopForbidden") }}
          </p>
        }
        @if (store.can("org.manage")) {
          <p class="sub mt-2">{{ t()("deplacer.target.newHint") }}</p>
        }

        <label class="lbl mt-5 block" for="move-reason">{{ t()("deplacer.reason.label") }}</label>
        <textarea
          id="move-reason"
          class="area mt-2"
          maxlength="500"
          [placeholder]="t()('deplacer.reason.placeholder')"
          [value]="reason()"
          (input)="reason.set($any($event.target).value)"
        ></textarea>

        @if (tooMany()) {
          <p class="notice mt-4" style="background: var(--v2-erreur-bg); color: var(--v2-erreur-fg)" role="alert">
            <ui-icon name="warning" [size]="18" />{{ t()("deplacer.tooMany", { max: max }) }}
          </p>
        } @else if (target()) {
          <p class="mt-4 text-[15px] font-bold">
            {{ t()("deplacer.summary", { count: current.ids.length, kind: t()(kindLabel(current.kind)), target: targetName() }) }}
          </p>
        }
      }
      <button modal-footer type="button" class="btn btn-ghost" [disabled]="busy()" (click)="close()">
        {{ t()("deplacer.cancel") }}
      </button>
      <button modal-footer type="button" class="btn btn-primary" [disabled]="!canConfirm()" (click)="confirm()">
        {{ busy() ? t()("deplacer.running") : t()("deplacer.confirm")
        }}<span class="btn-chip"><ui-icon name="check" [size]="18" /></span>
      </button>
    </ui-modal>
  `,
})
export class MoveToOrganisationModalComponent {
  readonly request = input<MoveRequest | null>(null);
  readonly closed = output<void>();
  /** Émis après un déplacement réussi, une fois les listes rechargées. */
  readonly done = output<void>();

  protected readonly store = inject(StoreService);
  private readonly locale = inject(LocaleService);
  protected readonly t = this.locale.t;
  private readonly snackbar = inject(SnackbarService);
  private readonly flow = inject(ProducerWorkflow);

  protected readonly max = MOVE_MAX_ITEMS;
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

  protected kindLabel(kind: MoveKind): MessageKey {
    return KIND_LABEL[kind];
  }

  protected readonly canTransfer = computed(() => this.store.can("scoop.transfer"));
  protected readonly preview = computed(() => (this.request()?.labels ?? []).slice(0, PREVIEW_COUNT));
  protected readonly hiddenCount = computed(() => Math.max(0, (this.request()?.ids.length ?? 0) - PREVIEW_COUNT));
  protected readonly tooMany = computed(() => (this.request()?.ids.length ?? 0) > MOVE_MAX_ITEMS);

  /** Organisations existantes du périmètre (coopératives actives et coopérative technique), hors celle où tout est déjà. */
  private readonly targets = computed(() => {
    const state = this.store.state();
    const currentOrgIds = [...new Set(this.request()?.orgIds ?? [])];
    const onlyCurrent = currentOrgIds.length === 1 && currentOrgIds[0] ? currentOrgIds[0] : null;
    const allScoops = [...state.scoops.filter((scoop) => !scoop.archived), ...state.technicalScoops];
    const scoopName = new Map(allScoops.map((scoop) => [scoop.id, scoop.name]));
    const technicalIds = new Set(state.technicalScoops.map((scoop) => scoop.id));
    return inScope(state.orgs, state.session)
      .filter((org) => scoopName.has(org.scoopId) && org.id !== onlyCurrent)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((org) => ({ org, scoopLabel: scoopName.get(org.scoopId) ?? "", technical: technicalIds.has(org.scoopId) }));
  });

  protected readonly targetOptions = computed<SelectOption[]>(() =>
    this.targets().map(({ org, scoopLabel, technical }) => ({
      value: org.id,
      label: org.name,
      icon: technical ? "layers" : "apartment",
      hint: scoopLabel,
    })),
  );

  private readonly chosen = computed(() => this.targets().find((entry) => entry.org.id === this.target()) ?? null);
  protected readonly targetName = computed(() => this.chosen()?.org.name ?? "");

  /** L'organisation choisie est-elle dans une autre coopérative que l'un des éléments ? */
  protected readonly changesScoop = computed(() => {
    const entry = this.chosen();
    return !!entry && (this.request()?.scoopIds ?? []).some((scoopId) => scoopId !== entry.org.scoopId);
  });

  protected readonly canConfirm = computed(
    () =>
      isApiMode() &&
      !this.busy() &&
      !!this.request()?.ids.length &&
      !!this.target() &&
      !this.tooMany() &&
      (!this.changesScoop() || this.canTransfer()),
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
      const result = await moveToOrganisation({
        kind: current.kind,
        ids: current.ids,
        targetOrganisationId: this.target(),
        reason: this.reason(),
      });
      await this.reload();
      this.busy.set(false);
      this.snackbar.success(this.t()("deplacer.success", { count: result.moved, target: this.targetName() }));
      this.closed.emit();
      this.done.emit();
    } catch (error) {
      this.busy.set(false);
      this.snackbar.error(this.t()(moveErrorKey(error)));
    }
  }

  /** Recharge ce que le déplacement a pu changer : organisations, producteurs et parcelles, adhérents, chiffres. */
  private async reload(): Promise<void> {
    await Promise.allSettled([
      fetchAllPages(listOrganisations).then((items) => this.store.actions.replaceOrgsFromApi(items.map(orgFromApi))),
      this.flow.hydrate(),
      fetchAllMembers().then((items) => this.store.actions.replaceMembersFromApi(items)),
      loadScoopStatsFromApi(),
    ]);
  }
}
