import { describe, expect, it } from "vitest";

import { ApiError } from "./client";
import { differingFieldLabels, mergeErrorKey } from "./producers";

const differentes = new ApiError(409, "CONFLICT", "Ces fiches diffèrent", {
  code: "FICHES_DIFFERENTES",
  message: "Ces fiches diffèrent",
  fields: ["cni", "village"],
  labels: ["CNI", "Village"],
});

describe("erreurs de fusion", () => {
  it("reconnaît FICHES_DIFFERENTES et donne un message français dédié", () => {
    expect(mergeErrorKey(differentes)).toBe("qualite.merge.err.differentes");
  });

  it("lit les libellés des champs qui diffèrent, sans valeur", () => {
    expect(differingFieldLabels(differentes)).toEqual(["CNI", "Village"]);
    expect(differingFieldLabels(new ApiError(409, "CONFLICT", "déjà fusionnée", { code: "ALREADY_MERGED" }))).toEqual([]);
    expect(differingFieldLabels(new Error("réseau"))).toEqual([]);
  });

  it("garde les autres refus connus", () => {
    expect(mergeErrorKey(new ApiError(409, "CONFLICT", "x", { code: "DIFFERENT_SCOOP" }))).toBe("qualite.merge.err.differentScoop");
    expect(mergeErrorKey(new ApiError(409, "CONFLICT", "x", { code: "ACCOUNT_LINK_CONFLICT" }))).toBe("qualite.merge.err.accountLink");
    expect(mergeErrorKey(new ApiError(0, "NO_API", "x"))).toBe("qualite.merge.err.network");
  });
});
