import { Component } from "@angular/core";

/** Message vide centré. */
@Component({
  selector: "ui-empty",
  template: `
    <div class="px-4 py-10 text-center text-muted-foreground">
      <ng-content />
    </div>
  `,
})
export class UiEmptyComponent {}
