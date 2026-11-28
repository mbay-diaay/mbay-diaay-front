import { computed, DestroyRef, effect, Injectable, inject, signal, untracked } from "@angular/core";
import { actions, can, getState, subscribeToStore, type State } from "@/lib/store";
import { isApiMode } from "@/lib/api/config";
import { fetchAllMembers } from "@/lib/api/members";
import { maskPhone } from "@/lib/format";
import { isConsolidated, scoopIdsOf } from "@/lib/scope";
import {
  BUILT_IN_ROLES,
  isBuiltInRole,
  roleIsScoped,
  roleName,
  SUPER_ADMIN_ONLY_ROLES,
  type Permission,
  type RoleId,
} from "@/lib/permissions";
import { LocaleService } from "./locale.service";

/**
 * Abonnement Angular au store (src/lib/store.ts) : l'état, les `actions` et la logique métier
 * vivent dans le store ; ce service les expose sous forme de signal.
 */
@Injectable({ providedIn: "root" })
export class StoreService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly stateSignal = signal<State>(getState());
  readonly state = this.stateSignal.asReadonly();

  /** Les `actions` du store (store.ts `actions.*`) : elles modifient directement le store partagé. */
  readonly actions = actions;

  constructor() {
    const unsubscribe = subscribeToStore(() => this.stateSignal.set(getState()));
    this.destroyRef.onDestroy(unsubscribe);
    // Mode API : les membres se vident à la déconnexion. Ils ne sont plus lus à l'ouverture de session : seuls les
    // écrans qui en ont besoin les demandent (`ensureMembers`), jamais la page Producteurs.
    effect(() => {
      const email = this.state().session?.email ?? null;
      if (!email) untracked(() => this.loadMembersFor(null));
    });
  }

  private membersLoadedFor: string | null = null;

  /** Lit les membres du périmètre une seule fois par session (à la demande de l'écran qui en a besoin). */
  ensureMembers(): void {
    this.loadMembersFor(this.state().session?.email ?? null);
  }

  private loadMembersFor(email: string | null): void {
    if (!isApiMode() || email === this.membersLoadedFor) return;
    this.membersLoadedFor = email;
    if (!email) {
      actions.replaceMembersFromApi([]);
      return;
    }
    if (!this.can("member.read")) return;
    fetchAllMembers()
      .then((rows) => {
        if (this.membersLoadedFor === email) actions.replaceMembersFromApi(rows);
      })
      .catch((error: unknown) => console.error("[ERROR][StoreService.loadMembersFor]", error));
  }

  private readonly locale = inject(LocaleService);

  /**
   * Rôles que la session peut voir : intégrés, rôles globaux, et sous-rôles des seules coopératives de son
   * périmètre (les sous-rôles de la coopérative B restent invisibles pour la coopérative A).
   */
  readonly allRoles = computed<RoleId[]>(() => {
    const session = this.state().session;
    const visible = scoopIdsOf(session);
    return [
      ...BUILT_IN_ROLES,
      ...this.state()
        .customRoles.filter((role) => !role.scoopId || isConsolidated(session) || visible.has(role.scoopId))
        .map((role) => role.id),
    ];
  });

  /** Nom affiché d'un rôle : traduit pour un rôle intégré, nom choisi pour un rôle créé. */
  roleLabel(role: RoleId): string {
    return isBuiltInRole(role)
      ? this.locale.tEnum("role", role)
      : roleName(role, this.state().customRoles);
  }

  /**
   * Rôles qu'on peut donner à un compte rattaché aux coopératives `scoopIds` : sans le droit `role.configure`, ni
   * administrateur ni super administrateur ; un sous-rôle de coopérative seulement avec sa propre coopérative.
   */
  assignableRoleIds(scoopIds: readonly string[]): RoleId[] {
    const superAdmin = this.can("role.configure");
    const customRoles = this.state().customRoles;
    return this.allRoles().filter((role) => {
      if (!superAdmin && SUPER_ADMIN_ONLY_ROLES.includes(role as never)) return false;
      const owner = customRoles.find((item) => item.id === role)?.scoopId;
      return !owner || (scoopIds.length === 1 && scoopIds[0] === owner);
    });
  }

  /** Rôle limité à une coopérative (sinon vue consolidée). */
  roleScoped(role: RoleId): boolean {
    return roleIsScoped(role, this.state().customRoles);
  }

  can(permission: Permission): boolean {
    return can(this.state().session, permission);
  }

  /** Colonne « Source » visible uniquement pour le super administrateur et l'administrateur CRADESC. */
  readonly canSeeSource = computed(() => {
    const role = this.state().session?.role;
    return role ? (SUPER_ADMIN_ONLY_ROLES as readonly string[]).includes(role) : false;
  });

  /**
   * Numéro de téléphone tel que la session a le droit de le voir :
   * en clair avec `contact.read` (admin), masqué sinon (« 77 ••• •• 85 »). Vide → "".
   */
  phone(raw: string | null | undefined): string {
    if (!raw) return "";
    return this.can("contact.read") ? raw : maskPhone(raw);
  }
}
