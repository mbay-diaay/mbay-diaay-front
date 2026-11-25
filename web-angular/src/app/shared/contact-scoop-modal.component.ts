import { Component, computed, effect, inject, input, output, signal, untracked } from "@angular/core";

import {
  COOP_REQUEST_ITEMS_MAX,
  COOP_REQUEST_KINDS,
  COOP_REQUEST_MESSAGE_MAX,
  COOP_REQUEST_SUBJECT_MAX,
  coopRequestErrorKey,
  createCoopRequest,
  getCoopRequestRecipient,
  type CoopRequestDto,
  type CoopRequestItem,
  type CoopRequestKind,
} from "@/lib/api/coop-requests";
import { isDashboardLink, KIND_LABEL_KEY } from "@/lib/coop-request-templates";
import type { MessageKey } from "@/lib/i18n";
import { LocaleService } from "@shared/locale.service";
import { StoreService } from "@shared/store.service";
import {
  IconComponent,
  ModalComponent,
  SelectComponent,
  SnackbarService,
  TextFieldComponent,
  V2_PAGE_STYLES,
  type SelectOption,
} from "@shared/ui";

/** Une demande possible quand les éléments concernés dépendent de plusieurs coopératives (une demande par coopérative). */
export interface CoopRequestTarget {
  scoopId: string;
  items: CoopRequestItem[];
  subject: string;
  message: string;
}

type RecipientState =
  | { status: "idle" | "loading" }
  | { status: "ready"; name: string; email: string; scoopName: string }
  | { status: "none"; scoopName: string }
  | { status: "error"; key: MessageKey };

/** Nombre maximal de pastilles affichées avant « + n autres » (la demande, elle, en garde jusqu'à 50). */
const VISIBLE_ITEMS = 12;

/**
 * Modale « Contacter la coopérative » (mode API) : le CRADESC demande au gestionnaire d'une coopérative de régler
 * un problème de données. Affiche le destinataire (lu sur le serveur), les éléments concernés, puis l'objet et le
 * message préremplis et modifiables. Envoi : `POST /coop-requests` ; toast de succès, ou avertissement si l'e-mail
 * n'a pas pu partir (la demande reste enregistrée).
 *
 * `<ui-contact-scoop-modal [open]="…" [scoopId]="…" kind="doublon" [items]="…" [defaultSubject]="…"
 *   [defaultMessage]="…" link="/dashboard/qualite/doublons" (closed)="…" />`
 * Plusieurs coopératives : passer `targets` (une demande par coopérative, au choix) ; les autres entrées sont alors ignorées.
 */
