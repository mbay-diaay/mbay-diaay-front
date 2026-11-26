import { describe, expect, it } from "vitest";

import { formatSenegalPhone, isPhoneInputAccepted, isSenegalPhone } from "./phone-sn";

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
    expect(isSenegalPhone("33 821 12 34")).toBe(false);
    expect(isSenegalPhone("+221 75 123 45 67")).toBe(true);
    expect(isSenegalPhone("221701234567")).toBe(true);
    expect(isSenegalPhone("77 123 45")).toBe(false);
    expect(isSenegalPhone("65 123 45 67")).toBe(false);
    expect(isSenegalPhone("+33 6 12 34 56 78")).toBe(false);
    expect(isSenegalPhone("")).toBe(false);
  });
});

describe("téléphone : format exigé seulement pour une valeur nouvelle ou modifiée (Q-17)", () => {
  it("accepte une valeur existante inchangée, même hors format", () => {
    expect(isPhoneInputAccepted("12345", "12345")).toBe(true);
    expect(isPhoneInputAccepted(" 12345 ", "12345")).toBe(true);
    expect(isPhoneInputAccepted("77 ••• •• 85", "77 ••• •• 85")).toBe(true);
    expect(isPhoneInputAccepted("33 821 12 34", "33 821 12 34")).toBe(true);
  });

  it("refuse une valeur nouvelle ou modifiée hors format", () => {
    expect(isPhoneInputAccepted("12345", "")).toBe(false);
    expect(isPhoneInputAccepted("12345", "771234567")).toBe(false);
    expect(isPhoneInputAccepted("65 123 45 67", "77 123 45 67")).toBe(false);
  });

  it("accepte une valeur nouvelle ou modifiée au bon format, avec ou sans +221", () => {
    expect(isPhoneInputAccepted("77 123 45 67", "")).toBe(true);
    expect(isPhoneInputAccepted("+221 78 123 45 67", "12345")).toBe(true);
    expect(isPhoneInputAccepted("221701234567".slice(3), null)).toBe(true);
  });

  it("accepte une saisie vide : l'obligation éventuelle se contrôle à part", () => {
    expect(isPhoneInputAccepted("", "12345")).toBe(true);
  });
});
