import { Component, computed, effect, inject, signal, untracked } from "@angular/core";

import { isApiMode } from "@/lib/api/config";
import {
  createReminder,
  deleteReminder,
  fetchAllReminders,
  reminderApiError,
  updateReminder,
  type ReminderCreateBody,
  type ReminderDto,
  type ReminderUpdateBody,
} from "@/lib/api/reminders";
import { ApiError } from "@/lib/api/client";
import { fetchScoopStaff, type ScoopStaffMember } from "@/lib/api/scoops";
import { fmtDate, nf } from "@/lib/format";
import type { MessageKey } from "@/lib/i18n";
import {
  AUDIENCES_BY_KIND,
  canChooseRecipients,
  DAYS_UNIT_KEY,
  DEFAULT_DAYS,
  firstInvalidStep,
  isAudienceAllowed,
  lowerFirst,
  parseReminderDays,
  recipientCountOf,
  recipientIdsOf,
  REMINDER_CHANNEL_CHOICES,
  REMINDER_DAYS_MAX,
  REMINDER_MESSAGE_MAX,
  REMINDER_RULE_KINDS,
  REMINDER_STEPS,
  REMINDER_TITLE_MAX,
  reminderDaysMin,
  reminderExample,
  reminderTemplate,
  reminderWhen,
  defaultAudienceOf,
  validateReminderStep,
  type ReminderAudience,
  type ReminderDraft,
  type ReminderIssueField,
  type ReminderRuleKind,
  type ReminderStep,
} from "@/lib/reminder-templates";
import type { ReminderChannel } from "@/lib/reminders";
import { inScope } from "@/lib/scope";
import { AppShellComponent } from "@shared/app-shell.component";
import { LocaleService } from "@shared/locale.service";
import { createPager } from "@shared/pager";
import { StoreService } from "@shared/store.service";
import {
  detailFact,
  detailKpi,
  DetailModalComponent,
  IconComponent,
  ModalComponent,
  PaginationComponent,
  MultiSelectComponent,
  SelectComponent,
  SnackbarService,
  StatCardsComponent,
  TextFieldComponent,
  TONE,
  V2_PAGE_STYLES,
  type DetailView,
  type IconName,
  type SelectOption,
  type StatCard,
  type Tone,
} from "@shared/ui";

const ALL = "__tous";
/** Initiales (deux lettres au plus) d'un nom, pour la pastille de la fiche de détail. */
const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
const normalize = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Icône, couleur et libellés de chaque type de rappel. */
const KIND_STYLE: Record<
  ReminderRuleKind,
  { icon: IconName; tone: Tone; name: MessageKey; short: MessageKey; text: MessageKey; who: MessageKey }
> = {
  meeting: {
    icon: "event",
    tone: TONE.info,
    name: "rappels.kind.meeting",
    short: "rappels.kind.short.meeting",
    text: "rappels.kind.text.meeting",
    who: "rappels.kind.who.meeting",
  },
  decision: {
    icon: "gavel",
    tone: TONE.attente,
    name: "rappels.kind.decision",
    short: "rappels.kind.short.decision",
    text: "rappels.kind.text.decision",
    who: "rappels.kind.who.decision",
  },
  dossier: {
    icon: "folder_shared",
    tone: TONE.culture,
    name: "rappels.kind.dossier",
    short: "rappels.kind.short.dossier",
    text: "rappels.kind.text.dossier",
    who: "rappels.kind.who.dossier",
  },
  contribution: {
    icon: "payments",
    tone: TONE.succes,
    name: "rappels.kind.contribution",
    short: "rappels.kind.short.contribution",
    text: "rappels.kind.text.contribution",
    who: "rappels.kind.who.contribution",
  },
  custom: {
    icon: "notifications_active",
    tone: TONE.neutre,
    name: "rappels.kind.custom",
    short: "rappels.kind.short.custom",
    text: "rappels.kind.text.custom",
    who: "rappels.kind.who.custom",
  },
};

const AUDIENCE_STYLE: Record<
  ReminderAudience,
  { icon?: IconName; tone: Tone; name: MessageKey; text: MessageKey; to: MessageKey }
> = {
  members: {
    tone: TONE.succes,
    name: "rappels.audience.members",
    text: "rappels.audience.text.members",
    to: "rappels.audience.to.members",
  },
  responsible: {
    tone: TONE.attente,
    name: "rappels.audience.responsible",
    text: "rappels.audience.text.responsible",
    to: "rappels.audience.to.responsible",
  },
  bureau: {
    tone: TONE.info,
    name: "rappels.audience.bureau",
    text: "rappels.audience.text.bureau",
    to: "rappels.audience.to.bureau",
  },
  unpaid: {
    tone: TONE.erreur,
    name: "rappels.audience.unpaid",
    text: "rappels.audience.text.unpaid",
    to: "rappels.audience.to.unpaid",
  },
  manager: {
    tone: TONE.culture,
    name: "rappels.audience.manager",
    text: "rappels.audience.text.manager",
    to: "rappels.audience.to.manager",
  },
  staff: {
    icon: "badge",
    tone: TONE.info,
    name: "rappels.audience.staff",
    text: "rappels.audience.text.staff",
    to: "rappels.audience.to.staff",
  },
};

const CHANNEL_STYLE: Record<ReminderChannel, { icon: IconName; name: MessageKey; text: MessageKey }> = {
  app: { icon: "notifications", name: "rappels.channel.app", text: "rappels.channel.text.app" },
  sms: { icon: "call", name: "rappels.channel.sms", text: "rappels.channel.text.sms" },
  email: { icon: "mail", name: "rappels.channel.email", text: "rappels.channel.text.email" },
};

const RULE_KEYS: Record<ReminderRuleKind, { before: MessageKey; after: MessageKey }> = {
  meeting: { before: "rappels.rule.meeting.before", after: "rappels.rule.meeting.after" },
  decision: { before: "rappels.rule.decision.before", after: "rappels.rule.decision.after" },
  dossier: { before: "rappels.rule.dossier.before", after: "rappels.rule.dossier.after" },
  contribution: { before: "rappels.rule.contribution.before", after: "rappels.rule.contribution.after" },
  custom: { before: "rappels.rule.custom.before", after: "rappels.rule.custom.after" },
};

const STEP_LABEL: Record<ReminderStep, MessageKey> = {
  1: "rappels.step.1",
  2: "rappels.step.2",
  3: "rappels.step.3",
  4: "rappels.step.4",
};
const STEP_LEAD: Record<ReminderStep, MessageKey> = {
  1: "rappels.step.1.lead",
  2: "rappels.step.2.lead",
  3: "rappels.step.3.lead",
  4: "rappels.step.4.lead",
};

const HISTORY_LABEL: Record<string, MessageKey> = {
  created: "rappels.history.created",
  updated: "rappels.history.updated",
  enabled: "rappels.history.enabled",
  paused: "rappels.history.paused",
};

const EMPTY_DRAFT: ReminderDraft = {
  kind: null,
  daysBefore: "",
  scoopIds: [],
  audience: null,
  recipientIds: [],
  channels: ["app"],
  title: "",
  message: "",
};

type StatusFilter = "all" | "enabled" | "paused";

/**
 * Rappels (charte V2) : statistiques, recherche et filtres (type, état, coopérative), tableau paginé avec
 * interrupteur actif / en pause, détail en modale, création et modification pas à pas (4 étapes) dans une modale.
 * Mode API : module `reminders` du serveur (l'envoi automatique n'est pas encore actif, `lastSentAt` reste vide).
 * Mode démonstration : liste gardée en mémoire dans le navigateur.
 */