@Component({
  selector: "ui-contact-scoop-modal",
  imports: [IconComponent, ModalComponent, SelectComponent, TextFieldComponent],
  styles: [
    V2_PAGE_STYLES,
    `
      .recipient {
        display: flex;
        align-items: center;
        gap: 12px;
        border-radius: 18px;
        padding: 14px 16px;
        background: var(--v2-sauge);
        color: var(--v2-foret);
      }
      .recipient.warn {
        background: var(--v2-attente-bg);
        color: var(--v2-attente-fg);
      }
      .recipient.bad {
        background: var(--v2-erreur-bg);
        color: var(--v2-erreur-fg);
      }
      .recipient-ico {
        display: grid;
        flex: none;
        place-items: center;
        width: 36px;
        height: 36px;
        border-radius: 12px;
        background: color-mix(in oklab, currentColor 14%, transparent);
      }
      .recipient-name {
        margin: 0;
        font-size: 15px;
        font-weight: 800;
        line-height: 1.3;
      }
      .recipient-mail {
        margin: 2px 0 0;
        font-size: 14px;
        font-weight: 600;
        word-break: break-all;
      }
      .recipient-text {
        margin: 0;
        font-size: 15px;
        font-weight: 600;
        line-height: 1.45;
      }
      .pills {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .pill-item {
        display: inline-flex;
        max-width: 100%;
        align-items: center;
        border-radius: 999px;
        padding: 4px 12px;
        font-size: 13px;
        font-weight: 700;
        background: var(--v2-creme);
        color: var(--v2-ardoise);
      }
      .reminder {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        border-radius: 18px;
        padding: 12px 16px;
        font-size: 14px;
        font-weight: 600;
        line-height: 1.45;
        background: var(--v2-info-bg);
        color: var(--v2-info-fg);
      }
      .counter {
        font-size: 12px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }
      .area.tall {
        min-height: 210px;
        line-height: 1.5;
      }
    `,
  ],
  template: `
    <ui-modal
      [open]="open()"
      [title]="t()('demandes.modal.title')"
      [description]="t()('demandes.modal.description')"
      icon="mail"
      [width]="640"
      [closeLabel]="t()('common.close')"
      (closed)="close()"
    >
      @if (open()) {
        <div class="grid gap-5">
          @if (targets().length > 1) {
            <div>
              <p class="lbl mb-2">{{ t()("demandes.modal.scoopChoice") }}</p>
              <ui-select
                [options]="targetOptions()"
                [value]="'' + targetIndex()"
                [label]="t()('demandes.modal.scoopChoice')"
                leadingIcon="apartment"
                (valueChange)="targetIndex.set(+$event)"
              />
              <p class="sub mt-2">{{ t()("demandes.modal.scoopChoiceHint") }}</p>
            </div>
          }

          <div>
            <p class="lbl mb-2">{{ t()("demandes.modal.recipient") }}</p>
            @switch (recipient().status) {
              @case ("ready") {
                @if (readyRecipient(); as person) {
                  <div class="recipient" role="status">
                    <span class="recipient-ico" aria-hidden="true"><ui-icon name="person" [size]="20" /></span>
                    <div class="min-w-0">
                      <p class="recipient-name">{{ person.name }}</p>
                      <p class="recipient-mail">{{ person.email }}</p>
                      <p class="sub" style="color: inherit; opacity: 0.8">
                        {{ t()("demandes.modal.recipientOf", { scoop: person.scoopName }) }}
                      </p>
                    </div>
                  </div>
                }
              }
              @case ("none") {
                <div class="recipient warn" role="alert">
                  <span class="recipient-ico" aria-hidden="true"><ui-icon name="warning" [size]="20" /></span>
                  <p class="recipient-text">{{ t()("demandes.err.noManager") }}</p>
                </div>
              }
              @case ("error") {
                <div class="recipient bad" role="alert">
                  <span class="recipient-ico" aria-hidden="true"><ui-icon name="warning" [size]="20" /></span>
                  <p class="recipient-text">{{ errorText() }}</p>
                </div>
              }
              @default {
                <div class="recipient" role="status">
                  <span class="recipient-ico" aria-hidden="true"><ui-icon name="progress_activity" [size]="20" /></span>
                  <p class="recipient-text">{{ t()("demandes.modal.recipientLoading") }}</p>
                </div>
              }
            }
          </div>

          @if (active().items.length) {
            <div>
              <p class="lbl mb-2">{{ t()("demandes.modal.items") }}</p>
              <div class="pills">
                @for (item of visibleItems(); track item.type + item.id) {
                  <span class="pill-item"><span class="truncate">{{ item.label }}</span></span>
                }
                @if (hiddenItems() > 0) {
                  <span class="pill-item">{{ t()("demandes.modal.itemsMore", { n: hiddenItems() }) }}</span>
                }
              </div>
            </div>
          }

          <div>
            <p class="lbl mb-2">{{ t()("demandes.modal.kind") }}</p>
            <ui-select
              [options]="kindOptions()"
              [value]="chosenKind()"
              [label]="t()('demandes.modal.kind')"
              leadingIcon="fact_check"
              (valueChange)="chosenKind.set($any($event))"
            />
          </div>

          <div>
            <ui-text-field
              [label]="t()('demandes.modal.subject')"
              [value]="subject()"
              [maxlength]="subjectMax"
              (valueChange)="subject.set($event)"
            />
          </div>

          <div>
            <div class="flex items-baseline justify-between gap-3">
              <label class="lbl" for="contact-scoop-message">{{ t()("demandes.modal.message") }}</label>
              <span class="sub counter" [style.color]="messageTooLong() ? 'var(--v2-erreur-fg)' : null">{{
                t()("demandes.modal.counter", { n: message().length, max: messageMax })
              }}</span>
            </div>
            <textarea
              id="contact-scoop-message"
              class="area tall mt-2"
              [value]="message()"
              (input)="message.set($any($event.target).value)"
            ></textarea>
          </div>

          <div class="reminder" role="note">
            <ui-icon name="info" [size]="20" />
            <span>{{ t()("demandes.modal.reminder") }}</span>
          </div>
        </div>
      }
      <button modal-footer type="button" class="btn btn-ghost" [disabled]="busy()" (click)="close()">
        {{ t()("common.cancel") }}
      </button>
      <button modal-footer type="button" class="btn btn-primary" [disabled]="!canSend()" (click)="send()">
        {{ busy() ? t()("demandes.modal.sending") : t()("demandes.modal.send")
        }}<span class="btn-chip"><ui-icon name="check" [size]="18" /></span>
      </button>
    </ui-modal>
  `,
})
export class ContactScoopModalComponent {
  readonly open = input(false);
  readonly scoopId = input("");
  readonly kind = input<CoopRequestKind>("autre");
  /** Éléments concernés (libellés sans téléphone ni CNI). */
  readonly items = input<readonly CoopRequestItem[]>([]);
  readonly defaultSubject = input("");
  readonly defaultMessage = input("");
  /** Chemin relatif commençant par `/dashboard/`, joint à la demande. */
  readonly link = input("");
  /** Plusieurs coopératives concernées : une demande par coopérative, au choix. */
  readonly targets = input<readonly CoopRequestTarget[]>([]);
  readonly closed = output<void>();
  /** Émis quand la demande est enregistrée (même si l'e-mail n'a pas pu partir). */
  readonly sent = output<CoopRequestDto>();

