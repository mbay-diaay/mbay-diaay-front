import { Component, effect, inject } from "@angular/core";
import { Router } from "@angular/router";

/** `/dashboard/super-admin` → `/dashboard/super-admin/roles`. */
@Component({
  selector: "app-super-admin-redirect-page",
  template: `<p class="p-8 text-sm text-muted-foreground">Redirection…</p>`,
})
export default class SuperAdminRedirectPage {
  private readonly router = inject(Router);

  constructor() {
    effect(() => {
      void this.router.navigateByUrl("/dashboard/super-admin/roles", { replaceUrl: true });
    });
  }
}
