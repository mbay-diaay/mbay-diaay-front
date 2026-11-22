import { Component, computed, effect, inject, input, model, signal, untracked } from "@angular/core";

import { normalizeEmail } from "@/lib/auth/policy";
import { isApiMode } from "@/lib/api/config";
import { addMemberViaApi, memberApiError } from "@/lib/api/members";
import { isSenegalPhone, senegalPhoneDigits } from "@/lib/phone-sn";

import { LocaleService } from "./locale.service";
import { StoreService } from "./store.service";
import { IconComponent } from "./ui/icon.component";
import { ModalComponent } from "./ui/modal.component";
import { SelectComponent, type SelectOption } from "./ui/select.component";
import { SnackbarService } from "./ui/snackbar.service";
import { TextFieldComponent } from "./ui/text-field.component";
import { V2_PAGE_STYLES } from "./ui/v2-page.styles";

type Errors = Partial<Record<"firstName" | "lastName" | "sex" | "phone" | "email" | "age", string>>;
const NO_ORG = "none";

/**
 * Ajouter un adhérent dans une coopérative (charte V2). Droit `member.manage` ; le serveur vérifie aussi le périmètre.
 * `<app-member-dialog [(open)]="memberOpen" [scoopId]="id()" />`
 */
@Component({
  selector: "app-member-dialog",
  imports: [IconComponent, ModalComponent, SelectComponent, TextFieldComponent],
  styles: [
    V2_PAGE_STYLES,
    `
      .modes {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 8px;
      }
      .mode {
        border-radius: 16px;
        border: 1.5px solid var(--v2-bord-carte);
        background: var(--v2-blanc);
        padding: 12px 14px;
        font-size: 14px;
        font-weight: 800;
        cursor: pointer;
      }
      .mode:hover {
        border-color: var(--v2-gris-texte);
      }
      .mode.on {
        border: 2px solid var(--v2-foret);
        background: var(--v2-sauge);
        padding: 11.5px 13.5px;
      }
      .mode:focus-visible {
        outline: 2px solid var(--v2-foret);
        outline-offset: 2px;
      }
      .lbl {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--v2-ardoise);
      }
      .field-err {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 6px;
        font-size: 13px;
        font-weight: 700;
        color: var(--v2-erreur-fg);
      }
    `,
  ],
  template: `
    <ui-modal [open]="open()" [title]="t()('adherents.add.title')" [description]="t()('adherents.add.description')" icon="person_add" [width]="680" [closeLabel]="t()('common.close')" (closed)="open.set(false)">
      <div class="grid gap-5 pb-6 sm:grid-cols-2">
        <ui-text-field preset="firstName" [label]="t()('adherents.add.firstName')" [value]="firstName()" [error]="err().firstName ?? ''" (valueChange)="firstName.set($event); clear('firstName')" />
        <ui-text-field preset="lastName" [label]="t()('adherents.add.lastName')" [value]="lastName()" [error]="err().lastName ?? ''" (valueChange)="lastName.set($event); clear('lastName')" />
        <div>
          <p class="lbl">{{ t()("adherents.add.sex") }}</p>
          <div class="modes mt-2" role="radiogroup" [attr.aria-label]="t()('adherents.add.sex')">
            <button type="button" role="radio" class="mode" [class.on]="sex() === 'F'" [attr.aria-checked]="sex() === 'F'" (click)="sex.set('F'); clear('sex')">{{ t()("adherents.add.female") }}</button>
            <button type="button" role="radio" class="mode" [class.on]="sex() === 'H'" [attr.aria-checked]="sex() === 'H'" (click)="sex.set('H'); clear('sex')">{{ t()("adherents.add.male") }}</button>
          </div>
          @if (err().sex) {
            <p class="field-err"><ui-icon name="warning" [size]="16" />{{ err().sex }}</p>
          }
        </div>
        <ui-text-field preset="age" [label]="t()('adherents.add.age')" [hint]="t()('adherents.add.ageHint')" [value]="age()" [error]="err().age ?? ''" (valueChange)="age.set($event); clear('age')" />
        <ui-text-field preset="phoneSn" [label]="t()('adherents.add.phone')" [value]="phone()" [error]="err().phone ?? ''" (valueChange)="phone.set($event); clear('phone')" />
        <ui-text-field preset="email" [label]="t()('adherents.add.email')" [optional]="t()('utilisateurs.v2.optional')" [hint]="t()('adherents.add.emailHint')" [value]="email()" [error]="err().email ?? ''" (valueChange)="email.set($event); clear('email')" />
        <ui-text-field preset="village" [label]="t()('adherents.add.village')" [value]="village()" (valueChange)="village.set($event)" />
        <ui-select [label]="t()('adherents.add.org')" leadingIcon="group" [options]="orgOptions()" [value]="orgId()" (valueChange)="orgId.set($event)" />
        <div class="sm:col-span-2">
          <p class="lbl">{{ t()("adherents.add.status") }}</p>
          <div class="modes mt-2" role="radiogroup" [attr.aria-label]="t()('adherents.add.status')">
            <button type="button" role="radio" class="mode" [class.on]="status() === 'membre'" [attr.aria-checked]="status() === 'membre'" (click)="status.set('membre')">{{ t()("adherents.status.membre") }}</button>
            <button type="button" role="radio" class="mode" [class.on]="status() === 'candidat'" [attr.aria-checked]="status() === 'candidat'" (click)="status.set('candidat')">{{ t()("adherents.status.candidat") }}</button>
          </div>
        </div>
        <div class="sm:col-span-2">
          <p class="lbl">{{ t()("adherents.add.handicap") }}</p>
          <div class="modes mt-2" role="radiogroup" [attr.aria-label]="t()('adherents.add.handicap')">
            <button type="button" role="radio" class="mode" [class.on]="!handicap()" [attr.aria-checked]="!handicap()" (click)="handicap.set(false)">{{ t()("adherents.add.handicap.non") }}</button>
            <button type="button" role="radio" class="mode" [class.on]="handicap()" [attr.aria-checked]="handicap()" (click)="handicap.set(true)">{{ t()("adherents.add.handicap.oui") }}</button>
          </div>
        </div>
      </div>
      <button modal-footer type="button" class="btn btn-ghost" (click)="open.set(false)">{{ t()("common.cancel") }}</button>
      <button modal-footer type="button" class="btn btn-primary" [disabled]="saving()" (click)="submit()">
        {{ t()("adherents.add.submit") }}<span class="btn-chip"><ui-icon name="check" [size]="18" /></span>
      </button>
    </ui-modal>
  `,
})
export class MemberDialogComponent {
  readonly open = model(false);
  /** Coopérative dans laquelle l'adhérent est ajouté. */
  readonly scoopId = input.required<string>();

