import { computed, linkedSignal, signal, type Signal, type WritableSignal } from "@angular/core";

import { DEFAULT_PAGE_SIZE, type Page, type PageMeta, paginate } from "@/lib/api/pagination";

/** État de pagination d'un tableau, consommé par `<ui-pagination [pager]="…" />`. */
export interface Pager<T> {
  /** Page courante (bornée) + métadonnées, au format de l'API. */
  readonly result: Signal<Page<T>>;
  /** Lignes de la page courante, à itérer dans le tableau. */
  readonly items: Signal<T[]>;
  setPage(page: number): void;
  setSize(size: number): void;
}

/**
 * Pagine une liste calculée (filtres, tri…) côté navigateur, avec les règles de l'API.
 *
 * ```ts
 * protected readonly pager = createPager(() => this.filtered(), 20);
 * // gabarit : @for (row of pager.items(); …) … <ui-pagination [pager]="pager" />
 * ```
 * Retour en page 1 quand le nombre de lignes change (nouveau filtre, recherche) ; une
 * modification de ligne garde la page courante.
 */
export function createPager<T>(source: () => readonly T[], size = DEFAULT_PAGE_SIZE): Pager<T> {
  const limit = signal(size);
  const count = computed(() => source().length);
  const page = linkedSignal({ source: count, computation: () => 1 });
  const result = computed(() => paginate(source(), { page: page(), limit: limit() }));
  return {
    result,
    items: computed(() => result().items),
    setPage: (p) => page.set(p),
    setSize: (s) => {
      limit.set(s);
      page.set(1);
    },
  };
}

/**
 * Pagination pilotée par le serveur : la page affichée est celle que l'API a renvoyée, et chaque changement de
 * page ou de taille relance l'appel (jamais de liste complète en mémoire).
 */
export function createServerPager<T>(source: {
  items: Signal<T[]>;
  meta: Signal<PageMeta>;
  page: WritableSignal<number>;
  limit: WritableSignal<number>;
}): Pager<T> {
  return {
    result: computed(() => ({ ...source.meta(), items: source.items() })),
    items: source.items,
    setPage: (page) => source.page.set(page),
    setSize: (size) => {
      source.limit.set(size);
      source.page.set(1);
    },
  };
}
