import type { AppEnvironment } from "./environment.type";

/** Configuration de production (API distante, mode démonstration fermé). */
export const environment: AppEnvironment = {
  production: true,
  apiUrl: "https://api.mbaydiaay.com/v1",
  demoMode: false,
  siteGate: true,
  siteAccessCode: "CRADESC-NIAYES",
  paymentProvider: null,
  mapboxToken: null,
  errorReportUrl: null,
};
