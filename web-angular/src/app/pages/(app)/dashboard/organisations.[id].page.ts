import { Component, computed, inject, signal } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { map } from "rxjs";

import { isApiMode } from "@/lib/api/config";
import { organisationDraft } from "@/lib/coop-request-templates";
import { describeSourceFact } from "@/lib/data-source";
import { listOrganisations, orgFromApi, organisationApiError, qualifyOrganisations } from "@/lib/api/organisations";
import { fetchAllPages } from "@/lib/api/pagination";
import { ageAtMost, downloadCsv, fmtAge, fmtDate, nf, nf1 } from "@/lib/format";
import type { MessageKey } from "@/lib/i18n";
import { ORG_TYPES, type OrgType, type Producer } from "@/lib/mock/data";
import { inScope } from "@/lib/scope";
import { AccessDeniedError, actions } from "@/lib/store";
import { AppShellComponent } from "@shared/app-shell.component";
import { ContactScoopModalComponent, type CoopRequestTarget } from "@shared/contact-scoop-modal.component";
import { LocaleService } from "@shared/locale.service";
import { OrgTypeHelpComponent } from "@shared/org-type-help.component";
import { createPager } from "@shared/pager";
import { PlotMapComponent } from "@shared/plot-map.component";
import { TransferScoopModalComponent, type TransferRequest } from "@shared/transfer-scoop-modal.component";
import { StoreService } from "@shared/store.service";
import {
  DetailHeroComponent,
  IconComponent,
  initialsOf,
  ModalComponent,
  PaginationComponent,
  SnackbarService,
  StatCardsComponent,
  TONE,
  V2_PAGE_STYLES,
  type HeroBadge,
  type HeroMeta,
  type StatCard,
} from "@shared/ui";

type Tab = "producers" | "members" | "plots";

