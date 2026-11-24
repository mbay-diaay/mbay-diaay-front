import { describe, expect, it } from "vitest";

import { fr } from "./i18n/fr";
import {
  audiencesOf,
  canChooseRecipients,
  defaultAudienceOf,
  firstInvalidStep,
  formatExampleDay,
  isAudienceAllowed,
  lowerFirst,
  parseReminderDays,
  recipientCountOf,
  recipientIdsOf,
  REMINDER_RECIPIENTS_MAX,
  REMINDER_AUDIENCES,
  REMINDER_RULE_KINDS,
  REMINDER_TITLE_MAX,
  reminderExample,
  reminderExampleDates,
  reminderTemplate,
  reminderWhen,
  validateReminderStep,
  type ReminderDraft,
} from "./reminder-templates";

const validDraft: ReminderDraft = {
  kind: "meeting",
  daysBefore: "3",
  scoopIds: ["scoop-1"],
  audience: "members",
  recipientIds: [],
  channels: ["app"],
  title: "Rappel : réunion",
  message: "Bonjour",
};

describe("audiences par type", () => {
  it("respecte les règles du serveur", () => {
    expect(audiencesOf("meeting")).toEqual(["members", "bureau", "staff"]);
    expect(audiencesOf("decision")).toEqual(["responsible", "bureau", "members", "staff"]);
    expect(audiencesOf("dossier")).toEqual(["bureau", "manager", "members", "staff"]);
    expect(audiencesOf("contribution")).toEqual(["unpaid", "members", "staff"]);
    expect([...audiencesOf("custom")].sort()).toEqual([...REMINDER_AUDIENCES].sort());
  });

  it("propose le premier destinataire autorisé par défaut", () => {
    expect(defaultAudienceOf("decision")).toBe("responsible");
    expect(isAudienceAllowed("meeting", "unpaid")).toBe(false);
    expect(isAudienceAllowed("custom", "unpaid")).toBe(true);
    // Tous les membres : permis pour chaque type de rappel.
    for (const kind of ["meeting", "decision", "dossier", "contribution", "custom"] as const) {
      expect(isAudienceAllowed(kind, "members")).toBe(true);
    }
  });
});

describe("modèles de message", () => {
  it("existent pour chaque type, sans donnée personnelle ni ajout croisé", () => {
    for (const kind of REMINDER_RULE_KINDS) {
      const template = reminderTemplate(kind);
      expect(template.title.length).toBeGreaterThan(0);
      expect(template.title.length).toBeLessThanOrEqual(REMINDER_TITLE_MAX);
      expect(template.message).not.toMatch(/@|\d{6,}/);
    }
  });

  it("renvoie une copie modifiable", () => {
    const first = reminderTemplate("meeting");
    first.title = "autre";
    expect(reminderTemplate("meeting").title).not.toBe("autre");
  });
});

describe("phrases de règle", () => {
  it("choisit la phrase du tableau selon le type et le délai", () => {
    expect(reminderWhen("meeting", 3)).toEqual({ key: "rappels.when.meeting.autre", params: { count: 3 } });
    expect(reminderWhen("meeting", 0).key).toBe("rappels.when.meeting.same");
    expect(reminderWhen("dossier", 14).key).toBe("rappels.when.dossier.autre");
  });

  it("n'utilise que des clés i18n existantes", () => {
    for (const kind of REMINDER_RULE_KINDS) {
      for (const days of [0, 1, 5]) {
        const { key } = reminderWhen(kind, days);
        expect(key in fr).toBe(true);
        expect(`rappels.when.${kind}.un` in fr).toBe(true);
        expect(`rappels.rule.${kind}.before` in fr).toBe(true);
        expect(`rappels.example.${kind}` in fr).toBe(true);
      }
    }
  });

  it("met la première lettre en minuscule", () => {
    expect(lowerFirst("Le jour de la réunion")).toBe("le jour de la réunion");
    expect(lowerFirst("")).toBe("");
  });
});

describe("exemples datés", () => {
  const today = new Date("2026-11-23T10:00:00Z");

  it("réunion : le rappel part N jours avant", () => {
    const dates = reminderExampleDates("meeting", 3, today);
    expect(dates).toEqual({ eventDate: "2026-12-03", reminderDate: "2026-11-30" });
  });

  it("dossier : relancé N jours après le dépôt", () => {
    expect(reminderExampleDates("dossier", 14, today)).toEqual({ eventDate: "2026-11-23", reminderDate: "2026-12-07" });
  });

  it("délai nul : le rappel part le jour même", () => {
    const dates = reminderExampleDates("contribution", 0, today);
    expect(dates.eventDate).toBe(dates.reminderDate);
  });

  it("formate le jour en français", () => {
    expect(formatExampleDay("2026-12-07")).toBe("7 décembre");
    const example = reminderExample("meeting", 3, today);
    expect(example.key).toBe("rappels.example.meeting");
    expect(example.params).toEqual({ date: "3 décembre", reminder: "30 novembre" });
  });
});

