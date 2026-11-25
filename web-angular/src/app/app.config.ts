import { ApplicationConfig, provideBrowserGlobalErrorListeners } from "@angular/core";
import { provideFileRouter } from "@analogjs/router";

/** Site statique (`analog({ ssr: false })`) : pas d’hydratation serveur → pas de `provideClientHydration`. */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideFileRouter(),
  ],
};
