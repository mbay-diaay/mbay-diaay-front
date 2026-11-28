import { Component, computed, inject, input } from "@angular/core";
import { DomSanitizer } from "@angular/platform-browser";

// Charte V2 (p. 12) : Material Symbols Rounded, trait 400, non remplies.
// Import texte (.svg) : chaque SVG est intégré au build (aucun chargement externe, CSP respectée)
// et seules les icônes listées ici partent dans le bundle.
import agriculture from "@material-symbols/svg-400/rounded/agriculture.svg";
import analytics from "@material-symbols/svg-400/rounded/analytics.svg";
import badge from "@material-symbols/svg-400/rounded/badge.svg";
import calendarMonth from "@material-symbols/svg-400/rounded/calendar_month.svg";
import chevronLeft from "@material-symbols/svg-400/rounded/chevron_left.svg";
import infoSvg from "@material-symbols/svg-400/rounded/info.svg";
import csvSvg from "@material-symbols/svg-400/rounded/csv.svg";
import lockSvg from "@material-symbols/svg-400/rounded/lock.svg";
import publicSvg from "@material-symbols/svg-400/rounded/public.svg";
import blockSvg from "@material-symbols/svg-400/rounded/block.svg";
import adminPanelSettingsSvg from "@material-symbols/svg-400/rounded/admin_panel_settings.svg";
import howToRegSvg from "@material-symbols/svg-400/rounded/how_to_reg.svg";
import notificationsActiveSvg from "@material-symbols/svg-400/rounded/notifications_active.svg";
import undoSvg from "@material-symbols/svg-400/rounded/undo.svg";
import contentCopySvg from "@material-symbols/svg-400/rounded/content_copy.svg";
import refreshSvg from "@material-symbols/svg-400/rounded/refresh.svg";
import deleteForeverSvg from "@material-symbols/svg-400/rounded/delete_forever.svg";
import accessibilitySvg from "@material-symbols/svg-400/rounded/accessibility.svg";
import chevronRight from "@material-symbols/svg-400/rounded/chevron_right.svg";
import creditScore from "@material-symbols/svg-400/rounded/credit_score.svg";
import database from "@material-symbols/svg-400/rounded/database.svg";
import dataset from "@material-symbols/svg-400/rounded/dataset.svg";
import description from "@material-symbols/svg-400/rounded/description.svg";
import devices from "@material-symbols/svg-400/rounded/devices.svg";
import diversity3 from "@material-symbols/svg-400/rounded/diversity_3.svg";
import event from "@material-symbols/svg-400/rounded/event.svg";
import eventNote from "@material-symbols/svg-400/rounded/event_note.svg";
import factCheck from "@material-symbols/svg-400/rounded/fact_check.svg";
import folderShared from "@material-symbols/svg-400/rounded/folder_shared.svg";
import group from "@material-symbols/svg-400/rounded/group.svg";
import history from "@material-symbols/svg-400/rounded/history.svg";
import homeWork from "@material-symbols/svg-400/rounded/home_work.svg";
import hub from "@material-symbols/svg-400/rounded/hub.svg";
import layers from "@material-symbols/svg-400/rounded/layers.svg";
import inventory2 from "@material-symbols/svg-400/rounded/inventory_2.svg";
import leftPanelClose from "@material-symbols/svg-400/rounded/left_panel_close.svg";
import leftPanelOpen from "@material-symbols/svg-400/rounded/left_panel_open.svg";
import link from "@material-symbols/svg-400/rounded/link.svg";
import manageAccounts from "@material-symbols/svg-400/rounded/manage_accounts.svg";
import map from "@material-symbols/svg-400/rounded/map.svg";
import payments from "@material-symbols/svg-400/rounded/payments.svg";
import pinDrop from "@material-symbols/svg-400/rounded/pin_drop.svg";
import pottedPlant from "@material-symbols/svg-400/rounded/potted_plant.svg";
import queryStats from "@material-symbols/svg-400/rounded/query_stats.svg";
import receiptLong from "@material-symbols/svg-400/rounded/receipt_long.svg";
import schedule from "@material-symbols/svg-400/rounded/schedule.svg";
import sell from "@material-symbols/svg-400/rounded/sell.svg";
import spaceDashboard from "@material-symbols/svg-400/rounded/space_dashboard.svg";
import storefront from "@material-symbols/svg-400/rounded/storefront.svg";
import trendingUp from "@material-symbols/svg-400/rounded/trending_up.svg";
import tune from "@material-symbols/svg-400/rounded/tune.svg";
import uploadFile from "@material-symbols/svg-400/rounded/upload_file.svg";
import verified from "@material-symbols/svg-400/rounded/verified.svg";
import accountBalanceSvg from "@material-symbols/svg-400/rounded/account_balance.svg";
import closeSvg from "@material-symbols/svg-400/rounded/close.svg";
import apartmentSvg from "@material-symbols/svg-400/rounded/apartment.svg";
import gridViewSvg from "@material-symbols/svg-400/rounded/grid_view.svg";
import viewListSvg from "@material-symbols/svg-400/rounded/view_list.svg";
import moreHorizSvg from "@material-symbols/svg-400/rounded/more_horiz.svg";
import archiveSvg from "@material-symbols/svg-400/rounded/archive.svg";
import unarchiveSvg from "@material-symbols/svg-400/rounded/unarchive.svg";
import editSvg from "@material-symbols/svg-400/rounded/edit.svg";
import personAddSvg from "@material-symbols/svg-400/rounded/person_add.svg";
import addBusinessSvg from "@material-symbols/svg-400/rounded/add_business.svg";
import markEmailUnreadSvg from "@material-symbols/svg-400/rounded/mark_email_unread.svg";
import summarizeSvg from "@material-symbols/svg-400/rounded/summarize.svg";
import tableViewSvg from "@material-symbols/svg-400/rounded/table_view.svg";
import visibilitySvg from "@material-symbols/svg-400/rounded/visibility.svg";
import checkSvg from "@material-symbols/svg-400/rounded/check.svg";
import labProfileSvg from "@material-symbols/svg-400/rounded/lab_profile.svg";
import folderOpenSvg from "@material-symbols/svg-400/rounded/folder_open.svg";
import calendarTodaySvg from "@material-symbols/svg-400/rounded/calendar_today.svg";
import accountBalanceWalletSvg from "@material-symbols/svg-400/rounded/account_balance_wallet.svg";
import gavelSvg from "@material-symbols/svg-400/rounded/gavel.svg";
import progressActivitySvg from "@material-symbols/svg-400/rounded/progress_activity.svg";
import fileExportSvg from "@material-symbols/svg-400/rounded/file_export.svg";
import notificationsSvg from "@material-symbols/svg-400/rounded/notifications.svg";
import helpSvg from "@material-symbols/svg-400/rounded/help.svg";
import settingsSvg from "@material-symbols/svg-400/rounded/settings.svg";
import addSvg from "@material-symbols/svg-400/rounded/add.svg";
import uploadSvg from "@material-symbols/svg-400/rounded/upload.svg";
import accessibleSvg from "@material-symbols/svg-400/rounded/accessible.svg";
import downloadSvg from "@material-symbols/svg-400/rounded/download.svg";
import arrowForwardSvg from "@material-symbols/svg-400/rounded/arrow_forward.svg";
import arrowBackSvg from "@material-symbols/svg-400/rounded/arrow_back.svg";
import deleteSvg from "@material-symbols/svg-400/rounded/delete.svg";
import arrowOutwardSvg from "@material-symbols/svg-400/rounded/arrow_outward.svg";
import squareFootSvg from "@material-symbols/svg-400/rounded/square_foot.svg";
import femaleSvg from "@material-symbols/svg-400/rounded/female.svg";
import warningSvg from "@material-symbols/svg-400/rounded/warning.svg";
import checkCircleSvg from "@material-symbols/svg-400/rounded/check_circle.svg";
import mailSvg from "@material-symbols/svg-400/rounded/mail.svg";
import callSvg from "@material-symbols/svg-400/rounded/call.svg";
import menuBookSvg from "@material-symbols/svg-400/rounded/menu_book.svg";
import quizSvg from "@material-symbols/svg-400/rounded/quiz.svg";
import languageSvg from "@material-symbols/svg-400/rounded/language.svg";
import personSvg from "@material-symbols/svg-400/rounded/person.svg";
import logoutSvg from "@material-symbols/svg-400/rounded/logout.svg";
import searchSvg from "@material-symbols/svg-400/rounded/search.svg";
import keyboardArrowDownSvg from "@material-symbols/svg-400/rounded/keyboard_arrow_down.svg";
import northEastSvg from "@material-symbols/svg-400/rounded/north_east.svg";
import southEastSvg from "@material-symbols/svg-400/rounded/south_east.svg";
import eventUpcomingSvg from "@material-symbols/svg-400/rounded/event_upcoming.svg";
import locationOnSvg from "@material-symbols/svg-400/rounded/location_on.svg";
import landscapeSvg from "@material-symbols/svg-400/rounded/landscape.svg";
import grassSvg from "@material-symbols/svg-400/rounded/grass.svg";
import taskAltSvg from "@material-symbols/svg-400/rounded/task_alt.svg";
import supportAgentSvg from "@material-symbols/svg-400/rounded/support_agent.svg";
import openInNewSvg from "@material-symbols/svg-400/rounded/open_in_new.svg";
import accountCircleSvg from "@material-symbols/svg-400/rounded/account_circle.svg";
import photoLibrarySvg from "@material-symbols/svg-400/rounded/photo_library.svg";
import waterDropSvg from "@material-symbols/svg-400/rounded/water_drop.svg";
import schoolSvg from "@material-symbols/svg-400/rounded/school.svg";

