import { Component, computed, effect, inject, input, model, signal, untracked } from "@angular/core";

import { isApiMode } from "@/lib/api/config";
import { createOrganisation, orgFromApi, organisationApiError } from "@/lib/api/organisations";
import type { OrgType } from "@/lib/mock/data";

import { LocaleService } from "./locale.service";
import { StoreService } from "./store.service";
import { IconComponent } from "./ui/icon.component";
import { ModalComponent } from "./ui/modal.component";
import { SelectComponent, type SelectOption } from "./ui/select.component";
import { SnackbarService } from "./ui/snackbar.service";
import { TextFieldComponent } from "./ui/text-field.component";
import { V2_PAGE_STYLES } from "./ui/v2-page.styles";

const ORG_TYPES: readonly OrgType[] = ["GIE", "Section", "Association", "Groupement", "Individuel", "Membre direct"];
const NO_TYPE = "none";

/**
 * Nouveau GIE ou organisation dans une coopérative (charte V2). Droit `org.manage` ; le serveur vérifie aussi le périmètre.
 * `<app-organisation-dialog [(open)]="orgOpen" [scoopId]="id()" />`
 */
@Component({
  selector: "app-organisation-dialog",
  imports: [IconComponent, ModalComponent, SelectComponent, TextFieldComponent],
  styles: [V2_PAGE_STYLES],
  template: `
    <ui-modal [open]="open()" [title]="t()('orgs.add.title')" [description]="t()('orgs.add.description')" icon="group" [width]="600" [closeLabel]="t()('common.close')" (closed)="open.set(false)">
      <div class="grid gap-5 pb-6 sm:grid-cols-2">
        <ui-text-field class="sm:col-span-2" preset="scoopName" [label]="t()('orgs.add.name')" [placeholder]="t()('orgs.add.namePh')" [value]="name()" [error]="nameError()" (valueChange)="name.set($event); nameError.set('')" />
        <ui-select [label]="t()('orgs.add.type')" leadingIcon="badge" [options]="typeOptions()" [value]="type()" (valueChange)="type.set($event)" />
        <ui-text-field preset="village" [label]="t()('orgs.add.village')" [value]="village()" (valueChange)="village.set($event)" />
      </div>
      <button modal-footer type="button" class="btn btn-ghost" (click)="open.set(false)">{{ t()("common.cancel") }}</button>
      <button modal-footer type="button" class="btn btn-primary" [disabled]="saving()" (click)="submit()">
        {{ t()("orgs.add.submit") }}<span class="btn-chip"><ui-icon name="check" [size]="18" /></span>
      </button>
    </ui-modal>
  `,
})
export class OrganisationDialogComponent {
  readonly open = model(false);
  /** Coopérative dans laquelle l'organisation est créée. */
  readonly scoopId = input.required<string>();

  private readonly store = inject(StoreService);
  private readonly snackbar = inject(SnackbarService);
  protected readonly t = inject(LocaleService).t;

  protected readonly name = signal("");
  protected readonly type = signal<string>(NO_TYPE);
  protected readonly village = signal("");
  protected readonly nameError = signal("");
  protected readonly saving = signal(false);

  protected readonly typeOptions = computed<SelectOption[]>(() => [
    ...ORG_TYPES.map((value) => ({ value, label: value })),
    { value: NO_TYPE, label: this.t()("orgs.add.typeNone") },
  ]);

  constructor() {
    effect(() => {
      if (!this.open()) return;
      untracked(() => {
        this.name.set("");
        this.type.set(NO_TYPE);
        this.village.set("");
        this.nameError.set("");
        this.saving.set(false);
      });
    });
  }

  protected async submit(): Promise<void> {
    if (this.saving()) return;
    const name = this.name().trim().replace(/\s+/g, " ");
    if (name.length < 2) {
      this.nameError.set(this.t()("orgs.add.err.name"));
      return;
    }
    const type = this.type() === NO_TYPE ? null : (this.type() as OrgType);
    const village = this.village().trim();
    this.saving.set(true);
    try {
      if (isApiMode()) {
        const created = await createOrganisation({
          scoopId: this.scoopId(),
          name,
          ...(type && { type }),
          ...(village && { village }),
        });
        this.store.actions.upsertOrgFromApi(orgFromApi(created));
      } else {
        const result = this.store.actions.addOrg({ scoopId: this.scoopId(), name, type, village });
        if (!result.ok) {
          this.nameError.set(result.error);
          return;
        }
      }
      this.snackbar.success(this.t()("orgs.add.done"));
      this.open.set(false);
    } catch (error) {
      const { key, field } = organisationApiError(error);
      if (field === "name") this.nameError.set(this.t()(key));
      else this.snackbar.error(this.t()(key));
    } finally {
      this.saving.set(false);
    }
  }
}
