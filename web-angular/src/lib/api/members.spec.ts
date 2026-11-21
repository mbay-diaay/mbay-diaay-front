import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Member } from "../mock/cooperative";
import { getState } from "../store";

const apiFetch = vi.fn();
vi.mock("./client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client")>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

const { addMemberViaApi, changeMemberStatusViaApi, editMemberViaApi, memberApiError } = await import("./members");
const { ApiError } = await import("./client");

const member = (patch: Partial<Member> = {}): Member => ({
  id: "m900",
  scoopId: "s1",
  orgId: null,
  firstName: "Test",
  lastName: "Membre",
  sex: "F",
  phone: "77 123 45 67",
  email: "",
  age: null,
  handicap: false,
  village: "Mboro",
  status: "candidat",
  joinedAt: null,
  producerId: null,
  history: [],
  ...patch,
});

describe("membres via l'API", () => {
  beforeEach(() => apiFetch.mockReset());

  it("ajoute au store le membre renvoyé par l'API, puis le met à jour", async () => {
    apiFetch.mockResolvedValueOnce(member());
    await addMemberViaApi({ scoopId: "s1", firstName: "Test", lastName: "Membre", sex: "F" });
    expect(apiFetch).toHaveBeenCalledWith("/members", expect.objectContaining({ method: "POST" }));
    expect(getState().members.filter((m) => m.id === "m900")).toHaveLength(1);

    apiFetch.mockResolvedValueOnce(member({ village: "Fass" }));
    await editMemberViaApi("m900", { village: "Fass" });
    expect(apiFetch).toHaveBeenLastCalledWith("/members/m900", expect.objectContaining({ method: "PATCH" }));
    expect(getState().members.find((m) => m.id === "m900")?.village).toBe("Fass");
    expect(getState().members.filter((m) => m.id === "m900")).toHaveLength(1);
  });

  it("change le statut et rend le nombre de comptes fermés", async () => {
    apiFetch.mockResolvedValueOnce({ ...member({ status: "suspendu" }), closedAccounts: 1 });
    const result = await changeMemberStatusViaApi("m900", "suspendu", "Impayé");
    expect(apiFetch).toHaveBeenCalledWith(
      "/members/m900/status",
      expect.objectContaining({ body: { status: "suspendu", comment: "Impayé" } }),
    );
    expect(result.closedAccounts).toBe(1);
    expect(getState().members.find((m) => m.id === "m900")?.status).toBe("suspendu");
  });

  it("rattache les erreurs de l'API au bon champ", () => {
    const conflict = new ApiError(409, "CONFLICT", "x", { code: "MEMBER_EMAIL_TAKEN" });
    expect(memberApiError(conflict)).toEqual({ key: "errors.member.emailTaken", field: "email" });
    const badPhone = new ApiError(400, "BAD_REQUEST", "Numéro sénégalais invalide", {
      message: ["Numéro sénégalais invalide (ex. 77 123 45 67)"],
    });
    expect(memberApiError(badPhone)).toEqual({ key: "errors.technician.phone", field: "phone" });
    expect(memberApiError(new Error("réseau"))).toEqual({ key: "errors.users.api" });
  });
});