  private readonly store = inject(StoreService);
  private readonly snackbar = inject(SnackbarService);
  protected readonly t = inject(LocaleService).t;

  protected readonly firstName = signal("");
  protected readonly lastName = signal("");
  protected readonly sex = signal<"F" | "H" | "">("");
  protected readonly age = signal("");
  protected readonly phone = signal("");
  protected readonly email = signal("");
  protected readonly village = signal("");
  protected readonly orgId = signal(NO_ORG);
  protected readonly status = signal<"membre" | "candidat">("membre");
  protected readonly handicap = signal(false);
  protected readonly err = signal<Errors>({});
  protected readonly saving = signal(false);

  /** GIE et organisations de cette coopérative ; « membre direct » quand aucune n'est choisie. */
  protected readonly orgOptions = computed<SelectOption[]>(() => [
    { value: NO_ORG, label: this.t()("adherents.add.orgHint") },
    ...this.store
      .state()
      .orgs.filter((org) => org.scoopId === this.scoopId())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((org) => ({ value: org.id, label: org.name })),
  ]);

  constructor() {
    effect(() => {
      if (!this.open()) return;
      untracked(() => {
        this.firstName.set("");
        this.lastName.set("");
        this.sex.set("");
        this.age.set("");
        this.phone.set("");
        this.email.set("");
        this.village.set("");
        this.orgId.set(NO_ORG);
        this.status.set("membre");
        this.handicap.set(false);
        this.err.set({});
        this.saving.set(false);
      });
    });
  }

  protected clear(key: keyof Errors): void {
    if (this.err()[key]) this.err.update((current) => ({ ...current, [key]: undefined }));
  }

  private validate(): Errors {
    const t = this.t();
    const errors: Errors = {};
    if (this.firstName().trim().length < 2) errors.firstName = t("members.add.err.firstName");
    if (this.lastName().trim().length < 2) errors.lastName = t("members.add.err.lastName");
    if (!this.sex()) errors.sex = t("members.add.err.sex");
    const age = this.age().trim();
    if (age && !(/^\d{2,3}$/.test(age) && Number(age) >= 15 && Number(age) <= 100)) errors.age = t("adherents.add.ageError");
    const phone = this.phone().trim();
    if (phone && !isSenegalPhone(phone)) errors.phone = t("members.add.err.phone");
    const email = this.email().trim();
    if (email && !normalizeEmail(email)) errors.email = t("members.add.err.email");
    return errors;
  }

  protected async submit(): Promise<void> {
    if (this.saving()) return;
    const errors = this.validate();
    this.err.set(errors);
    if (Object.keys(errors).length) return;
    const sex = this.sex() as "F" | "H";
    const email = normalizeEmail(this.email()) ?? "";
    const phone = senegalPhoneDigits(this.phone());
    const age = this.age().trim() ? Number(this.age().trim()) : undefined;
    const village = this.village().trim();
    const orgId = this.orgId() === NO_ORG ? undefined : this.orgId();
    this.saving.set(true);
    try {
      if (isApiMode()) {
        await addMemberViaApi({
          scoopId: this.scoopId(),
          firstName: this.firstName().trim(),
          lastName: this.lastName().trim(),
          sex,
          ...(phone && { phone }),
          ...(email && { email }),
          ...(age !== undefined && { age }),
          handicap: this.handicap(),
          ...(village && { village }),
          ...(orgId && { orgId }),
          status: this.status(),
        });
      } else {
        this.store.actions.addMember({
          scoopId: this.scoopId(),
          orgId: orgId ?? null,
          firstName: this.firstName().trim(),
          lastName: this.lastName().trim(),
          sex,
          phone,
          email,
          status: this.status(),
          producerId: null,
          ...(age !== undefined && { age }),
          handicap: this.handicap(),
          village,
        });
      }
      this.snackbar.success(this.t()("adherents.add.done"));
      this.open.set(false);
    } catch (error) {
      const { key, field } = memberApiError(error);
      if (field) this.err.update((current) => ({ ...current, [field]: this.t()(key) }));
      else this.snackbar.error(this.t()(key));
    } finally {
      this.saving.set(false);
    }
  }
}
