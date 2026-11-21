import { describe, expect, it } from "vitest";

import { formatSenegalPhone, isSenegalPhone } from "./phone-sn";

describe("téléphone sénégalais", () => {
  it("met en forme pendant la saisie et ignore tout ce qui n'est pas un chiffre", () => {
    expect(formatSenegalPhone("771234567")).toBe("77 123 45 67");
    expect(formatSenegalPhone("77 12")).toBe("77 12");
    expect(formatSenegalPhone("7a7-1+2.3")).toBe("77 123");
    expect(formatSenegalPhone("+221 77 123 45 67")).toBe("77 123 45 67");
    expect(formatSenegalPhone("77123456789999")).toBe("77 123 45 67");
  });

  it("n'accepte que les numéros du Sénégal à 9 chiffres", () => {
    expect(isSenegalPhone("77 123 45 67")).toBe(true);
    expect(isSenegalPhone("33 821 12 34")).toBe(true);
    expect(isSenegalPhone("77 123 45")).toBe(false);
    expect(isSenegalPhone("65 123 45 67")).toBe(false);
    expect(isSenegalPhone("+33 6 12 34 56 78")).toBe(false);
    expect(isSenegalPhone("")).toBe(false);
  });
});
