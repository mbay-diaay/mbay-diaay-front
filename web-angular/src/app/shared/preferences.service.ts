import { Injectable, signal } from "@angular/core";

import {
  getPreferences,
  subscribePreferences,
  updatePreferences,
  type UserPreferences,
} from "@/lib/api/preferences";

/**
 * Préférences du compte (langue, menu, vue des coopératives) en signal.
 * Lues sur le serveur après la connexion, écrites par `PUT /users/me/preferences` : rien dans le navigateur.
 */
@Injectable({ providedIn: "root" })
export class PreferencesService {
  private readonly state = signal<UserPreferences>(getPreferences());
  readonly preferences = this.state.asReadonly();

  constructor() {
    subscribePreferences((next) => this.state.set(next));
  }

  update(patch: UserPreferences): void {
    updatePreferences(patch);
  }
}
