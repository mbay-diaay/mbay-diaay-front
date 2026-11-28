import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { environment } from "../../environments/environment";
import type { Member } from "../mock/cooperative";
import { getState } from "../store";
import { ApiError } from "./client";
import { addMemberViaApi, changeMemberStatusViaApi, editMemberViaApi, memberApiError } from "./members";
import { clearTokens, setAccessToken } from "./tokens";

let previousApiUrl: string | null = null;
beforeAll(() => {
  previousApiUrl = environment.apiUrl;
  environment.apiUrl = "http://api.test/v1";
  setAccessToken("jeton");
});
afterAll(() => {
  environment.apiUrl = previousApiUrl;
  clearTokens();
});

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

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
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ajoute au store le membre renvoyé par l'API, puis le met à jour", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(member()));
    await addMemberViaApi({ scoopId: "s1", firstName: "Test", lastName: "Membre", sex: "F" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test/v1/members",
      expect.objectContaining({ method: "POST" }),
    );
    expect(getState().members.filter((item) => item.id === "m900")).toHaveLength(1);

    fetchMock.mockResolvedValueOnce(jsonResponse(member({ village: "Fass" })));
    await editMemberViaApi("m900", { village: "Fass" });
    expect(fetchMock).toHaveBeenLastCalledWith(
      "http://api.test/v1/members/m900",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(getState().members.find((item) => item.id === "m900")?.village).toBe("Fass");
    expect(getState().members.filter((item) => item.id === "m900")).toHaveLength(1);
  });

  it("change le statut et rend le nombre de comptes fermés", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ...member({ status: "suspendu" }), closedAccounts: 1 }));
    const result = await changeMemberStatusViaApi("m900", "suspendu", "Impayé");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test/v1/members/m900/status",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ status: "suspendu", comment: "Impayé" }),
      }),
    );
    expect(result.closedAccounts).toBe(1);
    expect(getState().members.find((item) => item.id === "m900")?.status).toBe("suspendu");
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
