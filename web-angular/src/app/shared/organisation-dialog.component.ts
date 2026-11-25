import { Component, computed, effect, inject, input, model, signal, untracked } from "@angular/core";

import { isApiMode } from "@/lib/api/config";
import { createOrganisation, orgFromApi, organisationApiError } from "@/lib/api/organisations";
import { ORG_TYPES, type OrgType } from "@/lib/mock/data";
import { inScope } from "@/lib/scope";

import { LocaleService } from "./locale.service";
import { OrgTypeHelpComponent } from "./org-type-help.component";
import { StoreService } from "./store.service";
import { IconComponent } from "./ui/icon.component";
import { ModalComponent } from "./ui/modal.component";
import { SelectComponent, type SelectOption } from "./ui/select.component";
import { SnackbarService } from "./ui/snackbar.service";
import { TextFieldComponent } from "./ui/text-field.component";
import { V2_PAGE_STYLES } from "./ui/v2-page.styles";

/** Type proposé par défaut : « À préciser » est un vrai type, à compléter quand le CRADESC donnera l'information. */
const DEFAULT_TYPE: OrgType = "À préciser";

/**
 * Nouveau GIE ou organisation dans une coopérative (charte V2). Droit `org.manage` ; le serveur vérifie aussi le périmètre.
 * `<app-organisation-dialog [(open)]="orgOpen" [scoopId]="id()" />`
 */
@Component({
  selector: "app-organisation-dialog",
  imports: [IconComponent, ModalComponent, OrgTypeHelpComponent, SelectComponent, TextFieldComponent],
  styles: [
    V2_PAGE_STYLES,
    `
      .lbl {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--v2-ardoise);
      }
    `,
  ],
  template: `
    <ui-modal [open]="open()" [title]="t()('orgs.add.title')" [description]="t()('orgs.add.description')" icon="group" [width]="600" [closeLabel]="t()('common.close')" (closed)="open.set(false)">
      <div class="grid gap-4 pb-6 sm:grid-cols-2">
        @if (!scoopId()) {
          <div class="sm:col-span-2">
            <p class="lbl">{{ t()("roles.dialog.scoop") }}</p>
            <ui-select class="mt-2 block" [label]="t()('roles.dialog.scoop')" [placeholder]="t()('roles.dialog.scoopPh')" leadingIcon="apartment" [options]="scoopOptions()" [value]="chosenScoop()" (valueChange)="chosenScoop.set($event); scoopError.set('')" />
            @if (scoopError()) {
              <p class="mt-1.5 text-[13px] font-bold" style="color: var(--v2-erreur-fg)" role="alert">{{ scoopError() }}</p>
            }
          </div>
        }
        <ui-text-field class="sm:col-span-2" preset="scoopName" [label]="t()('orgs.add.name')" [placeholder]="t()('orgs.add.namePh')" [value]="name()" [error]="nameError()" (valueChange)="name.set($event); nameError.set('')" />
        <div>
          <p class="lbl">{{ t()("orgs.add.type") }}</p>
          <ui-select class="mt-2 block" [label]="t()('orgs.add.type')" leadingIcon="badge" [options]="typeOptions()" [value]="type()" (valueChange)="type.set($event)" />
        </div>
        <ui-text-field preset="village" [label]="t()('orgs.add.village')" [value]="village()" (valueChange)="village.set($event)" />
        <div class="sm:col-span-2">
          <app-org-type-help [type]="type()" />
        </div>
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
  /** Coopérative dans laquelle l'organisation est créée ; sans elle, la personne choisit dans la fenêtre. */
  readonly scoopId = input<string | null>(null);

  private readonly store = inject(StoreService);
  private readonly snackbar = inject(SnackbarService);
  protected readonly t = inject(LocaleService).t;

  protected readonly name = signal("");
  protected readonly type = signal<string>(DEFAULT_TYPE);
  protected readonly village = signal("");
  protected readonly nameError = signal("");
  protected readonly saving = signal(false);
  protected readonly chosenScoop = signal("");
  protected readonly scoopError = signal("");

  /** Coopératives du périmètre qui peuvent recevoir une organisation (hors archivées). */
  protected readonly scoopOptions = computed<SelectOption[]>(() => {
    const state = this.store.state();
    return inScope(
      state.scoops.filter((scoop) => !scoop.archived).map((scoop) => ({ ...scoop, scoopId: scoop.id })),
      state.session,
    )
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((scoop) => ({ value: scoop.id, label: scoop.name, ...(scoop.code ? { hint: scoop.code } : {}) }));
  });

  protected readonly typeOptions = computed<SelectOption[]>(() => [
    ...ORG_TYPES.map((value) => ({ value, label: value })),
  ]);

  constructor() {
    effect(() => {
      if (!this.open()) return;
      untracked(() => {
        this.name.set("");
        this.type.set(DEFAULT_TYPE);
        this.village.set("");
        this.nameError.set("");
        this.scoopError.set("");
        // Une seule coopérative dans le périmètre (gestionnaire) : elle est déjà choisie.
        const options = this.scoopOptions();
        this.chosenScoop.set(this.scoopId() ?? (options.length === 1 ? options[0]!.value : ""));
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
    const scoopId = this.scoopId() ?? this.chosenScoop();
    if (!scoopId) {
      this.scoopError.set(this.t()("errors.roles.scoopRequired"));
      return;
    }
    const type = this.type() as OrgType;
    const village = this.village().trim();
    this.saving.set(true);
    try {
      if (isApiMode()) {
        const created = await createOrganisation({
          scoopId,
          name,
          ...(type && { type }),
          ...(village && { village }),
        });
        this.store.actions.upsertOrgFromApi(orgFromApi(created));
      } else {
        const result = this.store.actions.addOrg({ scoopId, name, type, village });
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