@Component({
  selector: "app-rappels-page",
  imports: [
    AppShellComponent,
    DetailModalComponent,
    IconComponent,
    ModalComponent,
    MultiSelectComponent,
    PaginationComponent,
    SelectComponent,
    StatCardsComponent,
    TextFieldComponent,
  ],
  styles: [
    V2_PAGE_STYLES,
    `
      .sw {
        position: relative;
        flex: none;
        width: 44px;
        height: 26px;
        border-radius: 999px;
        background: var(--v2-gris-trait);
        cursor: pointer;
        transition: background-color 0.15s ease;
      }
      .sw::after {
        content: "";
        position: absolute;
        top: 3px;
        left: 3px;
        width: 20px;
        height: 20px;
        border-radius: 999px;
        background: var(--v2-blanc);
        box-shadow: 0 1px 3px color-mix(in oklab, var(--v2-encre) 30%, transparent);
        transition: transform 0.15s ease;
      }
      .sw.on {
        background: var(--v2-foret);
      }
      .sw.on::after {
        transform: translateX(18px);
        background: var(--v2-citron);
      }
      .sw:disabled {
        opacity: 0.5;
        cursor: progress;
      }
      .sw:focus-visible {
        outline: 2px solid var(--v2-foret);
        outline-offset: 2px;
      }
      .chip {
        display: grid;
        place-items: center;
        width: 28px;
        height: 28px;
        border-radius: 9px;
        background: var(--v2-lin);
        color: var(--v2-ardoise);
      }
      /* Indicateur d'étapes */
      .stepper {
        display: flex;
        gap: 8px;
        margin: 0 0 20px;
        padding: 0;
        list-style: none;
      }
      .st {
        position: relative;
        flex: 1 1 0;
        min-width: 0;
      }
      .st:not(:last-child)::after {
        content: "";
        position: absolute;
        top: 17px;
        left: calc(50% + 24px);
        right: calc(-50% + 24px);
        height: 2px;
        border-radius: 2px;
        background: var(--v2-gris-trait);
      }
      .st.done:not(:last-child)::after {
        background: var(--v2-foret);
      }
      .st-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        width: 100%;
        padding: 0;
        text-align: center;
        cursor: pointer;
      }
      .st-btn:disabled {
        cursor: default;
      }
      .st-n {
        display: grid;
        place-items: center;
        width: 34px;
        height: 34px;
        border-radius: 999px;
        border: 2px solid var(--v2-gris-trait);
        background: var(--v2-blanc);
        font-size: 14px;
        font-weight: 800;
        color: var(--v2-gris-texte);
      }
      .st.done .st-n {
        border-color: var(--v2-foret);
        background: var(--v2-foret);
        color: var(--v2-citron);
      }
      .st.cur .st-n {
        border-color: var(--v2-foret);
        background: var(--v2-citron);
        color: var(--v2-foret);
        box-shadow: var(--v2-halo);
      }
      .st-l {
        font-size: 13px;
        font-weight: 700;
        line-height: 1.25;
        color: var(--v2-gris-texte);
      }
      .st.cur .st-l,
      .st.done .st-l {
        color: var(--v2-encre);
      }
      .st.cur .st-l {
        font-weight: 800;
      }
      @media (max-width: 639px) {
        .st:not(.cur) .st-l {
          display: none;
        }
        .st.cur {
          flex: 3 1 0;
        }
      }
      /* Cartes de choix (type, destinataires, canaux, coopératives) */
      .kinds {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      }
      .choice {
        position: relative;
        display: flex;
        gap: 12px;
        align-items: flex-start;
        width: 100%;
        border-radius: 18px;
        padding: 14px 16px;
        text-align: left;
        cursor: pointer;
        background: var(--v2-blanc);
        border: 2px solid var(--v2-bord-carte);
        transition:
          border-color 0.15s ease,
          background-color 0.15s ease;
      }
      .choice:hover {
        border-color: var(--v2-gris-texte);
      }
      .choice.on {
        border-color: var(--v2-foret);
        background: var(--v2-sauge);
      }
      .choice:focus-visible,
      .choice:has(input:focus-visible) {
        outline: 3px solid var(--v2-foret);
        outline-offset: 2px;
      }
      .choice input {
        flex: none;
        width: 20px;
        height: 20px;
        margin-top: 2px;
        accent-color: var(--v2-foret);
        cursor: pointer;
      }
      .choice-ico {
        display: grid;
        flex: none;
        place-items: center;
        width: 44px;
        height: 44px;
        border-radius: 14px;
      }
      .choice-name {
        display: block;
        font-size: 15px;
        font-weight: 800;
      }
      .choice-text {
        display: block;
        margin-top: 2px;
        font-size: 13px;
        font-weight: 500;
        line-height: 1.4;
        color: var(--v2-ardoise);
      }
      .choice-who {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-top: 8px;
        border-radius: 999px;
        padding: 2px 10px;
        font-size: 12px;
        font-weight: 700;
        background: var(--v2-lin);
        color: var(--v2-foret);
      }
      .choice.on .choice-who {
        background: var(--v2-blanc);
      }
      .tick {
        position: absolute;
        top: 10px;
        right: 10px;
        display: grid;
        place-items: center;
        width: 22px;
        height: 22px;
        border-radius: 999px;
        background: var(--v2-foret);
        color: var(--v2-citron);
      }
      .choices {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      }
      /* Étape « Quand ? » */
      .rule {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px;
        margin: 0;
        font-size: 17px;
        font-weight: 700;
      }
      .days {
        width: 96px;
        height: 56px;
        border-radius: 16px;
        border: 2px solid var(--v2-gris-trait);
        background: var(--v2-creme);
        padding: 0 10px;
        font-size: 22px;
        font-weight: 800;
        text-align: center;
        color: var(--v2-foret);
        font-variant-numeric: tabular-nums;
      }
      .days:focus-visible {
        outline: none;
        border-color: var(--v2-foret);
        box-shadow: var(--v2-halo);
      }
      .days.bad {
        border-color: var(--v2-erreur-fg);
      }
      .example,
      .recap {
        display: flex;
        gap: 10px;
        align-items: flex-start;
        border-radius: 16px;
        padding: 12px 16px;
        font-size: 14px;
        font-weight: 600;
        line-height: 1.5;
      }
      .example {
        background: var(--v2-info-bg);
        color: var(--v2-info-fg);
      }
      .recap {
        background: var(--v2-sauge);
        color: var(--v2-foret);
      }
      .err {
        display: flex;
        align-items: center;
        gap: 6px;
        margin: 8px 0 0;
        font-size: 13px;
        font-weight: 700;
        color: var(--v2-erreur-fg);
      }
      .link-btn {
        font-size: 13px;
        font-weight: 700;
        color: var(--v2-foret);
        text-decoration: underline;
        text-underline-offset: 3px;
        cursor: pointer;
      }
    `,
  ],
  template: `
    <app-shell perm="notification.configure" [area]="t()('rappels.title')">
      <!-- ───── En-tête ───── -->
      <header class="rise flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div class="min-w-0">
          <p class="mono" style="color: var(--v2-gris-texte)">{{ t()("rappels.eyebrow") }}</p>
          <h1 class="mt-2 text-[30px] font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-[38px]">
            {{ t()("rappels.title") }}
          </h1>
          <p class="mt-2 max-w-2xl text-[16px] font-medium" style="color: var(--v2-gris-texte)">
            {{ t()("rappels.description") }}
          </p>
        </div>
        @if (store.can("notification.configure")) {
          <button type="button" class="btn btn-primary ml-auto" (click)="openCreate()">
            {{ t()("rappels.create") }}<span class="btn-chip"><ui-icon name="add" [size]="20" /></span>
          </button>
        }
      </header>

      @if (apiMode) {
        <p class="notice mt-5" style="background: var(--v2-attente-bg); color: var(--v2-attente-fg)">
          <ui-icon name="warning" [size]="20" />{{ t()("rappels.notice.api") }}
        </p>
      } @else {
        <p class="notice mt-5" style="background: var(--v2-info-bg); color: var(--v2-info-fg)">
          <ui-icon name="info" [size]="20" />{{ t()("rappels.notice.demo") }}
        </p>
      }

      <!-- ───── Statistiques ───── -->
      <ui-stat-cards class="rise mt-6" [stats]="stats()" />

      <!-- ───── Recherche · filtres ───── -->
      <div class="toolbar card mt-6">
        <label class="search">
          <ui-icon name="search" [size]="20" />
          <input
            type="search"
            [placeholder]="t()('rappels.search')"
            [attr.aria-label]="t()('rappels.search')"
            [value]="query()"
            (input)="query.set($any($event.target).value)"
          />
        </label>
        @if (scoopOptions().length > 2) {
          <div class="min-w-[220px]">
            <p class="lbl mb-1">{{ t()("rappels.filter.scoop") }}</p>
            <ui-select
              variant="compact"
              leadingIcon="apartment"
              [options]="scoopOptions()"
              [value]="scoopFilter()"
              (valueChange)="scoopFilter.set($event)"
            />
          </div>
        }
        <div class="seg" role="radiogroup" [attr.aria-label]="t()('rappels.filter.kind')">
          @for (button of kindButtons(); track button.id) {
            <button
              type="button"
              role="radio"
              [class.on]="kindFilter() === button.id"
              [attr.aria-checked]="kindFilter() === button.id"
              (click)="kindFilter.set(button.id)"
            >
              {{ button.label }}<span class="n" [class.zero]="!button.count">{{ nf.format(button.count) }}</span>
            </button>
          }
        </div>
        <div class="seg" role="radiogroup" [attr.aria-label]="t()('rappels.filter.status')">
          @for (button of statusButtons(); track button.id) {
            <button
              type="button"
              role="radio"
              [class.on]="statusFilter() === button.id"
              [attr.aria-checked]="statusFilter() === button.id"
              (click)="statusFilter.set(button.id)"
            >
              {{ button.label }}<span class="n" [class.zero]="!button.count">{{ nf.format(button.count) }}</span>
            </button>
          }
        </div>
      </div>

      <p class="sub mt-4" aria-live="polite">
        {{ t()("rappels.count.autre", { count: shown().length }) }}
      </p>

      <!-- ───── Liste ───── -->
      <section class="card mt-3 overflow-hidden">
        @if (loading()) {
          <p class="sub p-10 text-center">{{ t()("rappels.loading") }}</p>
        } @else if (loadFailed()) {
          <div class="flex flex-col items-center gap-3 p-10 text-center">
            <span
              class="grid size-14 place-items-center rounded-[16px]"
              [style.background]="tone.erreur.bg"
              [style.color]="tone.erreur.fg"
              ><ui-icon name="warning" [size]="26"
            /></span>
            <p class="text-[16px] font-extrabold">{{ t()("rappels.loadError") }}</p>
            <button type="button" class="btn btn-ghost" (click)="reload()">
              <ui-icon name="refresh" [size]="18" />{{ t()("rappels.retry") }}
            </button>
          </div>
        } @else if (shown().length) {
          <div class="overflow-x-auto">
            <table class="tbl min-w-[1000px]">
              <thead>
                <tr>
                  <th>{{ t()("rappels.col.reminder") }}</th>
                  <th>{{ t()("rappels.col.scoop") }}</th>
                  <th>{{ t()("rappels.col.when") }}</th>
                  <th>{{ t()("rappels.col.audience") }}</th>
                  <th>{{ t()("rappels.col.channels") }}</th>
                  <th>{{ t()("rappels.col.status") }}</th>
                  <th>{{ t()("rappels.col.created") }}</th>
                  <th class="text-right">{{ t()("rappels.col.actions") }}</th>
                </tr>
              </thead>
              <tbody>
                @for (reminder of pager.items(); track reminder.id) {
                  <tr class="row-link" [style.opacity]="reminder.enabled ? 1 : 0.75" (click)="detailId.set(reminder.id)">
                    <td class="max-w-[320px]">
                      <span class="flex items-center gap-3">
                        <span
                          class="grid size-10 shrink-0 place-items-center rounded-[12px]"
                          [style.background]="kindStyle[reminder.kind].tone.bg"
                          [style.color]="kindStyle[reminder.kind].tone.fg"
                          [title]="t()(kindStyle[reminder.kind].name)"
                          ><ui-icon [name]="kindStyle[reminder.kind].icon" [size]="20"
                        /></span>
                        <span class="min-w-0">
                          <span class="block truncate font-bold">{{ reminder.title }}</span>
                          <span class="sub block truncate" [class.zero]="!reminder.message">{{
                            reminder.message || "—"
                          }}</span>
                        </span>
                      </span>
                    </td>
                    <td class="max-w-44 truncate font-medium" [title]="reminder.scoopName">
                      {{ reminder.scoopName || "—" }}
                    </td>
                    <td class="max-w-[220px] font-semibold">{{ whenText(reminder) }}</td>
                    <td>
                      <span
                        class="badge"
                        [style.background]="audienceStyle[reminder.audience].tone.bg"
                        [style.color]="audienceStyle[reminder.audience].tone.fg"
                        >{{ t()(audienceStyle[reminder.audience].name) }}</span
                      >
                      @if (recipientsCount(reminder); as count) {
                        <span class="sub block">{{ countText(count) }}</span>
                      }
                    </td>
                    <td>
                      <span class="flex gap-1.5">
                        @for (channel of reminder.channels; track channel) {
                          <span class="chip" [title]="t()(channelStyle[channel].name)"
                            ><ui-icon [name]="channelStyle[channel].icon" [size]="16"
                          /></span>
                        }
                      </span>
                    </td>
                    <td>
                      <span class="flex items-center gap-3">
                        <button
                          type="button"
                          role="switch"
                          class="sw"
                          [class.on]="reminder.enabled"
                          [attr.aria-checked]="reminder.enabled"
                          [attr.aria-label]="
                            t()(reminder.enabled ? 'rappels.switch.pause' : 'rappels.switch.enable', {
                              title: reminder.title,
                            })
                          "
                          [disabled]="busyId() === reminder.id"
                          (click)="$event.stopPropagation(); toggle(reminder)"
                        ></button>
                        <span
                          class="badge"
                          [style.background]="reminder.enabled ? tone.succes.bg : tone.neutre.bg"
                          [style.color]="reminder.enabled ? tone.succes.fg : tone.neutre.fg"
                          >{{ t()(reminder.enabled ? "rappels.status.enabled" : "rappels.status.paused") }}</span
                        >
                      </span>
                    </td>
                    <td class="whitespace-nowrap font-medium">{{ fmtDate(reminder.createdAt) }}</td>
                    <td>
                      <span class="flex justify-end gap-2">
                        <button
                          type="button"
                          class="act"
                          [title]="t()('common.view')"
                          [attr.aria-label]="t()('rappels.action.view', { title: reminder.title })"
                          (click)="$event.stopPropagation(); detailId.set(reminder.id)"
                        >
                          <ui-icon name="visibility" [size]="18" />
                        </button>
                        <button
                          type="button"
                          class="act"
                          [title]="t()('rappels.detail.edit')"
                          [attr.aria-label]="t()('rappels.action.edit', { title: reminder.title })"
                          (click)="$event.stopPropagation(); openEdit(reminder)"
                        >
                          <ui-icon name="edit" [size]="18" />
                        </button>
                        <button
                          type="button"
                          class="act act-danger"
                          [title]="t()('rappels.delete.confirm')"
                          [attr.aria-label]="t()('rappels.action.delete', { title: reminder.title })"
                          (click)="$event.stopPropagation(); deleteTarget.set(reminder)"
                        >
                          <ui-icon name="delete" [size]="18" />
                        </button>
                      </span>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <ui-pagination class="px-5 pb-5" [pager]="pager" />
        } @else if (!items().length) {
          <div class="flex flex-col items-center gap-3 p-10 text-center">
            <span
              class="grid size-14 place-items-center rounded-[16px]"
              style="background: var(--v2-sauge); color: var(--v2-foret)"
              ><ui-icon name="notifications_active" [size]="26"
            /></span>
            <p class="text-[16px] font-extrabold">{{ t()("rappels.empty.none.title") }}</p>
            <p class="sub max-w-md">{{ t()("rappels.empty.none.hint") }}</p>
            @if (store.can("notification.configure")) {
              <button type="button" class="btn btn-primary mt-2" (click)="openCreate()">
                {{ t()("rappels.create") }}<span class="btn-chip"><ui-icon name="add" [size]="20" /></span>
              </button>
            }
          </div>
        } @else {
          <div class="flex flex-col items-center gap-3 p-10 text-center">
            <span
              class="grid size-14 place-items-center rounded-[16px]"
              style="background: var(--v2-sauge); color: var(--v2-foret)"
              ><ui-icon name="search" [size]="26"
            /></span>
            <p class="text-[16px] font-extrabold">{{ t()("rappels.empty.filtered.title") }}</p>
            <p class="sub">{{ t()("rappels.empty.filtered.hint") }}</p>
            <button type="button" class="btn btn-ghost mt-1" (click)="resetFilters()">
              {{ t()("rappels.empty.filtered.reset") }}
            </button>
          </div>
        }
      </section>

      <!-- ───── Détail ───── -->
      <ui-detail-modal [view]="detail()" (closed)="detailId.set(null)">
        @if (detailReminder(); as reminder) {
          @if (store.can("notification.configure")) {
            <button detail-actions type="button" class="btn btn-primary" (click)="editFromDetail(reminder)">
              {{ t()("rappels.detail.edit") }}<span class="btn-chip"><ui-icon name="edit" [size]="18" /></span>
            </button>
          }
        }
      </ui-detail-modal>

      <!-- ───── Création et modification pas à pas ───── -->
      @if (formOpen()) {
        <ui-modal
          [open]="true"
          [title]="t()(editing() ? 'rappels.form.editTitle' : 'rappels.form.createTitle')"
          [description]="t()('rappels.form.description')"
          icon="notifications_active"
          [width]="880"
          [closeLabel]="t()('common.close')"
          (closed)="closeForm()"
        >
          <ol class="stepper" [attr.aria-label]="t()('rappels.step.of', { step: step(), total: steps.length })">
            @for (number of steps; track number) {
              <li class="st" [class.cur]="step() === number" [class.done]="step() > number">
                <button
                  type="button"
                  class="st-btn"
                  [disabled]="number >= step()"
                  [attr.aria-current]="step() === number ? 'step' : null"
                  (click)="goToStep(number)"
                >
                  <span class="st-n">
                    @if (step() > number) {
                      <ui-icon name="check" [size]="18" />
                    } @else {
                      {{ number }}
                    }
                  </span>
                  <span class="st-l"
                    >{{ t()(stepLabel[number])
                    }}@if (step() > number) {
                      <span class="sr-only"> ({{ t()("rappels.step.done") }})</span>
                    }</span
                  >
                </button>
              </li>
            }
          </ol>

          <h3 class="text-[18px] font-extrabold">{{ t()(stepLabel[step()]) }}</h3>
          <p class="sub mb-4 mt-1">{{ t()(stepLead[step()]) }}</p>

          @switch (step()) {
            @case (1) {
              <div class="kinds" role="radiogroup" [attr.aria-label]="t()('rappels.step.1')">
                @for (kind of kinds; track kind) {
                  <button
                    type="button"
                    role="radio"
                    class="choice"
                    [class.on]="draft().kind === kind"
                    [attr.aria-checked]="draft().kind === kind"
                    (click)="selectKind(kind)"
                  >
                    <span
                      class="choice-ico"
                      [style.background]="kindStyle[kind].tone.bg"
                      [style.color]="kindStyle[kind].tone.fg"
                      ><ui-icon [name]="kindStyle[kind].icon" [size]="24"
                    /></span>
                    <span class="min-w-0">
                      <span class="choice-name">{{ t()(kindStyle[kind].name) }}</span>
                      <span class="choice-text">{{ t()(kindStyle[kind].text) }}</span>
                      <span class="choice-who"><ui-icon name="group" [size]="14" />{{ t()(kindStyle[kind].who) }}</span>
                    </span>
                    @if (draft().kind === kind) {
                      <span class="tick" aria-hidden="true"><ui-icon name="check" [size]="14" /></span>
                    }
                  </button>
                }
              </div>
              @if (issueText("kind"); as message) {
                <p class="err" role="alert"><ui-icon name="warning" [size]="16" />{{ message }}</p>
              }
            }
            @case (2) {
              @if (draft().kind; as kind) {
                <p class="rule">
                  <span>{{ t()(ruleKeys[kind].before) }}</span>
                  <input
                    class="days"
                    type="number"
                    inputmode="numeric"
                    [class.bad]="!!issueText('daysBefore')"
                    [attr.aria-label]="t()('rappels.days.label')"
                    [attr.min]="daysMin()"
                    [attr.max]="daysMax"
                    [value]="draft().daysBefore"
                    (input)="patchDraft({ daysBefore: $any($event.target).value })"
                  />
                  <span>{{ ruleAfter() }}</span>
                </p>
                @if (issueText("daysBefore"); as message) {
                  <p class="err" role="alert"><ui-icon name="warning" [size]="16" />{{ message }}</p>
                }
                <p class="sub mt-2">{{ t()("rappels.days.range", { min: daysMin(), max: daysMax }) }}</p>
                <p class="example mt-4" aria-live="polite">
                  <ui-icon name="info" [size]="18" />
                  <span
                    ><strong>{{ t()("rappels.example.title") }}.</strong> {{ exampleText() }}</span
                  >
                </p>
                @if (kind === "dossier") {
                  <p class="sub mt-3">{{ t()("rappels.days.dossierNote") }}</p>
                }
              }
            }
            @case (3) {
              <section>
                <p class="lbl">{{ t()("rappels.form.scoops") }}</p>
                @if (editing()) {
                  <p class="sub mt-1">{{ t()("rappels.form.scoopsHelp.edit") }}</p>
                  <p class="mt-2 flex items-center gap-2 font-bold">
                    <ui-icon name="apartment" [size]="18" />{{ editing()!.scoopName || "—" }}
                  </p>
                } @else if (scopeScoops().length > 1) {
                  <p class="sub mt-1">{{ t()("rappels.form.scoopsHelp.many") }}</p>
                  <ui-multi-select
                    class="mt-2"
                    [label]="t()('rappels.form.scoops')"
                    [options]="scoopChoices()"
                    [values]="draft().scoopIds"
                    [placeholder]="t()('rappels.form.scoopsPlaceholder')"
                    leadingIcon="apartment"
                    (valuesChange)="patchDraft({ scoopIds: $event })"
                  />
                } @else {
                  <p class="sub mt-1">{{ t()("rappels.form.scoopsHelp.one") }}</p>
                  <p class="mt-2 flex items-center gap-2 font-bold">
                    <ui-icon name="apartment" [size]="18" />{{ scopeScoops()[0]?.name ?? "—" }}
                  </p>
                }
                @if (issueText("scoopIds"); as message) {
                  <p class="err" role="alert"><ui-icon name="warning" [size]="16" />{{ message }}</p>
                }
              </section>

              <section class="mt-6">
                <p class="lbl mb-2">{{ t()("rappels.form.audience") }}</p>
                <div class="choices" role="radiogroup" [attr.aria-label]="t()('rappels.form.audience')">
                  @for (audience of allowedAudiences(); track audience) {
                    <button
                      type="button"
                      role="radio"
                      class="choice"
                      [class.on]="draft().audience === audience"
                      [attr.aria-checked]="draft().audience === audience"
                      (click)="patchDraft({ audience })"
                    >
                      <span class="min-w-0">
                        <span
                          class="badge"
                          [style.background]="audienceStyle[audience].tone.bg"
                          [style.color]="audienceStyle[audience].tone.fg"
                          >@if (audienceStyle[audience].icon; as icon) {
                            <ui-icon [name]="icon" [size]="14" />
                          }{{ t()(audienceStyle[audience].name) }}</span
                        >
                        <span class="choice-text">{{ t()(audienceStyle[audience].text) }}</span>
                      </span>
                      @if (draft().audience === audience) {
                        <span class="tick" aria-hidden="true"><ui-icon name="check" [size]="14" /></span>
                      }
                    </button>
                  }
                </div>
                @if (issueText("audience"); as message) {
                  <p class="err" role="alert"><ui-icon name="warning" [size]="16" />{{ message }}</p>
                }
                @if (draft().audience === "staff") {
                  @if (canChoose()) {
                    <div class="mt-4">
                      <p class="lbl">{{ t()("rappels.recipients.label") }}</p>
                      @switch (staffStatus()) {
                        @case ("loading") {
                          <p class="sub mt-2">{{ t()("rappels.recipients.loading") }}</p>
                        }
                        @case ("error") {
                          <p class="err" role="alert">
                            <ui-icon name="warning" [size]="16" />{{ t()("rappels.recipients.error") }}
                          </p>
                        }
                        @default {
                          @if (!staffChoices().length) {
                            <p class="sub mt-2">{{ t()("rappels.recipients.none") }}</p>
                          } @else {
                            <ui-multi-select
                              class="mt-2"
                              [label]="t()('rappels.recipients.label')"
                              [options]="staffChoices()"
                              [values]="draft().recipientIds"
                              [placeholder]="t()('rappels.recipients.placeholder')"
                              leadingIcon="badge"
                              (valuesChange)="patchDraft({ recipientIds: $event })"
                            />
                            <p class="sub mt-2">{{ t()("rappels.recipients.help") }}</p>
                          }
                        }
                      }
                      @if (issueText("recipients"); as message) {
                        <p class="err" role="alert"><ui-icon name="warning" [size]="16" />{{ message }}</p>
                      }
                    </div>
                  } @else if (draft().scoopIds.length > 1) {
                    <p class="example mt-4">
                      <ui-icon name="info" [size]="18" /><span>{{ t()("rappels.recipients.many") }}</span>
                    </p>
                  }
                }
              </section>

              <section class="mt-6">
                <p class="lbl">{{ t()("rappels.form.channels") }}</p>
                <p class="sub mb-2 mt-1">{{ t()("rappels.form.channelsHelp") }}</p>
                <div class="choices">
                  @for (channel of channelChoices; track channel) {
                    <label class="choice" [class.on]="draft().channels.includes(channel)">
                      <input
                        type="checkbox"
                        [checked]="draft().channels.includes(channel)"
                        (change)="toggleChannel(channel, $any($event.target).checked)"
                      />
                      <span class="min-w-0">
                        <span class="choice-name flex items-center gap-2"
                          ><ui-icon [name]="channelStyle[channel].icon" [size]="18" />{{
                            t()(channelStyle[channel].name)
                          }}</span
                        >
                        <span class="choice-text">{{ t()(channelStyle[channel].text) }}</span>
                      </span>
                    </label>
                  }
                </div>
                @if (issueText("channels"); as message) {
                  <p class="err" role="alert"><ui-icon name="warning" [size]="16" />{{ message }}</p>
                }
              </section>
            }
            @case (4) {
              <ui-text-field
                [label]="t()('rappels.form.title')"
                [value]="draft().title"
                [hint]="t()('rappels.form.titleHint')"
                [error]="issueText('title')"
                [maxlength]="titleMax + 20"
                (valueChange)="editTitle($event)"
              />
              <div class="mt-5">
                <div class="flex items-end justify-between gap-2">
                  <label class="lbl" for="rappel-message">{{ t()("rappels.form.message") }}</label>
                  <button type="button" class="link-btn" (click)="resetTemplate()">
                    {{ t()("rappels.form.resetTemplate") }}
                  </button>
                </div>
                <textarea
                  id="rappel-message"
                  class="area mt-2"
                  rows="5"
                  [value]="draft().message"
                  [attr.aria-invalid]="!!issueText('message')"
                  (input)="editMessage($any($event.target).value)"
                ></textarea>
                <p class="sub mt-1.5">
                  {{ t()("rappels.form.messageHint") }} ·
                  {{ t()("rappels.form.counter", { count: draft().message.length, max: messageMax }) }}
                </p>
                @if (issueText("message"); as message) {
                  <p class="err" role="alert"><ui-icon name="warning" [size]="16" />{{ message }}</p>
                }
              </div>
              @if (!editing()) {
                <label class="check mt-5">
                  <input type="checkbox" [checked]="enabledOnCreate()" (change)="enabledOnCreate.set($any($event.target).checked)" />
                  <span>
                    <span class="block font-extrabold">{{ t()("rappels.form.enabled") }}</span>
                    <span class="sub block">{{ t()("rappels.form.enabledHelp") }}</span>
                  </span>
                </label>
              }
              <p class="recap mt-5" aria-live="polite">
                <ui-icon name="check_circle" [size]="20" />
                <span
                  ><strong>{{ t()("rappels.form.recap.title") }}.</strong> {{ recapText() }}</span
                >
              </p>
            }
          }

          <div class="h-4" aria-hidden="true"></div>
          <div modal-footer class="contents">
            <button type="button" class="btn btn-ghost" [disabled]="saving()" (click)="closeForm()">
              {{ t()("rappels.form.cancel") }}
            </button>
            @if (step() > 1) {
              <button type="button" class="btn btn-ghost" [disabled]="saving()" (click)="previousStep()">
                <ui-icon name="arrow_back" [size]="18" />{{ t()("rappels.form.back") }}
              </button>
            }
            @if (step() < steps.length) {
              <button type="button" class="btn btn-primary" (click)="nextStep()">
                {{ t()("rappels.form.next") }}<span class="btn-chip"><ui-icon name="arrow_forward" [size]="18" /></span>
              </button>
            } @else {
              <button type="button" class="btn btn-primary" [disabled]="saving()" (click)="submit()">
                {{
                  t()(saving() ? "rappels.form.saving" : editing() ? "rappels.form.submitEdit" : "rappels.form.submitCreate")
                }}<span class="btn-chip"><ui-icon name="check" [size]="18" /></span>
              </button>
            }
          </div>
        </ui-modal>
      }

      <!-- ───── Suppression ───── -->
      @if (deleteTarget(); as target) {
        <ui-modal
          tone="danger"
          [open]="true"
          [title]="t()('rappels.delete.title')"
          [description]="t()('rappels.delete.text', { title: target.title })"
          icon="delete"
          [width]="540"
          [closeLabel]="t()('common.close')"
          (closed)="deleteTarget.set(null)"
        >
          <div class="h-2" aria-hidden="true"></div>
          <button modal-footer type="button" class="btn btn-ghost" (click)="deleteTarget.set(null)">
            {{ t()("rappels.delete.keep") }}
          </button>
          <button modal-footer type="button" class="btn btn-danger" [disabled]="saving()" (click)="confirmDelete(target)">
            {{ t()("rappels.delete.confirm") }}
          </button>
        </ui-modal>
      }
    </app-shell>
  `,
})
export default class RappelsPage {
  protected readonly store = inject(StoreService);
  protected readonly locale = inject(LocaleService);
  protected readonly t = this.locale.t;
  private readonly snackbar = inject(SnackbarService);

