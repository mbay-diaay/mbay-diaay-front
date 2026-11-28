export interface AppEnvironment {
  production: boolean;
  apiUrl: string | null;
  demoMode: boolean;
  siteGate: boolean;
  siteAccessCode: string;
  paymentProvider: string | null;
  mapboxToken: string | null;
  errorReportUrl: string | null;
}