  private readonly store = inject(StoreService);
  private readonly locale = inject(LocaleService);
  private readonly snackbar = inject(SnackbarService);
  protected readonly t = this.locale.t;

  protected readonly subjectMax = COOP_REQUEST_SUBJECT_MAX;
  protected readonly messageMax = COOP_REQUEST_MESSAGE_MAX;

  protected readonly targetIndex = signal(0);
  /** Type de la demande : celui que l'écran appelant propose, modifiable avant l'envoi. */
  protected readonly chosenKind = signal<CoopRequestKind>("autre");
  protected readonly kindOptions = computed<SelectOption[]>(() =>
    COOP_REQUEST_KINDS.map((kind) => ({ value: kind, label: this.t()(KIND_LABEL_KEY[kind]) })),
  );
  protected readonly subject = signal("");
  protected readonly message = signal("");
  protected readonly busy = signal(false);
  protected readonly recipient = signal<RecipientState>({ status: "idle" });
  private loadSeq = 0;

  /** Demande en cours de rédaction : la coopérative choisie, ou celle des entrées simples. */
  protected readonly active = computed<CoopRequestTarget>(() => {
    const list = this.targets();
    if (list.length) return list[Math.min(this.targetIndex(), list.length - 1)]!;
    return {
      scoopId: this.scoopId(),
      items: [...this.items()],
      subject: this.defaultSubject(),
      message: this.defaultMessage(),
    };
  });

  private readonly draftKey = computed(() => {
    const target = this.active();
    return JSON.stringify([target.scoopId, target.subject, target.message]);
  });

