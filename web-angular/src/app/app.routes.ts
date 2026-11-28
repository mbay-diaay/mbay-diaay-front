import type { Routes } from "@angular/router";

import { siteGateGuard } from "@shared/site-gate.guard";

export const routes: Routes = [
  {
    path: "architecture",
    title: "Architecture L2 · Mbay Diaay",
    loadComponent: () => import("./pages/architecture.page"),
  },
  {
    path: "construction",
    loadComponent: () => import("./pages/construction.page"),
  },
  {
    path: "invitation",
    canActivate: [siteGateGuard],
    loadComponent: () => import("./pages/invitation.page"),
  },
  {
    path: "login",
    canActivate: [siteGateGuard],
    loadComponent: () => import("./pages/login.page"),
  },
  {
    path: "mot-de-passe-oublie",
    canActivate: [siteGateGuard],
    loadComponent: () => import("./pages/mot-de-passe-oublie.page"),
  },
  {
    path: "payer/:token",
    loadComponent: () => import("./pages/payer-token.page"),
  },
  {
    path: "",
    canActivate: [siteGateGuard],
    loadComponent: () => import("./pages/app/app-layout.page"),
    children: [
      {
        path: "",
        pathMatch: "full",
        loadComponent: () => import("./pages/app/index.page"),
      },
      {
        path: "dashboard/appareils",
        loadComponent: () => import("./pages/app/dashboard/appareils.page"),
      },
      {
        path: "dashboard/audit",
        loadComponent: () => import("./pages/app/dashboard/audit.page"),
      },
      {
        path: "dashboard/calendriers",
        loadComponent: () => import("./pages/app/dashboard/calendriers.page"),
      },
      {
        path: "dashboard/campagnes",
        loadComponent: () => import("./pages/app/dashboard/campagnes.page"),
      },
      {
        path: "dashboard/carte",
        loadComponent: () => import("./pages/app/dashboard/carte.page"),
      },
      {
        path: "dashboard/charges",
        loadComponent: () => import("./pages/app/dashboard/charges.page"),
      },
      {
        path: "dashboard/comptes",
        loadComponent: () => import("./pages/app/dashboard/comptes.page"),
      },
      {
        path: "dashboard/cooperative",
        loadComponent: () => import("./pages/app/dashboard/cooperative.page"),
      },
      {
        path: "dashboard/cooperatives",
        loadComponent: () => import("./pages/app/dashboard/cooperatives.page"),
      },
      {
        path: "dashboard/cooperatives/:id",
        loadComponent: () => import("./pages/app/dashboard/cooperative-detail.page"),
      },
      {
        path: "dashboard/corrections",
        redirectTo: "dashboard/qualite/corrections",
        pathMatch: "full",
      },
      {
        path: "dashboard/cotisations",
        loadComponent: () => import("./pages/app/dashboard/cotisations.page"),
      },
      {
        path: "dashboard/credits",
        loadComponent: () => import("./pages/app/dashboard/credits.page"),
      },
      {
        path: "dashboard/documents",
        loadComponent: () => import("./pages/app/dashboard/documents.page"),
      },
      {
        path: "dashboard/dossiers",
        loadComponent: () => import("./pages/app/dashboard/dossiers.page"),
      },
      {
        path: "dashboard/dossiers/:id",
        loadComponent: () => import("./pages/app/dashboard/dossier-detail.page"),
      },
      {
        path: "dashboard/exploitation",
        loadComponent: () => import("./pages/app/dashboard/exploitation.page"),
      },
      {
        path: "dashboard/faq",
        loadComponent: () => import("./pages/app/dashboard/faq.page"),
      },
      {
        path: "dashboard/guide",
        loadComponent: () => import("./pages/app/dashboard/guide.page"),
      },
      {
        path: "dashboard/imports",
        loadComponent: () => import("./pages/app/dashboard/imports.page"),
      },
      {
        path: "dashboard/organisations",
        loadComponent: () => import("./pages/app/dashboard/organisations.page"),
      },
      {
        path: "dashboard/organisations/:id",
        loadComponent: () => import("./pages/app/dashboard/organisation-detail.page"),
      },
      {
        path: "dashboard/personnel",
        loadComponent: () => import("./pages/app/dashboard/personnel.page"),
      },
      {
        path: "dashboard/plans",
        loadComponent: () => import("./pages/app/dashboard/plans.page"),
      },
      {
        path: "dashboard/producteurs",
        loadComponent: () => import("./pages/app/dashboard/producteurs.page"),
      },
      {
        path: "dashboard/producteurs/:id",
        loadComponent: () => import("./pages/app/dashboard/producteur-detail.page"),
      },
      {
        path: "dashboard/qualite",
        loadComponent: () => import("./pages/app/dashboard/qualite.page"),
      },
      {
        path: "dashboard/qualite/alertes",
        loadComponent: () => import("./pages/app/dashboard/qualite.alertes.page"),
      },
      {
        path: "dashboard/qualite/corrections",
        loadComponent: () => import("./pages/app/dashboard/qualite.corrections.page"),
      },
      {
        path: "dashboard/qualite/demandes",
        loadComponent: () => import("./pages/app/dashboard/qualite.demandes.page"),
      },
      {
        path: "dashboard/qualite/doublons",
        loadComponent: () => import("./pages/app/dashboard/qualite.doublons.page"),
      },
      {
        path: "dashboard/qualite/doublons/comparer",
        loadComponent: () => import("./pages/app/dashboard/qualite.doublons.comparer.page"),
      },
      {
        path: "dashboard/rappels",
        loadComponent: () => import("./pages/app/dashboard/rappels.page"),
      },
      {
        path: "dashboard/rapports",
        loadComponent: () => import("./pages/app/dashboard/rapports.page"),
      },
      {
        path: "dashboard/referentiels",
        loadComponent: () => import("./pages/app/dashboard/referentiels.page"),
      },
      {
        path: "dashboard/reunions",
        loadComponent: () => import("./pages/app/dashboard/reunions.page"),
      },
      {
        path: "dashboard/reunions/:id",
        loadComponent: () => import("./pages/app/dashboard/reunion-detail.page"),
      },
      {
        path: "dashboard/roles-cooperative",
        loadComponent: () => import("./pages/app/dashboard/roles-cooperative.page"),
      },
      {
        path: "dashboard/stocks",
        loadComponent: () => import("./pages/app/dashboard/stocks.page"),
      },
      {
        path: "dashboard/suivi",
        loadComponent: () => import("./pages/app/dashboard/suivi.page"),
      },
      {
        path: "dashboard/super-admin",
        loadComponent: () => import("./pages/app/dashboard/super-admin.page"),
      },
      {
        path: "dashboard/super-admin/comptes",
        loadComponent: () => import("./pages/app/dashboard/super-admin.comptes.page"),
      },
      {
        path: "dashboard/profil",
        loadComponent: () => import("./pages/app/dashboard/super-admin.profil.page"),
      },
      {
        path: "dashboard/super-admin/parametres",
        loadComponent: () => import("./pages/app/dashboard/super-admin.parametres.page"),
      },
      {
        path: "dashboard/super-admin/profil",
        loadComponent: () => import("./pages/app/dashboard/super-admin.profil.page"),
      },
      {
        path: "dashboard/super-admin/roles",
        loadComponent: () => import("./pages/app/dashboard/super-admin.roles.page"),
      },
      {
        path: "dashboard/techniciens",
        loadComponent: () => import("./pages/app/dashboard/techniciens.page"),
      },
      {
        path: "dashboard/utilisateurs",
        loadComponent: () => import("./pages/app/dashboard/utilisateurs.page"),
      },
      {
        path: "dashboard/ventes",
        loadComponent: () => import("./pages/app/dashboard/ventes.page"),
      },
      {
        path: "dashboard/:role",
        loadComponent: () => import("./pages/app/dashboard/role-dashboard.page"),
      },
    ],
  },
  {
    path: "**",
    redirectTo: "login",
  },
];