describe("validation des étapes", () => {
  it("accepte un brouillon complet", () => {
    expect(firstInvalidStep(validDraft)).toBeNull();
  });

  it("étape 1 : le type est obligatoire", () => {
    expect(validateReminderStep(1, { ...validDraft, kind: null }).map((issue) => issue.field)).toEqual(["kind"]);
  });

  it("étape 2 : entier entre 0 et 60 (1 minimum pour un dossier)", () => {
    expect(parseReminderDays("3", "meeting")).toBe(3);
    expect(parseReminderDays("0", "meeting")).toBe(0);
    expect(parseReminderDays("0", "dossier")).toBeNull();
    expect(parseReminderDays("61", "meeting")).toBeNull();
    expect(parseReminderDays("2,5", "meeting")).toBeNull();
    expect(parseReminderDays("", "meeting")).toBeNull();
    expect(validateReminderStep(2, { ...validDraft, daysBefore: "abc" })[0]?.key).toBe("rappels.err.days");
  });

  it("étape 3 : coopérative, destinataires du type et au moins un canal", () => {
    const fields = (draft: ReminderDraft) => validateReminderStep(3, draft).map((issue) => issue.field);
    expect(fields({ ...validDraft, scoopIds: [] })).toEqual(["scoopIds"]);
    expect(fields({ ...validDraft, audience: "unpaid" })).toEqual(["audience"]);
    expect(fields({ ...validDraft, audience: null })).toEqual(["audience"]);
    expect(fields({ ...validDraft, channels: [] })).toEqual(["channels"]);
  });

  it("étape 4 : objet obligatoire et longueurs maximales", () => {
    expect(validateReminderStep(4, { ...validDraft, title: "  " })[0]?.key).toBe("rappels.err.title.empty");
    expect(validateReminderStep(4, { ...validDraft, title: "x".repeat(121) })[0]?.key).toBe("rappels.err.title.long");
    expect(validateReminderStep(4, { ...validDraft, message: "x".repeat(1001) })[0]?.key).toBe("rappels.err.message.long");
    expect(validateReminderStep(4, { ...validDraft, message: "" })).toEqual([]);
  });

  it("repère la première étape en erreur", () => {
    expect(firstInvalidStep({ ...validDraft, channels: [], title: "" })).toBe(3);
    expect(firstInvalidStep({ ...validDraft, kind: null })).toBe(1);
  });
});

describe("personnel destinataire", () => {
  const staffDraft: ReminderDraft = { ...validDraft, audience: "staff", recipientIds: ["u1", "u2", "u1"] };

  it("est permis pour tous les types de rappel", () => {
    for (const kind of REMINDER_RULE_KINDS) expect(isAudienceAllowed(kind, "staff")).toBe(true);
  });

  it("ne garde le choix des personnes qu'avec une seule coopérative", () => {
    expect(canChooseRecipients(staffDraft)).toBe(true);
    expect(recipientIdsOf(staffDraft)).toEqual(["u1", "u2"]);
    expect(recipientIdsOf({ ...staffDraft, scoopIds: ["a", "b"] })).toEqual([]);
    expect(recipientIdsOf({ ...staffDraft, audience: "members" })).toEqual([]);
  });

  it("refuse plus de 100 personnes", () => {
    const many = Array.from({ length: REMINDER_RECIPIENTS_MAX + 1 }, (_, index) => `u${index}`);
    expect(validateReminderStep(3, { ...staffDraft, recipientIds: many }).map((issue) => issue.field)).toContain("recipients");
    expect(validateReminderStep(3, staffDraft)).toEqual([]);
  });

  it("compte les personnes choisies d'un rappel", () => {
    expect(recipientCountOf({ audience: "staff", recipientIds: ["a", "b"] })).toBe(2);
    expect(recipientCountOf({ audience: "staff", recipientIds: [] })).toBe(0);
    expect(recipientCountOf({ audience: "members", recipientIds: ["a"] })).toBe(0);
  });

  it("a ses libellés en français", () => {
    for (const key of ["rappels.audience.staff", "rappels.audience.text.staff", "rappels.audience.to.staff"] as const) {
      expect(fr[key]).toBeTruthy();
    }
  });
});
