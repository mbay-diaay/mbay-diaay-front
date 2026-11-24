import { describe, expect, it } from "vitest";

import { fr } from "./i18n";
import {
  alertDraft,
  clampText,
  duplicateDraft,
  groupByScoop,
  isDashboardLink,
  organisationDraft,
  otherDraft,
  producerItem,
  sheetDraft,
  withoutPersonalNumbers,
} from "./coop-request-templates";
import { ApiError } from "./api/client";
import { COOP_REQUEST_MESSAGE_MAX, COOP_REQUEST_SUBJECT_MAX, coopRequestErrorKey } from "./api/coop-requests";

describe("modèles de messages des demandes aux coopératives", () => {
  it("doublon : cite les codes et renvoie vers Qualité des données › Doublons", () => {
    const draft = duplicateDraft({ codes: ["KMS-001", "KMS-014"] });
    expect(draft.subject).toBe("Doublon possible : KMS-001, KMS-014");
    expect(draft.message).toContain(
      "Les fiches KMS-001, KMS-014 semblent concerner la même personne. Merci de vérifier et, si c'est bien le cas, de les fusionner depuis la page Qualité des données › Doublons.",
    );
  });

  it("doublon : une seule fiche dans la coopérative → message adapté (fusion impossible entre coopératives)", () => {
    const draft = duplicateDraft({ codes: ["KMS-001"] });
    expect(draft.message).toContain("La fiche KMS-001 semble concerner une personne déjà enregistrée dans une autre coopérative");
    expect(draft.message).not.toContain("fusionner");
  });

  it("fiche à vérifier : liste les points, explique les motifs connus et préfixe le lieu", () => {
    const draft = sheetDraft({
      code: "KMS-002",
      name: "Awa Diop",
      points: [
        "Durée d'entretien trop courte",
        { text: "Précision GPS faible", place: "P1" },
        { text: "Observation libre du terrain", place: "Tomate · P2" },
        "Durée d'entretien trop courte",
      ],
    });
    expect(draft.subject).toBe("Fiche à vérifier : Awa Diop (KMS-002)");
    expect(draft.message).toContain("La fiche de Awa Diop (KMS-002) a besoin d'être vérifiée.");
    expect(draft.message).toContain(`- ${fr["qualite.real.why.shortInterview"]}`);
    expect(draft.message).toContain(`- P1 : ${fr["qualite.real.why.gpsPrecision"]}`);
    expect(draft.message).toContain("- Tomate · P2 : Observation libre du terrain");
    // Le doublon de point n'apparaît qu'une fois.
    expect(draft.message.split(fr["qualite.real.why.shortInterview"]).length - 1).toBe(1);
  });

  it("fiche sans point détaillé : message simple, sans liste", () => {
    const draft = sheetDraft({ code: "KMS-003", name: "Moussa Ba", points: [] });
    expect(draft.message).toContain("La fiche de Moussa Ba (KMS-003) est à vérifier.");
    expect(draft.message).not.toContain("- ");
  });

  it("alerte : sujet « alerte » sur le code, même corps que la fiche", () => {
    const draft = alertDraft({ code: "KMS-004", name: "Fatou Sow", points: ["Rendement aberrant"] });
    expect(draft.subject).toBe("Alerte à traiter : fiche KMS-004");
    expect(draft.message).toContain(fr["qualite.real.why.yieldOutlier"]);
  });

  it("organisation à qualifier : nomme l'organisation et demande de renseigner le type", () => {
    const draft = organisationDraft({ name: "GIE Jaboot" });
    expect(draft.subject).toBe("Organisation à qualifier : GIE Jaboot");
    expect(draft.message).toContain("Le type de l'organisation GIE Jaboot n'est pas connu");
    expect(draft.message).toContain("Merci de le renseigner");
  });

  it("autre : brouillon libre non vide", () => {
    const draft = otherDraft();
    expect(draft.subject.length).toBeGreaterThan(0);
    expect(draft.message.length).toBeGreaterThan(0);
  });

  it("n'écrit jamais de téléphone ni de CNI dans un message", () => {
    expect(withoutPersonalNumbers("Téléphone 77 123 45 67 et CNI 1 234 5678 91011")).not.toMatch(/\d{4}/);
    const draft = sheetDraft({
      code: "KMS-005",
      name: "Ibra Fall",
      points: ["Numéro 77 123 45 67 invalide", "CNI 1234567890123 en double"],
    });
    expect(draft.message).not.toMatch(/\d{6,}/);
    expect(draft.message.replace(/KMS-005/g, "")).not.toMatch(/\d{3}[\s.-]?\d{2}[\s.-]?\d{2}/);
  });

  it("borne l'objet et le message aux limites du serveur", () => {
    expect(clampText("abcdef", 4)).toBe("abc…");
    expect(clampText("abc", 4)).toBe("abc");
    const draft = sheetDraft({
      code: "KMS-006",
      name: "N".repeat(400),
      points: Array.from({ length: 300 }, (_, index) => `Point libre numéro ${index}`),
    });
    expect(draft.subject.length).toBeLessThanOrEqual(COOP_REQUEST_SUBJECT_MAX);
    expect(draft.message.length).toBeLessThanOrEqual(COOP_REQUEST_MESSAGE_MAX);
  });
});