const ICONS = {
  agriculture,
  analytics,
  badge,
  calendar_month: calendarMonth,
  chevron_left: chevronLeft,
  info: infoSvg,
  csv: csvSvg,
  lock: lockSvg,
  public: publicSvg,
  block: blockSvg,
  admin_panel_settings: adminPanelSettingsSvg,
  how_to_reg: howToRegSvg,
  notifications_active: notificationsActiveSvg,
  undo: undoSvg,
  content_copy: contentCopySvg,
  refresh: refreshSvg,
  delete_forever: deleteForeverSvg,
  accessibility: accessibilitySvg,
  chevron_right: chevronRight,
  credit_score: creditScore,
  database,
  dataset,
  description,
  devices,
  diversity_3: diversity3,
  event,
  event_note: eventNote,
  fact_check: factCheck,
  folder_shared: folderShared,
  group,
  history,
  home_work: homeWork,
  hub,
  layers,
  inventory_2: inventory2,
  left_panel_close: leftPanelClose,
  left_panel_open: leftPanelOpen,
  link,
  manage_accounts: manageAccounts,
  map,
  payments,
  pin_drop: pinDrop,
  potted_plant: pottedPlant,
  query_stats: queryStats,
  receipt_long: receiptLong,
  schedule,
  sell,
  space_dashboard: spaceDashboard,
  storefront,
  trending_up: trendingUp,
  tune,
  upload_file: uploadFile,
  verified,
  account_balance: accountBalanceSvg,
  close: closeSvg,
  apartment: apartmentSvg,
  grid_view: gridViewSvg,
  view_list: viewListSvg,
  more_horiz: moreHorizSvg,
  archive: archiveSvg,
  unarchive: unarchiveSvg,
  edit: editSvg,
  person_add: personAddSvg,
  add_business: addBusinessSvg,
  mark_email_unread: markEmailUnreadSvg,
  summarize: summarizeSvg,
  table_view: tableViewSvg,
  visibility: visibilitySvg,
  check: checkSvg,
  lab_profile: labProfileSvg,
  folder_open: folderOpenSvg,
  calendar_today: calendarTodaySvg,
  account_balance_wallet: accountBalanceWalletSvg,
  gavel: gavelSvg,
  progress_activity: progressActivitySvg,
  file_export: fileExportSvg,
  notifications: notificationsSvg,
  help: helpSvg,
  settings: settingsSvg,
  add: addSvg,
  upload: uploadSvg,
  accessible: accessibleSvg,
  download: downloadSvg,
  arrow_forward: arrowForwardSvg,
  arrow_back: arrowBackSvg,
  delete: deleteSvg,
  arrow_outward: arrowOutwardSvg,
  square_foot: squareFootSvg,
  female: femaleSvg,
  warning: warningSvg,
  check_circle: checkCircleSvg,
  mail: mailSvg,
  call: callSvg,
  menu_book: menuBookSvg,
  quiz: quizSvg,
  language: languageSvg,
  person: personSvg,
  logout: logoutSvg,
  search: searchSvg,
  keyboard_arrow_down: keyboardArrowDownSvg,
  north_east: northEastSvg,
  south_east: southEastSvg,
  event_upcoming: eventUpcomingSvg,
  location_on: locationOnSvg,
  landscape: landscapeSvg,
  grass: grassSvg,
  task_alt: taskAltSvg,
  support_agent: supportAgentSvg,
  open_in_new: openInNewSvg,
  account_circle: accountCircleSvg,
  photo_library: photoLibrarySvg,
  water_drop: waterDropSvg,
  school: schoolSvg,
} as const;

export type IconName = keyof typeof ICONS;

/**
 * Icône Material Symbols Rounded : `<ui-icon name="agriculture" [size]="20" />`.
 * Prend la couleur du texte (`currentColor`). Décorative par défaut (`aria-hidden`) :
 * le libellé doit être porté par l'élément parent. Pour ajouter une icône : l'importer ci-dessus.
 */
@Component({
  selector: "ui-icon",
  host: {
    class: "inline-grid shrink-0 place-items-center",
    "aria-hidden": "true",
    "[style.width.px]": "size()",
    "[style.height.px]": "size()",
    "[innerHTML]": "svg()",
  },
  styles: `
    :host ::ng-deep svg {
      width: 100%;
      height: 100%;
      fill: currentColor;
    }
  `,
  template: ``,
})
export class IconComponent {
  readonly name = input.required<IconName>();
  readonly size = input(20);

  private readonly sanitizer = inject(DomSanitizer);
  /** SVG statiques du paquet, connus au build : contenu de confiance. */
  protected readonly svg = computed(() => this.sanitizer.bypassSecurityTrustHtml(ICONS[this.name()]));
}