const QUALITY: Record<Producer["quality"], { label: MessageKey; bg: string; fg: string }> = {
  validé: { label: "producteurs.quality.validé", ...TONE.succes },
  "à vérifier": { label: "producteurs.quality.à vérifier", ...TONE.attente },
  doublon: { label: "producteurs.quality.doublon", ...TONE.info },
  invalide: { label: "producteurs.quality.invalide", ...TONE.erreur },
};
const PLOT_TONE: Record<string, { bg: string; fg: string }> = {
  relevée: TONE.info,
  validée: TONE.succes,
  "à reprendre": TONE.attente,
  chevauchement: TONE.erreur,
};
const MEMBER_TONE: Record<string, { bg: string; fg: string }> = {
  membre: TONE.succes,
  candidat: TONE.info,
  suspendu: TONE.attente,
  sorti: TONE.neutre,
};
const norm = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Fiche organisation (charte V2) : en-tête, chiffres clés, onglets Producteurs / Adhérents / Parcelles
 * (tableaux paginés, carte), qualification du type et export des producteurs (journal d'audit).
 */
@Component({
  selector: "app-organisation-detail-page",
  imports: [
    AppShellComponent,
    ContactScoopModalComponent,
    DetailHeroComponent,
    IconComponent,
    ModalComponent,
    PaginationComponent,
    PlotMapComponent,
    RouterLink,
    StatCardsComponent,
    OrgTypeHelpComponent,
    TransferScoopModalComponent,
  ],
  styles: [
    V2_PAGE_STYLES,
    `
      .tabs {
        width: fit-content;
        max-width: 100%;
      }
      .tabs button {
        padding: 11px 16px;
        font-size: 15px;
      }
      .map {
        height: 360px;
      }
      .alerte {
        display: flex;
        gap: 12px;
        align-items: flex-start;
        border-radius: 18px;
        padding: 14px 16px;
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
      .alerte-titre {
        margin: 0;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .alerte-texte {
        margin: 4px 0 0;
        font-size: 15px;
        font-weight: 600;
        line-height: 1.45;
      }
      .handicap-note {
        display: flex;
        gap: 14px;
        align-items: flex-start;
        margin: 4px 20px 16px;
        border-radius: 18px;
        padding: 14px 18px;
        background: var(--v2-info-bg);
        color: var(--v2-info-fg);
      }
      .handicap-ico {
        display: grid;
        flex: none;
        place-items: center;
        width: 40px;
        height: 40px;
        border-radius: 12px;
        background: color-mix(in oklab, var(--v2-info-fg) 14%, transparent);
      }
      .handicap-title {
        margin: 0;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .handicap-names {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 8px;
      }
      .handicap-name {
        border: 0;
        border-radius: 999px;
        padding: 6px 14px;
        font-size: 14px;
        font-weight: 800;
        cursor: pointer;
        background: var(--v2-blanc);
        color: var(--v2-info-fg);
      }
      .handicap-name:hover {
        text-decoration: underline;
      }
      .handicap-name:focus-visible {
        outline: 2px solid var(--v2-info-fg);
        outline-offset: 2px;
      }
      .handicap-badge {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        border-radius: 999px;
        padding: 4px 11px;
        font-size: 13px;
        font-weight: 800;
        background: var(--v2-info-bg);
        color: var(--v2-info-fg);
      }
      .types {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 8px;
      }
      .type {
        border-radius: 14px;
        border: 1.5px solid var(--v2-bord-carte);
        padding: 12px;
        text-align: left;
        font-size: 14px;
        font-weight: 800;
        cursor: pointer;
      }
      .type:hover {
        border-color: var(--v2-gris-texte);
      }
      .type.on {
        border: 2px solid var(--v2-foret);
        background: var(--v2-sauge);
        padding: 11.5px;
      }
    `,
  ],
  template: `
    <app-shell perm="producer.read" [area]="t()('organisations.detail.area')">
      @if (!org() || !inScopeOrg()) {
        <div class="card mx-auto mt-16 flex max-w-lg flex-col items-center gap-3 p-10 text-center">
          <span
            class="grid size-14 place-items-center rounded-[16px]"
            style="background: var(--v2-attente-bg); color: var(--v2-attente-fg)"
            ><ui-icon name="hub" [size]="26"
          /></span>
          <h1 class="text-[22px] font-extrabold">
            {{
              org() ? t()("organisations.detail.outOfScope") : t()("organisations.detail.notFound")
            }}
          </h1>
          <p class="sub">
            {{
              org()
                ? t()("organisations.detail.outOfScopeHint")
                : t()("organisations.detail.notFoundHint")
            }}
          </p>
          <a class="btn btn-ghost mt-2" routerLink="/dashboard/organisations">{{
            t()("organisations.title")
          }}</a>
        </div>
      } @else {
        @if (org(); as organisation) {
          <ui-detail-hero
            [crumb]="{ label: t()('organisations.title'), link: '/dashboard/organisations' }"
            [title]="organisation.name"
            [mono]="initials(organisation.name)"
            [badges]="heroBadges()"
            [meta]="heroMeta()"
            [backLabel]="t()('organisations.title')"
          >
            @if (canTransfer()) {
              <button hero-actions type="button" class="btn btn-citron" (click)="openTransfer()">
                <ui-icon name="apartment" [size]="18" />{{ t()("transfert.single") }}
              </button>
            }
            @if (store.can("org.manage")) {
              <button hero-actions type="button" class="btn btn-citron" (click)="openType()">
                <ui-icon name="edit" [size]="18" />{{
                  organisation.type
                    ? t()("organisations.detail.changeType")
                    : t()("organisations.detail.qualifyOrg")
                }}
              </button>
            }
          </ui-detail-hero>

          <ui-stat-cards class="rise mt-6" [stats]="stats()" />

          @if (organisation.placementAConfirmer) {
            <div class="alerte rise mt-4" role="note">
              <span class="alerte-ico" aria-hidden="true"><ui-icon name="help" [size]="20" /></span>
              <div class="min-w-0">
                <p class="alerte-titre">{{ t()("placement.badge") }}</p>
                <p class="alerte-texte">{{ organisation.placementNote || t()("placement.noteDefault") }}</p>
              </div>
            </div>
          }

          <div class="rise mt-4 max-w-3xl">
            <app-org-type-help [type]="organisation.type" />
          </div>

          @if (!organisation.type) {
            <div class="alerte rise mt-4" role="note">
              <span class="alerte-ico" aria-hidden="true"><ui-icon name="info" [size]="20" /></span>
              <div class="min-w-0">
                <p class="alerte-titre">{{ t()("cooperatives.fiche.detail.issue") }}</p>
                <p class="alerte-texte">{{ qualifyIssue() }}</p>
                @if (canContact()) {
                  <div class="mt-3 flex flex-wrap justify-end">
                    <button type="button" class="btn btn-ghost" (click)="openContact()">
                      <ui-icon name="mail" [size]="18" />{{ t()("demandes.action") }}
                    </button>
                  </div>
                }
              </div>
            </div>
          }

          <!-- Onglets -->
          <div class="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div
              class="seg tabs"
              role="tablist"
              [attr.aria-label]="t()('organisations.v2.tabs.aria')"
            >
              <button
                type="button"
                role="tab"
                [class.on]="tab() === 'producers'"
                [attr.aria-selected]="tab() === 'producers'"
                (click)="tab.set('producers')"
              >
                <ui-icon name="agriculture" [size]="18" />{{ t()("organisations.v2.tab.producers")
                }}<span class="n" [class.zero]="!producers().length">{{ producers().length }}</span>
              </button>
              <button
                type="button"
                role="tab"
                [class.on]="tab() === 'members'"
                [attr.aria-selected]="tab() === 'members'"
                (click)="tab.set('members')"
              >
                <ui-icon name="group" [size]="18" />{{ t()("organisations.v2.tab.members")
                }}<span class="n" [class.zero]="!members().length">{{ members().length }}</span>
              </button>
              <button
                type="button"
                role="tab"
                [class.on]="tab() === 'plots'"
                [attr.aria-selected]="tab() === 'plots'"
                (click)="tab.set('plots')"
              >
                <ui-icon name="landscape" [size]="18" />{{ t()("organisations.v2.tab.plots")
                }}<span class="n" [class.zero]="!plots().length">{{ plots().length }}</span>
              </button>
            </div>
            @if (tab() === "producers" && producers().length) {
              <button type="button" class="btn btn-ghost" (click)="exportProducers()">
                <ui-icon name="download" [size]="18" />{{
                  t()("organisations.detail.exportMembers")
                }}
              </button>
            }
          </div>

          @if (tab() === "producers") {
            <section class="sec-card mt-4">
              <div class="sec-head">
                <label class="search">
                  <ui-icon name="search" [size]="20" />
                  <input
                    type="search"
                    [placeholder]="t()('organisations.detail.search')"
                    [attr.aria-label]="t()('organisations.detail.search')"
                    [value]="q()"
                    (input)="q.set($any($event.target).value)"
                  />
                </label>
                <div class="seg" role="radiogroup" [attr.aria-label]="t()('organisations.v2.filter.aria')">
                  @for (option of producerFilters(); track option.id) {
                    <button
                      type="button"
                      role="radio"
                      [class.on]="producerFilter() === option.id"
                      [attr.aria-checked]="producerFilter() === option.id"
                      (click)="producerFilter.set(option.id)"
                    >
                      {{ option.label }}<span class="n" [class.zero]="!option.count">{{ option.count }}</span>
                    </button>
                  }
                </div>
              </div>
              @if (handicapped().length) {
                <div class="handicap-note">
                  <span class="handicap-ico" aria-hidden="true"><ui-icon name="accessible" [size]="22" /></span>
                  <div class="min-w-0">
                    <p class="handicap-title">{{ t()("organisations.v2.handicap.title", { count: handicapped().length }) }}</p>
                    <div class="handicap-names">
                      @for (person of handicapped(); track person.id) {
                        <button type="button" class="handicap-name" (click)="openProducer(person.id)">
                          {{ person.firstName }} {{ person.lastName }}
                        </button>
                      }
                    </div>
                  </div>
                </div>
              }
              @if (shownProducers().length) {
                <div class="overflow-x-auto">
                  <table class="tbl min-w-[720px]">
                    <thead>
                      <tr>
                        <th>{{ t()("organisations.v2.col.producer") }}</th>
                        <th>{{ t()("organisations.v2.col.sexAge") }}</th>
                        <th>{{ t()("organisations.v2.col.handicap") }}</th>
                        <th>{{ t()("organisations.detail.col.village") }}</th>
                        <th>{{ t()("organisations.v2.col.status") }}</th>
                        <th>{{ t()("organisations.v2.col.quality") }}</th>
                        <th class="text-right">{{ t()("organisations.col.actions") }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (producer of producerPager.items(); track producer.id) {
                        <tr class="row-link" (click)="openProducer(producer.id)">
                          <td>
                            <span class="flex items-center gap-3">
                              <span
                                class="avatar"
                                [style.background]="
                                  producer.sex === 'F' ? 'var(--v2-culture-bg)' : 'var(--v2-sauge)'
                                "
                                [style.color]="
                                  producer.sex === 'F' ? 'var(--v2-culture-fg)' : 'var(--v2-foret)'
                                "
                                >{{ initials(producer.firstName + " " + producer.lastName) }}</span
                              >
                              <span class="min-w-0">
                                <span class="block truncate font-bold"
                                  >{{ producer.firstName }} {{ producer.lastName }}</span
                                >
                                <span class="mono block" style="color: var(--v2-gris-texte)">{{
                                  producer.code
                                }}</span>
                              </span>
                            </span>
                          </td>
                          <td class="whitespace-nowrap font-medium">
                            {{
                              t()(producer.sex === "F" ? "producteurs.sex.F" : "producteurs.sex.H")
                            }}
                            · {{ fmtAge(producer.age) }}
                          </td>
                          <td>
                            @if (producer.handicap) {
                              <span class="handicap-badge"><ui-icon name="accessible" [size]="15" />{{ t()("organisations.v2.handicap.yes") }}</span>
                            } @else {
                              <span class="sub">—</span>
                            }
                          </td>
                          <td class="font-medium">{{ producer.village }}</td>
                          <td>
                            <span
                              class="badge"
                              [style.background]="
                                producer.status === 'membre'
                                  ? 'var(--v2-culture-bg)'
                                  : 'var(--v2-lin)'
                              "
                              [style.color]="
                                producer.status === 'membre'
                                  ? 'var(--v2-culture-fg)'
                                  : 'var(--v2-gris-texte)'
                              "
                              >{{
                                t()(
                                  producer.status === "membre"
                                    ? "producteurs.status.membre"
                                    : "producteurs.status.recensé"
                                )
                              }}</span
                            >
                          </td>
                          <td>
                            <span
                              class="badge"
                              [style.background]="quality[producer.quality].bg"
                              [style.color]="quality[producer.quality].fg"
                              >{{ t()(quality[producer.quality].label) }}</span
                            >
                          </td>
                          <td>
                            <span class="flex justify-end">
                              <a
                                class="act"
                                [routerLink]="['/dashboard/producteurs', producer.id]"
                                [title]="t()('common.view')"
                                [attr.aria-label]="
                                  t()('organisations.v2.open', {
                                    name: producer.firstName + ' ' + producer.lastName,
                                  })
                                "
                                (click)="$event.stopPropagation()"
                              >
                                <ui-icon name="visibility" [size]="18" />
                              </a>
                            </span>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
                <ui-pagination class="px-5 pb-5" [pager]="producerPager" />
              } @else {
                <p class="sub border-t px-5 py-6" style="border-color: var(--v2-separateur)">
                  {{
                    producers().length
                      ? t()("organisations.detail.noMatch")
                      : t()("organisations.v2.empty.producers")
                  }}
                </p>
              }
            </section>
          }

          @if (tab() === "members") {
            <section class="sec-card mt-4">
              @if (members().length) {
                <div class="overflow-x-auto">
                  <table class="tbl min-w-[600px]">
                    <thead>
                      <tr>
                        <th>{{ t()("cooperatives.fiche.membres.col.name") }}</th>
                        <th>{{ t()("organisations.detail.col.village") }}</th>
                        <th>{{ t()("organisations.v2.col.status") }}</th>
                        <th>{{ t()("organisations.v2.col.joined") }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (member of memberPager.items(); track member.id) {
                        <tr>
                          <td>
                            <span class="flex items-center gap-3">
                              <span class="avatar">{{
                                initials(member.firstName + " " + member.lastName)
                              }}</span>
                              <span class="min-w-0">
                                <span class="block truncate font-bold"
                                  >{{ member.firstName }} {{ member.lastName }}</span
                                >
                                <span class="sub block tabular-nums" [class.zero]="!member.phone">{{
                                  store.phone(member.phone) || "—"
                                }}</span>
                              </span>
                            </span>
                          </td>
                          <td class="font-medium">{{ member.village || "—" }}</td>
                          <td>
                            <span
                              class="badge"
                              [style.background]="memberTone(member.status).bg"
                              [style.color]="memberTone(member.status).fg"
                              >{{ t()(memberKey(member.status)) }}</span
                            >
                          </td>
                          <td class="font-medium tabular-nums" [class.zero]="!member.joinedAt">
                            {{ member.joinedAt ? fmtDate(member.joinedAt) : "—" }}
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
                <ui-pagination class="px-5 pb-5" [pager]="memberPager" />
              } @else {
                <p class="sub px-5 py-6">{{ t()("organisations.v2.empty.members") }}</p>
              }
            </section>
          }

          @if (tab() === "plots") {
            @if (plots().length) {
              <div class="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                @if (store.can("map.read")) {
                  <section class="sec-card">
                    <div class="map">
                      <app-plot-map
                        [plots]="plots()"
                        [selectedId]="selectedPlot() ?? plots()[0]!.id"
                        basemap="sat"
                        [onSelect]="selectPlot"
                      />
                    </div>
                  </section>
                }
                <section class="sec-card">
                  <div class="overflow-x-auto">
                    <table class="tbl min-w-[520px]">
                      <thead>
                        <tr>
                          <th>{{ t()("organisations.v2.col.plot") }}</th>
                          <th>{{ t()("organisations.v2.col.crop") }}</th>
                          <th class="text-right">{{ t()("organisations.v2.col.measured") }}</th>
                          <th>{{ t()("organisations.v2.col.state") }}</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (plot of plotPager.items(); track plot.id) {
                          <tr
                            class="row-link"
                            tabindex="0"
                            [class.font-bold]="selectedPlot() === plot.id"
                            (click)="selectPlot(plot.id)"
                            (keydown.enter)="selectPlot(plot.id)"
                          >
                            <td>
                              <span class="mono" style="color: var(--v2-foret)">{{
                                plot.code
                              }}</span>
                            </td>
                            <td class="font-semibold">{{ plot.crop }}</td>
                            <td class="text-right font-extrabold tabular-nums">
                              {{ nf1.format(plot.measured) }} ha
                            </td>
                            <td>
                              <span
                                class="badge"
                                [style.background]="plotTone(plot.status).bg"
                                [style.color]="plotTone(plot.status).fg"
                                >{{ plot.status }}</span
                              >
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                  <ui-pagination class="px-5 pb-5" [pager]="plotPager" />
                </section>
              </div>
            } @else {
              <p class="card sub mt-4 p-6">{{ t()("organisations.v2.empty.plots") }}</p>
            }
          }

          <!-- Qualifier / modifier le type -->
          <ui-modal
            [open]="typeOpen()"
            [title]="
              organisation.type
                ? t()('organisations.detail.changeType')
                : t()('organisations.detail.qualifyOrg')
            "
            [description]="t()('organisations.detail.dialogHint')"
            icon="hub"
            [width]="560"
            [closeLabel]="t()('common.close')"
            (closed)="typeOpen.set(false)"
          >
            <div
              class="types pb-5"
              role="radiogroup"
              [attr.aria-label]="t()('organisations.detail.chooseType')"
            >
              @for (orgType of orgTypes; track orgType) {
                <button
                  type="button"
                  role="radio"
                  class="type"
                  [class.on]="pickType() === orgType"
                  [attr.aria-checked]="pickType() === orgType"
                  (click)="pickType.set(orgType)"
                >
                  {{ locale.tEnum("organisations.type", orgType) }}
                </button>
              }
            </div>
            <div class="pb-5"><app-org-type-help [showAll]="true" /></div>
            <button modal-footer type="button" class="btn btn-ghost" (click)="typeOpen.set(false)">
              {{ t()("common.cancel") }}
            </button>
            <button
              modal-footer
              type="button"
              class="btn btn-primary"
              [disabled]="!pickType()"
              (click)="saveType(organisation.id)"
            >
              {{ t()("organisations.detail.save")
              }}<span class="btn-chip"><ui-icon name="check" [size]="18" /></span>
            </button>
          </ui-modal>
        }
      }
      <app-transfer-scoop-modal [request]="transferRequest()" (closed)="transferRequest.set(null)" />
      <!-- Contacter la coopérative (mode API, administrateur CRADESC) -->
      <ui-contact-scoop-modal
        [open]="contactTargets().length > 0"
        kind="organisation"
        [targets]="contactTargets()"
        [link]="contactLink()"
        (closed)="contactTargets.set([])"
      />
    </app-shell>
  `,
})
export default class OrganisationDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackbar = inject(SnackbarService);
  protected readonly store = inject(StoreService);
  protected readonly locale = inject(LocaleService);
  protected readonly t = this.locale.t;
  protected readonly nf1 = nf1;
  protected readonly fmtAge = fmtAge;
  protected readonly fmtDate = fmtDate;
  protected readonly initials = initialsOf;
  protected readonly quality = QUALITY;
  protected readonly orgTypes = ORG_TYPES;

  protected readonly tab = signal<Tab>("producers");
  protected readonly q = signal("");
  protected readonly selectedPlot = signal<string | undefined>(undefined);
  protected readonly selectPlot = (id: string) => this.selectedPlot.set(id);
  protected readonly typeOpen = signal(false);
  protected readonly pickType = signal<OrgType | null>(null);

  private readonly id = toSignal(this.route.paramMap.pipe(map((p) => p.get("id") ?? "")), {
    initialValue: "",
  });

  protected readonly org = computed(() => this.store.state().orgs.find((o) => o.id === this.id()));

  /** Mode API, administrateur CRADESC : organisation « à qualifier » → demande au gestionnaire de la coopérative. */
  protected readonly canContact = computed(() => isApiMode() && this.store.can("coop_request.send"));
  protected readonly contactTargets = signal<CoopRequestTarget[]>([]);
  protected readonly contactLink = computed(() => `/dashboard/organisations/${this.id()}`);

  protected openContact(): void {
    const org = this.org();
    if (!org) return;
    this.contactTargets.set([
      {
        scoopId: org.scoopId,
        items: [{ type: "organisation", id: org.id, label: org.name }],
        ...organisationDraft({ name: org.name }),
      },
    ]);
  }

  /** Mode API, droit `scoop.transfer` : l'organisation (avec ses producteurs et adhérents) change de coopérative. */
  protected readonly canTransfer = computed(() => isApiMode() && this.store.can("scoop.transfer"));
  protected readonly transferRequest = signal<TransferRequest | null>(null);

  protected openTransfer(): void {
    const org = this.org();
    if (!org) return;
    this.transferRequest.set({ kind: "organisations", ids: [org.id], labels: [org.name], fromScoopIds: [org.scoopId] });
  }

  protected readonly inScopeOrg = computed(() => {
    const o = this.org();
    return !!o && inScope([o], this.store.state().session).length === 1;
  });

  /** Pourquoi l'organisation est « à qualifier » : le type n'a pas pu être déduit de son nom. */
  protected readonly qualifyIssue = computed(() => {
    const t = this.t();
    const name = (this.org()?.name ?? "").trim();
    if (!name || /^(non pr[ée]cis[ée]e?|n\/?a|inconnu|\?+)$/i.test(name)) return t("cooperatives.fiche.gie.issue.noName");
    if (this.producers().length === 0) return t("cooperatives.fiche.gie.issue.noProducer", { name });
    return t("cooperatives.fiche.gie.issue.unknownType", { name });
  });

  protected readonly producers = computed(() =>
    this.store
      .state()
      .producers.filter((p) => p.orgId === this.id() && !p.mergedInto)
      .sort((a, b) => `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`)),
  );

  /** Producteurs en situation de handicap de l'organisation : leurs noms sont mis en avant au-dessus du tableau. */
  protected readonly handicapped = computed(() =>
    this.producers()
      .filter((producer) => producer.handicap)
      .sort((a, b) => `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`)),
  );

  /** Filtre du tableau des producteurs : tous, handicap, femmes, jeunes ou fiches à vérifier. */
  protected readonly producerFilter = signal<"tous" | "handicap" | "femmes" | "jeunes" | "verifier">("tous");

  private matchesFilter(
    producer: { handicap: boolean; sex: string; age: number | null; quality: string },
    filter: "tous" | "handicap" | "femmes" | "jeunes" | "verifier",
  ): boolean {
    if (filter === "handicap") return producer.handicap;
    if (filter === "femmes") return producer.sex === "F";
    if (filter === "jeunes") return ageAtMost(producer.age, this.store.state().youthMaxAge);
    if (filter === "verifier") return producer.quality !== "validé";
    return true;
  }

  /** Options du filtre avec leur effectif (sur tous les producteurs de l'organisation). */
  protected readonly producerFilters = computed(() => {
    const t = this.t();
    const all = this.producers();
    const options = [
      { id: "tous" as const, label: t("organisations.v2.filter.all") },
      { id: "handicap" as const, label: t("organisations.v2.filter.handicap") },
      { id: "femmes" as const, label: t("organisations.v2.filter.women") },
      { id: "jeunes" as const, label: t("organisations.v2.filter.youth") },
      { id: "verifier" as const, label: t("organisations.v2.filter.toVerify") },
    ];
    return options.map((option) => ({
      ...option,
      count: all.filter((producer) => this.matchesFilter(producer, option.id)).length,
    }));
  });

  protected readonly shownProducers = computed(() => {
    const needle = norm(this.q().trim());
    const filter = this.producerFilter();
    return this.producers().filter(
      (p) =>
        this.matchesFilter(p, filter) &&
        (!needle || norm(`${p.firstName} ${p.lastName} ${p.code} ${p.village}`).includes(needle)),
    );
  });

  protected readonly members = computed(() =>
    this.store
      .state()
      .members.filter((m) => m.orgId === this.id())
      .sort((a, b) => `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`)),
  );

  protected readonly plots = computed(() => {
    const ids = new Set(this.producers().map((p) => p.id));
    return this.store.state().plots.filter((pl) => ids.has(pl.producerId));
  });

  /** Pagination : mêmes règles que l'API (?page=&limit=). */
  protected readonly producerPager = createPager(() => this.shownProducers());
  protected readonly memberPager = createPager(() => this.members());
  protected readonly plotPager = createPager(() => this.plots());

  protected readonly stats = computed<StatCard[]>(() => {
    const t = this.t();
    const ps = this.producers();
    const plots = this.plots();
    const plotIds = new Set(plots.map((pl) => pl.id));
    const ids = new Set(ps.map((p) => p.id));
    const alerts = this.store
      .state()
      .alerts.filter(
        (a) =>
          (ids.has(a.entityId) || plotIds.has(a.entityId)) &&
          (a.status === "ouvert" || a.status === "en vérification"),
      ).length;
    const women = ps.filter((p) => p.sex === "F").length;
    const youthAge = this.store.state().youthMaxAge;
    const youth = ps.filter((p) => ageAtMost(p.age, youthAge)).length;
    const measured = plots.reduce((n, pl) => n + (pl.measured || 0), 0);
    const declared = plots.reduce((n, pl) => n + (pl.declared || 0), 0);
    const toVerify = ps.filter((p) => p.quality !== "validé").length;
    const handicapCount = ps.filter((p) => p.handicap).length;
    return [
      {
        label: t("organisations.col.producers"),
        value: nf.format(ps.length),
        sub: t("organisations.v2.stat.producersSub", {
          women: nf.format(women),
          men: nf.format(ps.length - women),
        }),
        icon: "agriculture",
        bg: "",
        fg: "",
      },
      {
        label: t("organisations.detail.youth", { age: youthAge }),
        value: nf.format(youth),
        sub: t("producteurs.index.stat.shareSub", {
          pct: ps.length ? Math.round((youth / ps.length) * 100) : 0,
        }),
        icon: "grass",
        ...TONE.attente,
      },
      {
        label: t("organisations.detail.measuredArea"),
        value: `${nf1.format(measured)} ha`,
        sub: t("organisations.v2.stat.areaSub", { declared: nf1.format(declared) }),
        icon: "square_foot",
        ...TONE.succes,
      },
      {
        label: t("organisations.v2.stat.handicap"),
        value: nf.format(handicapCount),
        sub: t("producteurs.index.stat.shareSub", {
          pct: ps.length ? Math.round((handicapCount / ps.length) * 100) : 0,
        }),
        icon: "accessible",
        ...(handicapCount ? TONE.info : TONE.neutre),
      },
      {
        label: t("organisations.col.toVerify"),
        value: nf.format(toVerify),
        sub: t("organisations.v2.stat.toVerifySub", { alerts }),
        icon: "warning",
        ...(toVerify ? TONE.erreur : TONE.succes),
      },
    ];
  });

  protected readonly heroBadges = computed<HeroBadge[]>(() => {
    const o = this.org();
    if (!o) return [];
    return [
      o.type
        ? { label: this.locale.tEnum("organisations.type", o.type), tone: "citron", icon: "hub" }
        : { label: this.t()("organisations.toQualify"), tone: "warn", icon: "warning" },
      // Origine lue sur le serveur : base, feuille et ligne du fichier d'origine.
      { label: describeSourceFact(o, this.t()), tone: "glass", icon: "database" },
      ...(o.placementAConfirmer ? [{ label: this.t()("placement.badge"), tone: "warn" as const, icon: "help" as const }] : []),
    ];
  });

  protected readonly heroMeta = computed<HeroMeta[]>(() => {
    const o = this.org();
    if (!o) return [];
    return [
      ...(o.village ? [{ icon: "location_on" as const, text: o.village }] : []),
      { icon: "apartment", text: this.scoopName(o.scoopId) },
      {
        icon: "landscape",
        text: `${nf.format(this.plots().length)} ${this.t()("organisations.v2.tab.plots").toLowerCase()}`,
      },
    ];
  });

  protected scoopName(scoopId: string): string {
    return [...this.store.state().scoops, ...this.store.state().technicalScoops].find((c) => c.id === scoopId)?.name ?? "";
  }

  protected plotTone(status: string) {
    return PLOT_TONE[status] ?? TONE.neutre;
  }

  protected memberTone(status: string) {
    return MEMBER_TONE[status] ?? TONE.neutre;
  }

  protected memberKey(status: string): MessageKey {
    return `cooperatives.fiche.status.${status}` as MessageKey;
  }

  constructor() {
    if (isApiMode()) void this.loadFromApi();
  }

  protected openProducer(id: string): void {
    void this.router.navigate(["/dashboard/producteurs", id]);
  }

  protected openType(): void {
    this.pickType.set(this.org()?.type ?? null);
    this.typeOpen.set(true);
  }

  /** Mode API : l'organisation vient du serveur, pour qu'elle survive au rechargement. */
  private async loadFromApi(): Promise<void> {
    try {
      this.store.actions.replaceOrgsFromApi((await fetchAllPages(listOrganisations)).map(orgFromApi));
    } catch {
      // Serveur injoignable : on garde ce qui est déjà affiché.
    }
  }

  /** Mode API : le type est enregistré sur le serveur, puis relu. */
  private async saveTypeOnApi(id: string, type: OrgType): Promise<void> {
    try {
      await qualifyOrganisations([id], type);
    } catch (e) {
      this.snackbar.error(this.locale.tNow(organisationApiError(e).key));
      return;
    }
    await this.loadFromApi();
    this.typeOpen.set(false);
    this.snackbar.success(
      this.t()("organisations.detail.typeAssigned", {
        type: this.locale.tEnum("organisations.type", type),
      }),
    );
  }

  protected saveType(id: string): void {
    const type = this.pickType();
    if (!type) return;
    if (isApiMode()) {
      void this.saveTypeOnApi(id, type);
      return;
    }
    try {
      actions.qualifyOrgs([id], type);
    } catch (e) {
      this.snackbar.error(e instanceof AccessDeniedError ? this.locale.tNow(e.key) : String(e));
      return;
    }
    this.typeOpen.set(false);
    this.snackbar.success(
      this.t()("organisations.detail.typeAssigned", {
        type: this.locale.tEnum("organisations.type", type),
      }),
    );
  }

  /** Export CSV des producteurs de l'organisation (anonymisé sans le droit d'export nominatif), tracé. */
  protected exportProducers(): void {
    const o = this.org();
    if (!o) return;
    const nominatif = this.store.can("producer.export_nominatif");
    const head = nominatif
      ? ["Code", "Prénom", "Nom", "Sexe", "Âge", "Village", "Statut", "Qualité"]
      : ["Code", "Sexe", "Âge", "Village", "Statut", "Qualité"];
    const rows = this.producers().map((p) =>
      nominatif
        ? [p.code, p.firstName, p.lastName, p.sex, p.age ?? "", p.village, p.status, p.quality]
        : [p.code, p.sex, p.age ?? "", p.village, p.status, p.quality],
    );
    try {
      downloadCsv(`organisation_${o.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.csv`, [
        head,
        ...rows,
      ]);
    } catch {
      this.snackbar.error(this.t()("common.exportError"));
      return;
    }
    actions.audit(
      nominatif ? "Export nominatif" : "Export anonymisé",
      `Organisation ${o.name}`,
      `${rows.length} lignes (CSV)`,
    );
    this.snackbar.success(
      `${this.t()("organisations.exported")} · ${this.t()("organisations.detail.exportedHint")}`,
    );
  }
}