describe("aides des demandes", () => {
  it("producerItem : « Prénom Nom (CODE) », sans téléphone ni CNI", () => {
    expect(producerItem({ id: "p1", code: "KMS-001", firstName: "Awa", lastName: "Diop" })).toEqual({
      type: "producer",
      id: "p1",
      label: "Awa Diop (KMS-001)",
    });
  });

  it("groupByScoop : une entrée par coopérative, ordre d'apparition conservé", () => {
    const groups = groupByScoop([
      { scoopId: "s2", id: "a" },
      { scoopId: "s1", id: "b" },
      { scoopId: "s2", id: "c" },
    ]);
    expect(groups.map((group) => group.scoopId)).toEqual(["s2", "s1"]);
    expect(groups[0]!.entries.map((entry) => entry.id)).toEqual(["a", "c"]);
  });

  it("isDashboardLink : seulement un chemin interne du tableau de bord", () => {
    expect(isDashboardLink("/dashboard/qualite/doublons")).toBe(true);
    expect(isDashboardLink("/dashboard/producteurs/p1")).toBe(true);
    expect(isDashboardLink("https://exemple.sn/dashboard/x")).toBe(false);
    expect(isDashboardLink("//evil.example/dashboard/")).toBe(false);
    expect(isDashboardLink("/autre/page")).toBe(false);
    expect(isDashboardLink("/dashboard//x")).toBe(false);
  });
});

describe("coopRequestErrorKey", () => {
  it("traduit les erreurs de l'API en messages français", () => {
    expect(coopRequestErrorKey(new ApiError(409, "NO_MANAGER", "x"))).toBe("demandes.err.noManager");
    expect(coopRequestErrorKey(new ApiError(409, "CONFLICT", "x", { code: "ALREADY_CLOSED" }))).toBe("demandes.err.alreadyClosed");
    expect(coopRequestErrorKey(new ApiError(409, "ALREADY_CLOSED", "x"))).toBe("demandes.err.alreadyClosed");
    expect(coopRequestErrorKey(new ApiError(404, "NOT_FOUND", "x"))).toBe("demandes.err.notFound");
    expect(coopRequestErrorKey(new ApiError(0, "HTTP_ERROR", "x"))).toBe("demandes.err.network");
    expect(coopRequestErrorKey(new ApiError(400, "VALIDATION", "x"))).toBe("demandes.err.invalid");
    expect(coopRequestErrorKey(new Error("?"))).toBe("demandes.err.generic");
    expect(fr["demandes.err.noManager"]).toBe("Cette coopérative n'a pas de gestionnaire actif à contacter.");
  });
});
