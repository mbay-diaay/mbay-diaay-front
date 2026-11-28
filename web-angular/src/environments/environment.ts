import type { AppEnvironment } from "./environment.type";

/** Configuration par défaut (démonstration locale et tests). */
export const environment: AppEnvironment = {
  production: false,
  apiUrl: null,
  demoMode: true,
  siteGate: false,
  siteAccessCode: "CRADESC-NIAYES",
  paymentProvider: null,
  mapboxToken: null,
  errorReportUrl: null,
};