  protected readonly targetOptions = computed<SelectOption[]>(() =>
    this.targets().map((target, index) => ({
      value: String(index),
      label: this.scoopName(target.scoopId),
      hint: String(target.items.length),
    })),
  );

  protected readonly visibleItems = computed(() => this.active().items.slice(0, VISIBLE_ITEMS));
  protected readonly hiddenItems = computed(() => Math.max(0, this.active().items.length - VISIBLE_ITEMS));
  protected readonly messageTooLong = computed(() => this.message().length > COOP_REQUEST_MESSAGE_MAX);

  protected readonly readyRecipient = computed(() => {
    const state = this.recipient();
    return state.status === "ready" ? state : null;
  });
  protected readonly errorText = computed(() => {
    const state = this.recipient();
    return state.status === "error" ? this.t()(state.key) : "";
  });

  protected readonly canSend = computed(
    () =>
      this.recipient().status === "ready" &&
      !this.busy() &&
      this.subject().trim().length > 0 &&
      this.subject().trim().length <= COOP_REQUEST_SUBJECT_MAX &&
      this.message().trim().length > 0 &&
      this.message().trim().length <= COOP_REQUEST_MESSAGE_MAX,
  );

  constructor() {
    // À chaque ouverture (ou changement de coopérative) : brouillon prérempli et destinataire relu sur le serveur.
    // Clé primitive : un parent qui repasse un tableau neuf à chaque cycle ne réinitialise pas la saisie en cours.
    effect(() => {
      const open = this.open();
      this.draftKey();
      untracked(() => {
        const target = this.active();
        if (!open) {
          this.targetIndex.set(0);
          this.recipient.set({ status: "idle" });
          return;
        }
        this.subject.set(target.subject);
        this.message.set(target.message);
        this.chosenKind.set(this.kind());
        void this.loadRecipient(target.scoopId);
      });
    });
  }

  private scoopName(id: string): string {
    return this.store.state().scoops.find((scoop) => scoop.id === id)?.name ?? "—";
  }

  private async loadRecipient(scoopId: string): Promise<void> {
    const seq = ++this.loadSeq;
    this.recipient.set({ status: "loading" });
    if (!scoopId) {
      this.recipient.set({ status: "none", scoopName: "" });
      return;
    }
    try {
      const res = await getCoopRequestRecipient(scoopId);
      if (seq !== this.loadSeq) return;
      this.recipient.set(
        res.recipient
          ? { status: "ready", name: res.recipient.name, email: res.recipient.email, scoopName: res.scoopName }
          : { status: "none", scoopName: res.scoopName },
      );
    } catch (error) {
      if (seq !== this.loadSeq) return;
      this.recipient.set({ status: "error", key: coopRequestErrorKey(error) });
    }
  }

  protected close(): void {
    if (this.busy()) return;
    this.closed.emit();
  }

  protected async send(): Promise<void> {
    const current = this.recipient();
    if (!this.canSend() || current.status !== "ready") return;
    const target = this.active();
    const link = this.link().trim();
    this.busy.set(true);
    try {
      const created = await createCoopRequest({
        scoopId: target.scoopId,
        kind: this.chosenKind(),
        subject: this.subject().trim(),
        message: this.message().trim(),
        ...(target.items.length ? { items: target.items.slice(0, COOP_REQUEST_ITEMS_MAX) } : {}),
        ...(link && isDashboardLink(link) ? { link } : {}),
      });
      const t = this.t();
      if (created.mailStatus === "non envoyé") this.snackbar.warning(t("demandes.modal.sentNoMail"));
      else this.snackbar.success(t("demandes.modal.sent", { scoop: current.scoopName }));
      this.sent.emit(created);
      this.busy.set(false);
      this.closed.emit();
    } catch (error) {
      this.busy.set(false);
      const key = coopRequestErrorKey(error);
      if (key === "demandes.err.noManager") this.recipient.set({ status: "none", scoopName: current.scoopName });
      this.snackbar.error(this.t()(key));
    }
  }
}