  protected readonly nf = nf;
  protected readonly fmtDate = fmtDate;
  protected readonly tone = TONE;
  protected readonly apiMode = isApiMode();
  protected readonly kinds = REMINDER_RULE_KINDS;
  protected readonly steps = REMINDER_STEPS;
  protected readonly channelChoices = REMINDER_CHANNEL_CHOICES;
  protected readonly kindStyle = KIND_STYLE;
  protected readonly audienceStyle = AUDIENCE_STYLE;
  protected readonly channelStyle = CHANNEL_STYLE;
  protected readonly ruleKeys = RULE_KEYS;
  protected readonly stepLabel = STEP_LABEL;
  protected readonly stepLead = STEP_LEAD;
  protected readonly daysMax = REMINDER_DAYS_MAX;
  protected readonly titleMax = REMINDER_TITLE_MAX;
  protected readonly messageMax = REMINDER_MESSAGE_MAX;

  // ───── Données ─────
  protected readonly items = signal<ReminderDto[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadFailed = signal(false);
  protected readonly busyId = signal<string | null>(null);
  protected readonly saving = signal(false);

  constructor() {
    if (this.apiMode) void this.reload();
  }

  /** Mode API : toute la liste du périmètre vient du serveur (filtres et pagination côté écran). */
  protected async reload(): Promise<void> {
    this.loading.set(true);
    this.loadFailed.set(false);
    try {
      this.items.set(await fetchAllReminders());
    } catch {
      this.loadFailed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  /** Coopératives du périmètre de la session (toutes pour l'administration, la sienne pour un gestionnaire). */
  protected readonly scopeScoops = computed(() => {
    const state = this.store.state();
    return inScope(
      state.scoops.filter((scoop) => !scoop.archived).map((scoop) => ({ id: scoop.id, name: scoop.name, scoopId: scoop.id })),
      state.session,
    );
  });

  // ───── Filtres ─────
  protected readonly query = signal("");
  protected readonly kindFilter = signal<ReminderRuleKind | typeof ALL>(ALL);
  protected readonly statusFilter = signal<StatusFilter>("all");
  protected readonly scoopFilter = signal<string>(ALL);

  protected readonly scoopOptions = computed<SelectOption[]>(() => [
    { value: ALL, label: this.t()("rappels.filter.scoopAll"), icon: "public" },
    ...this.scopeScoops().map((scoop) => ({ value: scoop.id, label: scoop.name })),
  ]);

  private readonly inChosenScoop = computed(() => {
    const scoopId = this.scoopFilter();
    const list = this.items();
    return scoopId === ALL ? list : list.filter((reminder) => reminder.scoopId === scoopId);
  });

  protected readonly kindButtons = computed(() => {
    const list = this.inChosenScoop().filter(this.matchesStatus);
    return [
      { id: ALL as ReminderRuleKind | typeof ALL, label: this.t()("rappels.filter.all"), count: list.length },
      ...REMINDER_RULE_KINDS.map((kind) => ({
        id: kind as ReminderRuleKind | typeof ALL,
        label: this.t()(KIND_STYLE[kind].short),
        count: list.filter((reminder) => reminder.kind === kind).length,
      })),
    ];
  });

  protected readonly statusButtons = computed(() => {
    const list = this.inChosenScoop().filter((reminder) => this.kindFilter() === ALL || reminder.kind === this.kindFilter());
    return [
      { id: "all" as StatusFilter, label: this.t()("rappels.filter.all"), count: list.length },
      {
        id: "enabled" as StatusFilter,
        label: this.t()("rappels.filter.enabled"),
        count: list.filter((reminder) => reminder.enabled).length,
      },
      {
        id: "paused" as StatusFilter,
        label: this.t()("rappels.filter.paused"),
        count: list.filter((reminder) => !reminder.enabled).length,
      },
    ];
  });

  private readonly matchesStatus = (reminder: ReminderDto): boolean => {
    const status = this.statusFilter();
    return status === "all" || (status === "enabled" ? reminder.enabled : !reminder.enabled);
  };

  protected readonly shown = computed(() => {
    const needle = normalize(this.query().trim());
    const kind = this.kindFilter();
    return this.inChosenScoop()
      .filter(
        (reminder) =>
          (kind === ALL || reminder.kind === kind) &&
          this.matchesStatus(reminder) &&
          (!needle || normalize(reminder.title).includes(needle)),
      )
      .sort((first, second) => second.createdAt.localeCompare(first.createdAt));
  });

  protected readonly pager = createPager(() => this.shown());

  protected resetFilters(): void {
    this.query.set("");
    this.kindFilter.set(ALL);
    this.statusFilter.set("all");
    this.scoopFilter.set(ALL);
  }

  // ───── Statistiques ─────
  protected readonly stats = computed<StatCard[]>(() => {
    const t = this.t();
    const list = this.inChosenScoop();
    const enabled = list.filter((reminder) => reminder.enabled);
    const paused = list.length - enabled.length;
    const kindsSummary = REMINDER_RULE_KINDS.map((kind) => ({
      kind,
      count: enabled.filter((reminder) => reminder.kind === kind).length,
    }))
      .filter((entry) => entry.count > 0)
      .sort((first, second) => second.count - first.count)
      .slice(0, 3)
      .map((entry) => `${t(KIND_STYLE[entry.kind].short)} ${nf.format(entry.count)}`)
      .join(" · ");
    const channelsSummary = REMINDER_CHANNEL_CHOICES.map((channel) => ({
      channel,
      count: enabled.filter((reminder) => reminder.channels.includes(channel)).length,
    }))
      .filter((entry) => entry.count > 0)
      .map((entry) => `${t(CHANNEL_STYLE[entry.channel].name)} ${nf.format(entry.count)}`)
      .join(" · ");
    const lastSent = list.reduce<string | null>(
      (latest, reminder) => (reminder.lastSentAt && (!latest || reminder.lastSentAt > latest) ? reminder.lastSentAt : latest),
      null,
    );
    return [
      {
        label: t("rappels.stat.total"),
        value: nf.format(list.length),
        sub: t("rappels.stat.totalSub", { count: nf.format(enabled.length) }),
        icon: "notifications_active",
        bg: "",
        fg: "",
      },
      {
        label: t("rappels.stat.active"),
        value: nf.format(enabled.length),
        sub: kindsSummary || t("rappels.stat.activeSub.none"),
        icon: "check_circle",
        ...TONE.succes,
      },
      {
        label: t("rappels.stat.paused"),
        value: nf.format(paused),
        sub: paused ? t("rappels.stat.pausedSub") : t("rappels.stat.pausedSub.none"),
        icon: "schedule",
        ...TONE.attente,
      },
      {
        label: t("rappels.stat.lastSent"),
        value: lastSent ? fmtDate(lastSent) : t("rappels.stat.lastSent.none"),
        sub: t("rappels.stat.lastSentSub", { channels: channelsSummary || t("rappels.stat.noChannels") }),
        icon: "mail",
        ...TONE.info,
      },
    ];
  });

  // ───── Libellés ─────
  protected whenText(reminder: ReminderDto): string {
    const when = reminderWhen(reminder.kind, reminder.daysBefore);
    return this.t()(when.key, when.params);
  }

  protected recipientsCount(reminder: ReminderDto): number {
    return recipientCountOf(reminder);
  }

  protected countText(count: number): string {
    return this.t()(count === 1 ? "rappels.audience.count.un" : "rappels.audience.count.autre", { count });
  }

  /** « Mon personnel » ou « Mon personnel · 2 personnes ». */
  protected audienceText(reminder: ReminderDto): string {
    const name = this.t()(AUDIENCE_STYLE[reminder.audience].name);
    const count = recipientCountOf(reminder);
    return count ? `${name} · ${this.countText(count)}` : name;
  }

  // ───── Détail ─────
  protected readonly detailId = signal<string | null>(null);
  protected readonly detailReminder = computed(() => this.items().find((reminder) => reminder.id === this.detailId()) ?? null);

  protected readonly detail = computed<DetailView | null>(() => {
    const reminder = this.detailReminder();
    if (!reminder) return null;
    const t = this.t();
    const kind = KIND_STYLE[reminder.kind];
    const audience = AUDIENCE_STYLE[reminder.audience];
    const history = [...reminder.history].sort((first, second) => second.at.localeCompare(first.at));
    return {
      title: reminder.title,
      subtitle: reminder.scoopName,
      icon: kind.icon,
      badges: [
        { label: t(kind.name), ...kind.tone },
        reminder.enabled
          ? { label: t("rappels.status.enabled"), ...TONE.succes }
          : { label: t("rappels.status.paused"), ...TONE.neutre },
      ],
      kpis: [detailKpi(t("rappels.detail.days"), reminder.daysBefore, "schedule", kind.tone)],
      facts: [
        detailFact(t("rappels.detail.when"), this.whenText(reminder), "event_upcoming", { wide: true }),
        detailFact(t("rappels.detail.audience"), this.audienceText(reminder), "group", { tone: audience.tone }),
        detailFact(
          t("rappels.detail.channels"),
          reminder.channels.map((channel) => t(CHANNEL_STYLE[channel].name)).join(", "),
          "notifications",
        ),
        detailFact(t("rappels.detail.scoop"), reminder.scoopName, "apartment"),
        detailFact(t("rappels.detail.createdBy"), reminder.createdBy, "person"),
        detailFact(t("rappels.detail.createdAt"), fmtDate(reminder.createdAt), "calendar_today"),
        detailFact(
          t("rappels.detail.lastSent"),
          reminder.lastSentAt ? fmtDate(reminder.lastSentAt) : t("rappels.detail.neverSent"),
          "mail",
        ),
        detailFact(t("rappels.detail.message"), reminder.message || t("rappels.detail.noMessage"), "description", {
          wide: true,
        }),
      ],
      sections: [
        ...(reminder.audience === "staff"
          ? [
              {
                title: t("rappels.detail.recipients"),
                icon: "badge" as IconName,
                count: (reminder.recipients ?? []).length || null,
                empty: t("rappels.detail.recipientsEmpty"),
                items: (reminder.recipients ?? []).map((person) => ({ label: person.name, initials: initialsOf(person.name) })),
                more: 0,
              },
            ]
          : []),
        {
          title: t("rappels.detail.history"),
          icon: "history",
          count: history.length,
          empty: t("rappels.detail.historyEmpty"),
          items: history.map((entry) => ({
            label: HISTORY_LABEL[entry.action] ? t(HISTORY_LABEL[entry.action]!) : entry.action,
            sub: `${t("rappels.history.by", { name: entry.by || "—" })} · ${fmtDate(entry.at)}`,
          })),
          more: 0,
        },
      ],
      link: null,
    };
  });

  protected editFromDetail(reminder: ReminderDto): void {
    this.detailId.set(null);
    this.openEdit(reminder);
  }

  // ───── Création et modification pas à pas ─────
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<ReminderDto | null>(null);
  protected readonly step = signal<ReminderStep>(1);
  protected readonly draft = signal<ReminderDraft>({ ...EMPTY_DRAFT });
  protected readonly tried = signal(false);
  protected readonly enabledOnCreate = signal(true);
  private titleTouched = false;
  private messageTouched = false;

  /** Erreurs de l'étape affichée, montrées seulement après un essai pour passer à la suite. */
  private readonly stepIssues = computed(() => (this.tried() ? validateReminderStep(this.step(), this.draft()) : []));

  protected issueText(field: ReminderIssueField): string {
    const issue = this.stepIssues().find((candidate) => candidate.field === field);
    return issue ? this.t()(issue.key, issue.params) : "";
  }

  protected openCreate(): void {
    const scoops = this.scopeScoops();
    this.editing.set(null);
    this.draft.set({ ...EMPTY_DRAFT, channels: ["app"], scoopIds: scoops.length === 1 ? [scoops[0]!.id] : [] });
    this.titleTouched = false;
    this.messageTouched = false;
    this.enabledOnCreate.set(true);
    this.step.set(1);
    this.tried.set(false);
    this.formOpen.set(true);
  }

  protected openEdit(reminder: ReminderDto): void {
    this.editing.set(reminder);
    this.draft.set({
      kind: reminder.kind,
      daysBefore: String(reminder.daysBefore),
      scoopIds: [reminder.scoopId],
      audience: reminder.audience,
      recipientIds: [...(reminder.recipientIds ?? [])],
      channels: [...reminder.channels],
      title: reminder.title,
      message: reminder.message,
    });
    this.titleTouched = true;
    this.messageTouched = true;
    this.step.set(1);
    this.tried.set(false);
    this.formOpen.set(true);
  }

  protected closeForm(): void {
    if (this.saving()) return;
    this.formOpen.set(false);
    this.editing.set(null);
  }

  protected patchDraft(change: Partial<ReminderDraft>): void {
    this.draft.update((draft) => ({ ...draft, ...change }));
  }

  /** Choix du type : jours, destinataires et modèle de message se calent sur le type tant que rien n'a été saisi. */
  protected selectKind(kind: ReminderRuleKind): void {
    const draft = this.draft();
    if (draft.kind === kind) return;
    const template = reminderTemplate(kind);
    this.draft.set({
      ...draft,
      kind,
      daysBefore: String(DEFAULT_DAYS[kind]),
      audience: draft.audience && isAudienceAllowed(kind, draft.audience) ? draft.audience : defaultAudienceOf(kind),
      title: this.titleTouched ? draft.title : template.title,
      message: this.messageTouched ? draft.message : template.message,
    });
    this.tried.set(false);
  }

  protected editTitle(value: string): void {
    this.titleTouched = true;
    this.patchDraft({ title: value });
  }

  protected editMessage(value: string): void {
    this.messageTouched = true;
    this.patchDraft({ message: value });
  }

  protected resetTemplate(): void {
    const kind = this.draft().kind;
    if (!kind) return;
    const template = reminderTemplate(kind);
    this.titleTouched = false;
    this.messageTouched = false;
    this.patchDraft({ title: template.title, message: template.message });
  }

  protected toggleChannel(channel: ReminderChannel, checked: boolean): void {
    this.draft.update((draft) => ({
      ...draft,
      channels: REMINDER_CHANNEL_CHOICES.filter((item) => (item === channel ? checked : draft.channels.includes(item))),
    }));
  }

  /** Coopératives proposées dans le sélecteur multiple de l'étape « Qui et comment ? ». */
  protected readonly scoopChoices = computed<SelectOption[]>(() =>
    this.scopeScoops().map((scoop) => ({ value: scoop.id, label: scoop.name, icon: "apartment" as IconName })),
  );

  // ───── Personnel de la coopérative (audience « mon personnel ») ─────
  protected readonly staffMembers = signal<ScoopStaffMember[]>([]);
  protected readonly staffStatus = signal<"idle" | "loading" | "error" | "ready">("idle");
  private staffScoopId: string | null = null;

  protected canChoose(): boolean {
    return canChooseRecipients(this.draft());
  }

  protected readonly staffChoices = computed<SelectOption[]>(() =>
    this.staffMembers().map((member) => ({ value: member.id, label: member.name, hint: this.store.roleLabel(member.role) })),
  );

  /** Charge (API) ou lit dans le store (démonstration) le personnel de l'unique coopérative choisie. */
  private readonly staffLoader = effect(() => {
    const draft = this.draft();
    const open = this.formOpen();
    const scoopId = open && canChooseRecipients(draft) ? draft.scoopIds[0]! : null;
    untracked(() => this.loadStaff(scoopId));
  });

  private loadStaff(scoopId: string | null): void {
    if (!scoopId) return;
    if (this.staffScoopId === scoopId && this.staffStatus() !== "error") return;
    this.staffScoopId = scoopId;
    if (!this.apiMode) {
      const members = this.store
        .state()
        .users.filter(
          (user) =>
            (user.scoopId === scoopId || user.scoopIds?.includes(scoopId)) &&
            user.role !== "faitiere" &&
            user.role !== "admin" &&
            user.role !== "superadmin",
        )
        .sort((first, second) => first.name.localeCompare(second.name))
        .map((user) => ({ id: user.id, name: user.name, role: user.role }));
      this.setStaff(members);
      return;
    }
    this.staffMembers.set([]);
    this.staffStatus.set("loading");
    void fetchScoopStaff(scoopId)
      .then((members) => {
        if (this.staffScoopId === scoopId) this.setStaff(members);
      })
      .catch(() => {
        if (this.staffScoopId === scoopId) this.staffStatus.set("error");
      });
  }

  private setStaff(members: ScoopStaffMember[]): void {
    this.staffMembers.set(members);
    this.staffStatus.set("ready");
    // Les personnes choisies qui ne font plus partie du personnel sont retirées.
    const known = new Set(members.map((member) => member.id));
    this.draft.update((draft) =>
      draft.recipientIds.every((id) => known.has(id))
        ? draft
        : { ...draft, recipientIds: draft.recipientIds.filter((id) => known.has(id)) },
    );
  }

  protected allowedAudiences(): readonly ReminderAudience[] {
    const kind = this.draft().kind;
    return kind ? AUDIENCES_BY_KIND[kind] : [];
  }

  protected daysMin(): number {
    return reminderDaysMin(this.draft().kind ?? "custom");
  }

  /** Fin de la phrase de règle, avec « jour » ou « jours » selon le nombre saisi. */
  protected ruleAfter(): string {
    const kind = this.draft().kind;
    if (!kind) return "";
    const days = parseReminderDays(this.draft().daysBefore, kind) ?? 2;
    return this.t()(RULE_KEYS[kind].after, { unit: this.t()(DAYS_UNIT_KEY, { count: days }) });
  }

  protected exampleText(): string {
    const kind = this.draft().kind;
    const days = kind ? parseReminderDays(this.draft().daysBefore, kind) : null;
    if (!kind || days === null) return this.t()("rappels.example.invalid");
    const example = reminderExample(kind, days, new Date());
    return this.t()(example.key, example.params);
  }

  protected recapText(): string {
    const draft = this.draft();
    const kind = draft.kind;
    const days = kind ? parseReminderDays(draft.daysBefore, kind) : null;
    if (!kind || days === null || !draft.audience) return "";
    const when = reminderWhen(kind, days);
    const scoops = this.scopeScoops().filter((scoop) => draft.scoopIds.includes(scoop.id));
    const scoopNames = this.editing()
      ? this.editing()!.scoopName
      : scoops.length > 2
        ? this.t()("rappels.form.scoopsCount.autre", { count: scoops.length })
        : scoops.map((scoop) => scoop.name).join(", ");
    return this.t()("rappels.form.recap", {
      title: draft.title.trim(),
      scoops: scoopNames || "—",
      when: lowerFirst(this.t()(when.key, when.params)),
      audience: this.audienceRecap(draft),
      channels: draft.channels.map((channel) => this.t()(CHANNEL_STYLE[channel].name)).join(", "),
    });
  }

  /** « au personnel » ou « à Awa, Moussa (2 personnes) ». */
  private audienceRecap(draft: ReminderDraft): string {
    const t = this.t();
    const chosen = recipientIdsOf(draft);
    if (draft.audience === "staff" && chosen.length) {
      const names = chosen.map((id) => this.staffMembers().find((member) => member.id === id)?.name).filter(Boolean);
      if (names.length) {
        return t(chosen.length === 1 ? "rappels.audience.to.staffChosen.un" : "rappels.audience.to.staffChosen.autre", {
          names: names.join(", "),
          count: chosen.length,
        });
      }
    }
    return t(AUDIENCE_STYLE[draft.audience!].to);
  }

  protected goToStep(target: ReminderStep): void {
    if (target >= this.step()) return;
    this.step.set(target);
    this.tried.set(false);
  }

  protected previousStep(): void {
    if (this.step() > 1) this.goToStep((this.step() - 1) as ReminderStep);
  }

  protected nextStep(): void {
    this.tried.set(true);
    if (validateReminderStep(this.step(), this.draft()).length) return;
    if (this.step() < this.steps.length) {
      this.step.set((this.step() + 1) as ReminderStep);
      this.tried.set(false);
    }
  }

  // ───── Enregistrement (API ou mémoire en mode démonstration) ─────
  private localId = 0;

  private async persistCreate(body: ReminderCreateBody): Promise<ReminderDto> {
    if (this.apiMode) return createReminder(body);
    const now = new Date().toISOString();
    const by = this.store.state().session?.name ?? "—";
    return {
      id: `demo-rappel-${++this.localId}`,
      scoopId: body.scoopId,
      scoopName: this.store.state().scoops.find((scoop) => scoop.id === body.scoopId)?.name ?? "",
      kind: body.kind,
      title: body.title,
      message: body.message ?? "",
      daysBefore: body.daysBefore,
      channels: body.channels,
      audience: body.audience,
      recipientIds: body.recipientIds ?? [],
      recipients: this.recipientsOf(body.recipientIds),
      enabled: body.enabled ?? true,
      createdBy: by,
      createdAt: now,
      updatedAt: now,
      lastSentAt: null,
      history: [{ at: now, by, action: "created" }],
    };
  }

  private async persistUpdate(reminder: ReminderDto, body: ReminderUpdateBody): Promise<ReminderDto> {
    if (this.apiMode) return updateReminder(reminder.id, body);
    const now = new Date().toISOString();
    const by = this.store.state().session?.name ?? "—";
    const onlyToggled = Object.keys(body).length === 1 && body.enabled !== undefined;
    const action = onlyToggled ? (body.enabled ? "enabled" : "paused") : "updated";
    const recipients =
      body.audience === undefined && body.recipientIds === undefined
        ? {}
        : { recipientIds: body.recipientIds ?? [], recipients: this.recipientsOf(body.recipientIds) };
    return { ...reminder, ...body, ...recipients, updatedAt: now, history: [...reminder.history, { at: now, by, action }] };
  }

  /** Mode démonstration : noms du personnel choisi, lus dans la liste chargée. */
  private recipientsOf(ids: string[] | undefined): { id: string; name: string }[] {
    return (ids ?? []).map((id) => ({ id, name: this.staffMembers().find((member) => member.id === id)?.name ?? id }));
  }

  private async persistDelete(reminder: ReminderDto): Promise<void> {
    if (this.apiMode) await deleteReminder(reminder.id);
  }

  private replaceItem(updated: ReminderDto): void {
    this.items.update((list) => list.map((reminder) => (reminder.id === updated.id ? updated : reminder)));
  }

  /** Message de l'erreur ; un rappel introuvable est retiré de la liste. */
  private failWith(error: unknown, reminderId?: string): void {
    if (reminderId && error instanceof ApiError && error.code === "NOT_FOUND") {
      this.items.update((list) => list.filter((reminder) => reminder.id !== reminderId));
    }
    this.snackbar.error(this.locale.tNow(reminderApiError(error)));
  }

  protected async submit(): Promise<void> {
    const draft = this.draft();
    const invalidStep = firstInvalidStep(draft);
    if (invalidStep) {
      this.step.set(invalidStep);
      this.tried.set(true);
      return;
    }
    const kind = draft.kind!;
    const common = {
      kind,
      title: draft.title.trim(),
      daysBefore: parseReminderDays(draft.daysBefore, kind)!,
      channels: [...draft.channels],
      audience: draft.audience!,
    };
    const message = draft.message.trim();
    // Le choix des personnes ne part qu'avec « mon personnel » (vide = tout le personnel).
    const recipients = draft.audience === "staff" ? { recipientIds: recipientIdsOf(draft) } : {};
    this.saving.set(true);
    try {
      const target = this.editing();
      if (target) {
        try {
          this.replaceItem(await this.persistUpdate(target, { ...common, ...recipients, message }));
          this.snackbar.success(this.locale.tNow("rappels.toast.updated"));
          this.formOpen.set(false);
          this.editing.set(null);
        } catch (error) {
          this.failWith(error, target.id);
        }
        return;
      }
      const failedScoopIds: string[] = [];
      let created = 0;
      let lastError: unknown;
      for (const scoopId of draft.scoopIds) {
        try {
          const reminder = await this.persistCreate({
            scoopId,
            ...common,
            ...recipients,
            ...(message ? { message } : {}),
            enabled: this.enabledOnCreate(),
          });
          this.items.update((list) => [reminder, ...list]);
          created++;
        } catch (error) {
          failedScoopIds.push(scoopId);
          lastError = error;
        }
      }
      if (!failedScoopIds.length) {
        this.snackbar.success(this.locale.tNow(created > 1 ? "rappels.toast.created.autre" : "rappels.toast.created.un", { count: created }));
        this.formOpen.set(false);
      } else {
        // Les coopératives en échec restent cochées pour réessayer sans refaire les autres.
        this.patchDraft({ scoopIds: failedScoopIds });
        if (created) {
          this.snackbar.error(
            this.locale.tNow("rappels.toast.createdPartial", { done: created, failed: failedScoopIds.length }),
          );
        } else {
          this.failWith(lastError);
        }
        if (created) this.step.set(3);
      }
    } finally {
      this.saving.set(false);
    }
  }

  /** Interrupteur de la liste : active ou met en pause sans ouvrir la modale. */
  protected async toggle(reminder: ReminderDto): Promise<void> {
    if (this.busyId()) return;
    this.busyId.set(reminder.id);
    try {
      this.replaceItem(await this.persistUpdate(reminder, { enabled: !reminder.enabled }));
      this.snackbar.success(this.locale.tNow(reminder.enabled ? "rappels.toast.paused" : "rappels.toast.enabled"));
    } catch (error) {
      this.failWith(error, reminder.id);
    } finally {
      this.busyId.set(null);
    }
  }

  protected readonly deleteTarget = signal<ReminderDto | null>(null);

  protected async confirmDelete(reminder: ReminderDto): Promise<void> {
    this.saving.set(true);
    try {
      await this.persistDelete(reminder);
      this.items.update((list) => list.filter((candidate) => candidate.id !== reminder.id));
      if (this.detailId() === reminder.id) this.detailId.set(null);
      this.snackbar.success(this.locale.tNow("rappels.toast.deleted"));
      this.deleteTarget.set(null);
    } catch (error) {
      this.failWith(error, reminder.id);
      if (error instanceof ApiError && error.code === "NOT_FOUND") this.deleteTarget.set(null);
    } finally {
      this.saving.set(false);
    }
  }
}
