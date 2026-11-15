import "@shared/ui/charte-v2-fonts";

import { DOCUMENT } from "@angular/common";
import { Component, afterNextRender, computed, inject, signal } from "@angular/core";
import type { RouteMeta } from "@analogjs/router";

import {
  API_ROUTES,
  AVANCEMENT,
  DOC_ROLES,
  ENV_VARS,
  L2_UPDATED_AT,
  MATRIX_COLUMNS,
  PHOTO_CREDITS,
  PROCHAINES_ETAPES,
  PROGRESS_LABEL,
  ROLE_DOCS,
  TECH_STACK,
  TEST_ACCESS,
  TOTAL_PERMISSIONS,
  TREES,
  matrixRow,
  permissionCount,
  type DocRoleId,
} from "@/lib/architecture-l2";
import { BrandLogoComponent } from "@shared/ui";

/** Page publique, non indexée par les moteurs de recherche (elle contient les comptes de test). */
export const routeMeta: RouteMeta = {
  title: "Architecture L2 · Mbay Diaay",
  meta: [{ name: "robots", content: "noindex, nofollow" }],
};

type SectionLink = { id: string; n: string; label: string };

/**
 * Livrable L2 « Architecture fonctionnelle et technique », consultable à l'adresse `/architecture` sans connexion
 * ni code d'accès. Partie 1 pour l'ONG (langage courant), partie 2 en annexe pour un informaticien.
 * Contenu : `src/lib/architecture-l2.ts` ; les droits par rôle sont calculés depuis `src/lib/permissions.ts`.
 */
@Component({
  selector: "app-architecture-page",
  imports: [BrandLogoComponent],
  host: { class: "block" },
  styles: `
    :host {
      display: block;
      background: var(--v2-creme);
      color: var(--v2-encre);
      font-family: var(--v2-font);
      font-size: 15.5px;
      line-height: 1.6;
    }
    .hero {
      background: var(--v2-foret);
      color: var(--v2-blanc);
    }
    .in {
      max-width: 1180px;
      margin: 0 auto;
      padding-left: max(16px, env(safe-area-inset-left, 0px));
      padding-right: max(16px, env(safe-area-inset-right, 0px));
    }
    .hero .in {
      display: grid;
      gap: 18px;
      padding-block: 36px 40px;
    }
    .mono {
      font-family: var(--v2-font-mono);
      font-size: 12px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .hero .mono {
      color: var(--v2-citron);
    }
    .hero h1 {
      margin: 0;
      max-width: 22ch;
      font-size: clamp(28px, 4.4vw, 46px);
      line-height: 1.1;
      font-weight: 800;
      letter-spacing: -0.02em;
      text-wrap: balance;
    }
    .hero p {
      margin: 0;
      max-width: 68ch;
      color: color-mix(in oklab, var(--v2-blanc) 82%, var(--v2-foret));
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .chips span {
      border: 1px solid color-mix(in oklab, var(--v2-citron) 40%, transparent);
      border-radius: 999px;
      padding: 4px 12px;
      font-size: 13px;
    }
    .parts {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 12px;
    }
    .part {
      display: grid;
      gap: 4px;
      border: 1px solid color-mix(in oklab, var(--v2-blanc) 18%, transparent);
      border-radius: 18px;
      background: color-mix(in oklab, var(--v2-blanc) 6%, transparent);
      padding: 14px 16px;
      color: var(--v2-blanc);
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .part:hover {
      background: color-mix(in oklab, var(--v2-blanc) 11%, transparent);
    }
    .part b {
      font-size: 17px;
    }
    .part small {
      color: color-mix(in oklab, var(--v2-blanc) 75%, var(--v2-foret));
    }
    .body {
      display: grid;
      grid-template-columns: 230px minmax(0, 1fr);
      gap: 40px;
      padding-block: 32px 72px;
    }
    @media (max-width: 900px) {
      .body {
        grid-template-columns: minmax(0, 1fr);
      }
      .toc {
        position: static !important;
      }
    }
    .toc {
      position: sticky;
      top: 16px;
      align-self: start;
      display: grid;
      gap: 14px;
      font-size: 14px;
    }
    .toc p {
      margin: 0 0 6px;
      color: var(--v2-gris-texte);
      font-size: 11px;
    }
    .toc button {
      display: flex;
      width: 100%;
      gap: 10px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      padding: 5px 8px;
      color: var(--v2-encre);
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .toc button:hover {
      background: var(--v2-sauge);
    }
    .toc button span {
      min-width: 26px;
      padding-top: 2px;
      color: var(--v2-gris-texte);
      font-family: var(--v2-font-mono);
      font-size: 12px;
    }
    main {
      min-width: 0;
      display: grid;
      gap: 56px;
    }
    section {
      min-width: 0;
      display: grid;
      gap: 16px;
      scroll-margin-top: 16px;
    }
    h2 {
      margin: 0;
      display: flex;
      align-items: baseline;
      gap: 12px;
      font-size: 26px;
      line-height: 1.2;
      letter-spacing: -0.015em;
      text-wrap: balance;
    }
    h2 .n {
      color: var(--v2-vert-pousse);
      font-family: var(--v2-font-mono);
      font-size: 14px;
    }
    h3 {
      margin: 8px 0 0;
      font-size: 18px;
    }
    p {
      margin: 0;
      max-width: 72ch;
    }
    .lead,
    .cap {
      color: var(--v2-gris-texte);
    }
    .cap {
      font-size: 13px;
    }
    .band {
      display: grid;
      gap: 6px;
      border-radius: 22px;
      padding: 22px 24px;
      scroll-margin-top: 16px;
    }
    .band.f {
      background: var(--v2-foret);
      color: var(--v2-blanc);
    }
    .band.f .mono {
      color: var(--v2-citron);
    }
    .band.t {
      border: 1px dashed var(--v2-gris-trait);
      background: var(--v2-lin);
    }
    .band.t .mono {
      color: var(--v2-vert-pousse);
    }
    .band h2 {
      font-size: 28px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 14px;
    }
    .card {
      min-width: 0;
      display: grid;
      align-content: start;
      gap: 10px;
      border: 1px solid var(--v2-bord-carte);
      border-radius: 18px;
      background: var(--v2-blanc);
      padding: 18px 20px;
    }
    .card h3 {
      margin: 0;
    }
    .who {
      color: var(--v2-vert-pousse);
      font-family: var(--v2-font-mono);
      font-size: 11.5px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    ul.plain {
      margin: 0;
      display: grid;
      gap: 6px;
      padding-left: 20px;
    }
    .tree {
      margin: 0;
      overflow-x: auto;
      border: 1px solid var(--v2-bord-carte);
      border-radius: 18px;
      background: var(--v2-blanc);
      padding: 18px 20px;
      font-family: var(--v2-font-mono);
      font-size: 13px;
      line-height: 1.65;
      white-space: pre;
    }
    .tbl {
      overflow-x: auto;
      border: 1px solid var(--v2-bord-carte);
      border-radius: 16px;
      background: var(--v2-blanc);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    th,
    td {
      border-bottom: 1px solid var(--v2-bord-carte);
      padding: 10px 14px;
      text-align: left;
      vertical-align: top;
    }
    th {
      background: var(--v2-sauge);
      color: var(--v2-gris-texte);
      font-family: var(--v2-font-mono);
      font-size: 11.5px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    tr:last-child td {
      border-bottom: 0;
    }
    td.k {
      font-weight: 700;
      white-space: nowrap;
    }
    .matrix td {
      text-align: center;
      white-space: nowrap;
      font-size: 13px;
    }
    .matrix td:first-child,
    .matrix th:first-child {
      text-align: left;
    }
    .pill {
      display: inline-block;
      border-radius: 999px;
      padding: 2px 9px;
      font-size: 12px;
      font-weight: 700;
      white-space: nowrap;
    }
    .pill.strong {
      background: var(--v2-foret);
      color: var(--v2-citron);
    }
    .pill.light {
      border: 1px solid var(--v2-bord-carte);
      background: var(--v2-sauge);
      color: var(--v2-vert-pousse);
    }
    .pill.scope {
      background: var(--v2-info-bg);
      color: var(--v2-info-fg);
    }
    .pill.none {
      color: var(--v2-gris-texte);
      font-weight: 400;
    }
    .pill.ok {
      border: 1px solid var(--v2-bord-carte);
      background: var(--v2-succes-bg);
      color: var(--v2-succes-fg);
    }
    .pill.part {
      background: var(--v2-attente-bg);
      color: var(--v2-attente-fg);
    }
    .pill.todo {
      background: var(--v2-info-bg);
      color: var(--v2-info-fg);
    }
    .bars {
      display: grid;
      gap: 6px;
      border: 1px solid var(--v2-bord-carte);
      border-radius: 18px;
      background: var(--v2-blanc);
      padding: 16px 18px;
    }
    .bar {
      display: grid;
      grid-template-columns: 190px minmax(0, 1fr) 40px;
      align-items: center;
      gap: 12px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      padding: 3px 4px;
      color: var(--v2-encre);
      font: inherit;
      font-size: 14px;
      text-align: left;
      cursor: pointer;
    }
    .bar:hover {
      background: var(--v2-sauge);
    }
    .bar .t {
      height: 12px;
      overflow: hidden;
      border: 1px solid var(--v2-bord-carte);
      border-radius: 6px;
      background: var(--v2-sauge);
    }
    .bar .t i {
      display: block;
      height: 100%;
      border-radius: 6px;
      background: var(--v2-vert-pousse);
    }
    .bar.sel b {
      font-weight: 800;
    }
    .bar.sel .t i {
      background: var(--v2-foret);
    }
    .bar em {
      color: var(--v2-gris-texte);
      font-family: var(--v2-font-mono);
      font-size: 13px;
      font-style: normal;
      text-align: right;
    }
    .bar b {
      font-weight: 500;
    }
    @media (max-width: 560px) {
      .bar {
        grid-template-columns: 110px minmax(0, 1fr) 34px;
        font-size: 13px;
      }
    }
    .tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .tabs button {
      border: 1px solid var(--v2-bord-carte);
      border-radius: 999px;
      background: var(--v2-blanc);
      padding: 8px 14px;
      color: var(--v2-encre);
      font: 600 14px var(--v2-font);
      cursor: pointer;
    }
    .tabs button[aria-selected="true"] {
      border-color: var(--v2-foret);
      background: var(--v2-foret);
      color: var(--v2-citron);
    }
    .role {
      display: grid;
      grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
      gap: 28px;
      border: 1px solid var(--v2-bord-carte);
      border-radius: 18px;
      background: var(--v2-blanc);
      padding: 22px;
    }
    @media (max-width: 760px) {
      .role {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    .role > div {
      min-width: 0;
      display: grid;
      align-content: start;
      gap: 14px;
    }
    .role h3 {
      margin: 0;
      font-size: 21px;
    }
    .flow {
      margin: 0 0 0 11px;
      padding: 0;
      list-style: none;
      border-left: 2px solid var(--v2-bord-carte);
    }
    .flow li {
      position: relative;
      padding: 0 0 14px 22px;
    }
    .flow li::before {
      content: "";
      position: absolute;
      top: 6px;
      left: -7px;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--v2-vert-pousse);
    }
    .flow li:last-child {
      padding-bottom: 0;
    }
    .flow span {
      display: block;
      color: var(--v2-gris-texte);
      font-size: 14px;
    }
    .lbl {
      margin-bottom: 6px;
      color: var(--v2-gris-texte);
      font-family: var(--v2-font-mono);
      font-size: 11.5px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .cant {
      color: var(--v2-gris-texte);
    }
    .creds {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
    }
    .cred {
      display: grid;
      gap: 4px;
      border-radius: 16px;
      background: var(--v2-foret);
      padding: 14px 16px;
      color: var(--v2-blanc);
    }
    .cred span {
      color: var(--v2-citron);
      font-family: var(--v2-font-mono);
      font-size: 11px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    .cred b {
      overflow-wrap: anywhere;
      font-family: var(--v2-font-mono);
      font-size: 18px;
      user-select: all;
    }
    .cred small {
      color: color-mix(in oklab, var(--v2-blanc) 75%, var(--v2-foret));
      font-size: 12.5px;
    }
    code {
      overflow-wrap: anywhere;
      border-radius: 6px;
      background: var(--v2-sauge);
      padding: 1px 6px;
      font-family: var(--v2-font-mono);
      font-size: 0.86em;
    }
    .copy {
      border: 1px solid var(--v2-bord-carte);
      border-radius: 8px;
      background: var(--v2-creme);
      padding: 4px 10px;
      color: var(--v2-encre);
      font: 600 12px var(--v2-font);
      cursor: pointer;
    }
    .note {
      display: grid;
      gap: 6px;
      max-width: 80ch;
      border-radius: 16px;
      padding: 14px 18px;
    }
    .note.info {
      background: var(--v2-info-bg);
      color: var(--v2-info-fg);
    }
    .note.warn {
      background: var(--v2-attente-bg);
      color: var(--v2-attente-fg);
    }
    button:focus-visible {
      outline: 2px solid var(--v2-vert-pousse);
      outline-offset: 2px;
    }
    footer {
      grid-column: 1 / -1;
      border-top: 1px solid var(--v2-bord-carte);
      padding-top: 18px;
      color: var(--v2-gris-texte);
      font-size: 13px;
    }
  `,
  template: `
    <header class="hero">
      <div class="in">
        <ui-brand-logo variant="inverse" [size]="40" />
        <div class="mono">Livrable L2 · Module 1 Administratif</div>
        <h1>Architecture fonctionnelle et technique de Mbay Diaay</h1>
        <p>
          Mbay Diaay aide le CRADESC et les sociétés coopératives (SCOOP) de la zone des Niayes à gérer leurs membres,
          leurs producteurs et la vie de leurs coopératives, au bureau comme sur le terrain.
        </p>
        <div class="chips">
          <span>Mis à jour le {{ updatedAt }}</span>
          <span>Destinataire : propriétaire du projet</span>
          <span>Données de test fictives</span>
        </div>
        <div class="parts">
          <button type="button" class="part" (click)="go('f1')">
            <span class="mono">Partie 1</span><b>Architecture fonctionnelle</b>
            <small>Ce que fait la plateforme, qui fait quoi, comment l'utiliser</small>
          </button>
          <button type="button" class="part" (click)="go('t1')">
            <span class="mono">Partie 2 · Annexe</span><b>Architecture technique</b>
            <small>Pour le prestataire informatique : composants, code, hébergement</small>
          </button>
        </div>
      </div>
    </header>

    <div class="in body">
      <nav class="toc" aria-label="Sommaire">
        <div>
          <p class="mono">Partie 1 · Fonctionnel</p>
          @for (s of fSections; track s.id) {
            <button type="button" (click)="go(s.id)"><span>{{ s.n }}</span>{{ s.label }}</button>
          }
        </div>
        <div>
          <p class="mono">Partie 2 · Technique</p>
          @for (s of tSections; track s.id) {
            <button type="button" (click)="go(s.id)"><span>{{ s.n }}</span>{{ s.label }}</button>
          }
        </div>
      </nav>

      <main>
        <div class="band f">
          <div class="mono">Partie 1</div>
          <h2>Architecture fonctionnelle</h2>
          <p>Pour l'équipe du CRADESC et des coopératives : ce que la plateforme permet de faire, qui peut faire quoi, et comment chaque personne l'utilise.</p>
        </div>

        <section id="f1">
          <h2><span class="n">F1</span>Ce que fait la plateforme</h2>
          <p>Mbay Diaay réunit trois outils qui partagent les mêmes informations. Ce qui est saisi sur le terrain se retrouve au bureau, et chaque personne ne voit que ce qui la concerne.</p>
          <div class="grid">
            <div class="card"><span class="who">Au bureau</span><h3>Console web</h3><p>Pour le CRADESC, la faîtière et les équipes des coopératives : coopératives, producteurs, adhérents, cotisations, réunions, documents, rapports.</p><p class="cap">www.mbaydiaay.com</p></div>
            <div class="card"><span class="who">Sur le terrain</span><h3>Application mobile</h3><p>Pour les techniciens : recenser les producteurs, prendre les photos, relever les parcelles au GPS, même sans réseau.</p><p class="cap">Android et iOS</p></div>
            <div class="card"><span class="who">En coulisse</span><h3>Serveur central</h3><p>Garde les informations, vérifie qui a le droit de faire quoi, envoie les codes de connexion et conserve les photos en lieu sûr.</p><p class="cap">Hébergé sur un serveur dédié</p></div>
          </div>
        </section>

        <section id="f2">
          <h2><span class="n">F2</span>Organisation du réseau</h2>
          <p>La plateforme reproduit la structure du réseau. Chaque coopérative est un espace fermé : la coopérative A ne voit jamais les informations de la coopérative B.</p>
          <pre class="tree">{{ trees.reseau }}</pre>
          <h3>Qui crée qui, et qui voit quoi</h3>
          <pre class="tree">{{ trees.cascade }}</pre>
          <div class="grid">
            <div class="card"><h3>Création en cascade</h3><p class="cap">Le CRADESC crée chaque coopérative avec son gestionnaire. Le gestionnaire crée ensuite son équipe et ses techniciens.</p></div>
            <div class="card"><h3>Espaces fermés</h3><p class="cap">Les comptes, rôles et fiches de A sont invisibles pour B. La règle est vérifiée par le serveur, pas seulement par l'écran.</p></div>
            <div class="card"><h3>Faîtière</h3><p class="cap">Créée par le CRADESC, puis liée à une ou plusieurs coopératives. Elle consulte, sans rien modifier.</p></div>
            <div class="card"><h3>Producteurs et GIE</h3><p class="cap">Ce sont des fiches, pas des comptes : ils ne se connectent pas. La coopérative ou un technicien les enregistre.</p></div>
          </div>
        </section>

        <section id="f3">
          <h2><span class="n">F3</span>Les rôles</h2>
          <p>La plateforme compte {{ roles.length }} rôles. Chacun donne accès à un ensemble de droits, sur {{ total }} au total. Ces droits peuvent être ajustés sans intervention technique, et chaque coopérative peut créer ses propres rôles, sans jamais dépasser les droits de la personne qui les crée.</p>
          <div class="tbl">
            <table>
              <thead><tr><th>Rôle</th><th>Ce qu'il voit</th><th>Mission</th></tr></thead>
              <tbody>
                @for (r of roles; track r.id) {
                  <tr><td class="k">{{ r.doc.nom }}</td><td><span class="pill scope">{{ r.doc.voit }}</span></td><td>{{ r.doc.mission }}</td></tr>
                }
              </tbody>
            </table>
          </div>
          <h3>Qui fait quoi</h3>
          <div class="tbl">
            <table class="matrix">
              <thead>
                <tr><th>Rôle</th>@for (c of columns; track c.key) {<th>{{ c.label }}</th>}</tr>
              </thead>
              <tbody>
                @for (r of roles; track r.id) {
                  <tr>
                    <td class="k">{{ r.doc.court }}</td>
                    @for (cell of r.row; track $index) {
                      <td><span class="pill" [class]="'pill ' + cell.tone">{{ cell.label }}</span></td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <p class="cap">« Gère » : crée, modifie et supprime. « Décide » : examine les dossiers envoyés par les techniciens et les accepte, les refuse ou demande un complément. « CNI » : voit le numéro complet de la pièce d'identité, en indiquant un motif gardé dans le journal. Tableau calculé à partir des droits en vigueur dans l'application.</p>
          <h3>Étendue des droits</h3>
          <p class="lead">Nombre de droits accordés à chaque rôle, sur {{ total }}. Cliquez sur un rôle pour voir son parcours.</p>
          <div class="bars">
            @for (r of roles; track r.id) {
              <button type="button" class="bar" [class.sel]="r.id === role()" (click)="pick(r.id, true)">
                <b>{{ r.doc.nom }}</b><span class="t"><i [style.width.%]="(r.count / total) * 100"></i></span><em>{{ r.count }}</em>
              </button>
            }
          </div>
        </section>

        <section id="f4">
          <h2><span class="n">F4</span>Parcours par rôle</h2>
          <p>Tout le monde entre par la même porte : e-mail, mot de passe, puis un code à 6 chiffres reçu par e-mail. Le technicien a en plus un accès mobile par numéro de téléphone.</p>
          <div class="tabs" role="tablist" aria-label="Choisir un rôle">
            @for (r of roles; track r.id) {
              <button type="button" role="tab" [attr.aria-selected]="r.id === role()" (click)="pick(r.id)">{{ r.doc.nom }}</button>
            }
          </div>
          @if (current(); as c) {
            <div class="role" role="tabpanel">
              <div>
                <div>
                  <h3>{{ c.doc.nom }}</h3>
                  <div class="chips" style="margin-top: 8px">
                    <span class="pill scope">{{ c.doc.voit }}</span><span class="pill strong">{{ c.count }} droits sur {{ total }}</span>
                  </div>
                </div>
                <p>{{ c.doc.cree }}</p>
                <ol class="flow">
                  @for (e of c.doc.etapes; track $index) {
                    <li><b>{{ e[0] }}</b><span>{{ e[1] }}</span></li>
                  }
                </ol>
                <p class="cap">Compte de test : <code>{{ c.doc.compte.email }}</code>{{ c.doc.compte.demoSeulement ? " (démonstration seulement)" : "" }}</p>
              </div>
              <div>
                <div><div class="lbl">Peut</div><ul class="plain">@for (x of c.doc.peut; track $index) {<li>{{ x }}</li>}</ul></div>
                <div><div class="lbl">Ne peut pas</div><ul class="plain cant">@for (x of c.doc.nepeut; track $index) {<li>{{ x }}</li>}</ul></div>
              </div>
            </div>
          }
        </section>

        <section id="f5">
          <h2><span class="n">F5</span>Parcours clés</h2>
          <h3>Se connecter</h3>
          <pre class="tree">{{ trees.connexion }}</pre>
          <h3>Enregistrer un producteur</h3>
          <pre class="tree">{{ trees.dossier }}</pre>
          <h3>Ajouter un technicien</h3>
          <pre class="tree">{{ trees.technicien }}</pre>
          <h3>Ajouter un logo ou une photo</h3>
          <pre class="tree">{{ trees.image }}</pre>
        </section>

        <section id="f6">
          <h2><span class="n">F6</span>Les écrans de la console web</h2>
          <p>Le menu s'adapte à la personne connectée : il n'affiche que ce qu'elle a le droit de voir.</p>
          <pre class="tree">{{ trees.menu }}</pre>
          <ul class="plain">
            <li>Interface en français ; le wolof est prévu et sera finalisé après relecture par un locuteur.</li>
            <li>Recherche rapide dans toute la plateforme, filtres par coopérative et par campagne.</li>
            <li>Imports et exports Excel, carte des parcelles.</li>
          </ul>
        </section>

        <section id="f7">
          <h2><span class="n">F7</span>Application mobile</h2>
          <p>L'application des techniciens est pensée pour le terrain : elle fonctionne sans réseau, sur des téléphones anciens ou d'entrée de gamme, et envoie les informations quand la connexion revient.</p>
          <div class="grid">
            <div class="card"><h3>Ce que fait le technicien</h3><ul class="plain"><li>Consulter la liste des producteurs, même hors connexion</li><li>Créer ou corriger une fiche producteur, avec photos (dont CNI recto et verso)</li><li>Relever une parcelle au GPS : surface et périmètre calculés</li><li>Saisir les cultures par saison</li><li>Voir les corrections demandées et les envois en attente</li></ul></div>
            <div class="card"><h3>Sécurité du téléphone</h3><ul class="plain"><li>Activation du téléphone avec le code remis par le gestionnaire</li><li>Code PIN à chaque ouverture</li><li>Blocage après 3 codes PIN faux</li><li>Accès retiré à distance si le téléphone est perdu</li></ul></div>
          </div>
          <pre class="tree">{{ trees.mobile }}</pre>
        </section>

        <section id="f8">
          <h2><span class="n">F8</span>Protection des données</h2>
          <div class="grid">
            <div class="card"><h3>Qui peut entrer</h3><ul class="plain"><li>Connexion en deux étapes : mot de passe, puis code reçu par e-mail</li><li>Mots de passe jamais conservés en clair</li><li>Code du technicien à usage unique, valable 72 heures</li><li>Trop d'essais faux : l'accès se bloque</li><li>Session fermée après 7 jours sans connexion</li></ul></div>
            <div class="card"><h3>Qui voit quoi</h3><ul class="plain"><li>Chaque coopérative ne voit que ses propres informations</li><li>Numéro de CNI masqué ; l'afficher en entier demande un droit et un motif</li><li>Les actions sensibles sont gardées dans un journal (qui, quoi, quand)</li><li>Photos et logos conservés dans un espace privé, jamais publics</li></ul></div>
          </div>
        </section>

        <section id="f9">
          <h2><span class="n">F9</span>Comptes de test</h2>
          <p>Ces comptes sont fictifs et servent uniquement à essayer la plateforme. Ils seront supprimés à la fin des tests.</p>
          <div class="creds">
            <div class="cred"><span>Adresse</span><b>{{ access.site }}</b><small>saisir d'abord le code d'accès du site</small></div>
            <div class="cred"><span>Mot de passe (tous)</span><b>{{ access.password }}</b><small>identique pour tous les comptes</small></div>
            <div class="cred"><span>Code de connexion</span><b>{{ access.code }}</b><small>pendant la période de test uniquement</small></div>
          </div>
          <div class="tbl">
            <table>
              <thead><tr><th>Rôle</th><th>Nom</th><th>E-mail</th><th>Ce qu'il voit</th><th></th></tr></thead>
              <tbody>
                @for (r of roles; track r.id) {
                  <tr>
                    <td class="k">{{ r.doc.nom }}</td>
                    <td>{{ r.doc.compte.personne }}</td>
                    <td><code>{{ r.doc.compte.email }}</code></td>
                    <td>{{ r.doc.compte.perimetre }}</td>
                    <td><button type="button" class="copy" (click)="copy(r.doc.compte.email)">{{ copied() === r.doc.compte.email ? "Copié" : "Copier" }}</button></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="note info">
            <p><b>Pour essayer un autre rôle :</b> se déconnecter, puis se reconnecter avec l'e-mail du rôle voulu.</p>
            <p><b>Application mobile :</b> se connecter avec un compte ci-dessus, puis choisir un code PIN ; <code>1234</code> si l'étape a été passée.</p>
          </div>
          <div class="note warn"><p><b>À la fin des tests,</b> le code <code>{{ access.code }}</code> sera désactivé et ces comptes supprimés, avant l'ouverture aux vrais utilisateurs.</p></div>
        </section>

        <section id="f10">
          <h2><span class="n">F10</span>Identité visuelle et crédits</h2>
          <p>Les photos de la page de connexion viennent de Wikimedia Commons. Leurs crédits sont <b>obligatoires</b> pour les licences CC BY et CC BY-SA, et de courtoisie pour CC0 et le domaine public. Ils sont à publier sur une future page « Mentions et crédits ».</p>
          <div class="tbl">
            <table>
              <thead><tr><th>Photo</th><th>Auteur</th><th>Licence</th><th>Source (Wikimedia Commons)</th></tr></thead>
              <tbody>
                @for (p of credits; track p.source) {
                  <tr><td>{{ p.photo }}</td><td>{{ p.auteur }}</td><td>@if (p.obligatoire) {<b>{{ p.licence }}</b>} @else {{{ p.licence }}}</td><td><code>{{ p.source }}</code></td></tr>
                }
              </tbody>
            </table>
          </div>
          <p class="cap">Texte suggéré : « Photo : [auteur], [licence], via Wikimedia Commons », avec un lien vers la page source et vers la licence.</p>
          <h3>Fichiers officiels attendus</h3>
          <ul class="plain">
            <li>Logo Mbay Diaay : les symboles actuels ont été extraits du PDF de la charte V2 ; les fichiers officiels les remplaceront.</li>
            <li>Logo CRADESC : la version actuelle vient du site cradesc.org (image PNG) ; une version vectorielle officielle est attendue.</li>
          </ul>
        </section>

        <section id="f11">
          <h2><span class="n">F11</span>Avancement et suites</h2>
          <div class="tbl">
            <table>
              <thead><tr><th>Fonction</th><th>État</th><th>Détail</th></tr></thead>
              <tbody>
                @for (a of avancement; track a.fonction) {
                  <tr><td class="k">{{ a.fonction }}</td><td><span class="pill" [class]="'pill ' + a.etat">{{ progressLabel[a.etat] }}</span></td><td>{{ a.detail }}</td></tr>
                }
              </tbody>
            </table>
          </div>
          <h3>Prochaines étapes</h3>
          <ul class="plain">@for (s of etapes; track $index) {<li>{{ s }}</li>}</ul>
        </section>

        <div class="band t" id="partie-technique">
          <div class="mono">Partie 2 · Annexe</div>
          <h2>Architecture technique</h2>
          <p>Pour le prestataire informatique ou toute personne qui reprendrait le projet : composants, organisation du code, serveur central et hébergement.</p>
        </div>

        <section id="t1">
          <h2><span class="n">T1</span>Composants</h2>
          <pre class="tree">{{ trees.composants }}</pre>
          <div class="tbl">
            <table>
              <thead><tr><th>Application</th><th>Technologies</th><th>Tests</th></tr></thead>
              <tbody>@for (s of stack; track s.app) {<tr><td class="k">{{ s.app }}</td><td>{{ s.techno }}</td><td>{{ s.tests }}</td></tr>}</tbody>
            </table>
          </div>
          <ul class="plain">
            <li>Le web fonctionne en deux modes : branché sur l'API (<code>VITE_API_URL</code>) ou démonstration en mémoire (<code>VITE_DEMO_MODE</code>).</li>
            <li>Les droits sont vérifiés côté serveur à chaque requête ; le web et le mobile ne font que refléter les droits reçus par <code>GET /me</code>.</li>
            <li>Les images sont réduites dans le navigateur (512 px, WebP), contrôlées par l'API sur leur contenu, puis servies par liens signés valables 1 h.</li>
          </ul>
        </section>

        <section id="t2">
          <h2><span class="n">T2</span>Dépôts et arborescences</h2>
          <p>Trois dépôts GitHub dans l'organisation <code>mbay-diaay</code> : <code>mbay-diaay-api</code>, <code>mbay-diaay</code> (web) et <code>mobile-app</code>.</p>
          <h3>API</h3>
          <pre class="tree">{{ trees.depotApi }}</pre>
          <h3>Console web</h3>
          <pre class="tree">{{ trees.depotWeb }}</pre>
          <h3>Application mobile</h3>
          <pre class="tree">{{ trees.depotMobile }}</pre>
        </section>

        <section id="t3">
          <h2><span class="n">T3</span>Serveur central (API)</h2>
          <p class="lead">Monolithe modulaire NestJS. Préfixe <code>/v1</code>, erreurs au format <code>{{ '{' }} code, message, details {{ '}' }}</code>, contrat OpenAPI versionné dans <code>docs/openapi.json</code>.</p>
          <div class="tbl">
            <table>
              <thead><tr><th>Domaine</th><th>Routes</th><th>Usage</th></tr></thead>
              <tbody>@for (r of apiRoutes; track r.domaine) {<tr><td class="k">{{ r.domaine }}</td><td><code>{{ r.routes }}</code></td><td>{{ r.usage }}</td></tr>}</tbody>
            </table>
          </div>
          <div class="grid">
            <div class="card"><h3>Tables gérées par l'API</h3><ul class="plain"><li><code>users</code> : comptes, téléphone, sexe, âge, activation</li><li><code>user_scopes</code> : liens compte ↔ coopératives</li><li><code>role_permissions</code>, <code>custom_roles</code> : droits et rôles créés</li><li><code>audit_logs</code> : journal</li><li><code>media</code> : une image par fiche</li></ul></div>
            <div class="card"><h3>Schéma métier CRADESC v2</h3><p>Environ 80 tables (<code>organisation</code>, <code>producteur</code>, <code>membre</code>, <code>localite</code>, <code>piece_identite</code>, <code>photo</code>, <code>document_administratif</code>…), dans <code>infra/db/mbay_diaay_schema_v2.sql</code>.</p></div>
            <div class="card"><h3>Sécurité technique</h3><ul class="plain"><li>bcrypt ; code e-mail 6 chiffres, 10 min, 5 essais</li><li>Limitation de débit : 120 req/min, 20 pour la connexion</li><li>Helmet, CORS restreint, validation stricte</li><li>Refus de démarrer avec un secret faible</li><li>Format des images vérifié sur le contenu ; SVG refusé</li></ul></div>
          </div>
        </section>

        <section id="t4">
          <h2><span class="n">T4</span>Hébergement et déploiement</h2>
          <div class="tbl">
            <table>
              <thead><tr><th>Élément</th><th>Valeur</th></tr></thead>
              <tbody>
                <tr><td class="k">Console web</td><td><code>https://www.mbaydiaay.com</code> (site statique nginx)</td></tr>
                <tr><td class="k">Ce rapport</td><td><code>https://www.mbaydiaay.com/architecture</code> (public, non indexé)</td></tr>
                <tr><td class="k">API</td><td><code>https://api.mbaydiaay.com/v1</code></td></tr>
                <tr><td class="k">Serveur</td><td>VPS, services en conteneurs Docker Compose, HTTPS automatique</td></tr>
                <tr><td class="k">Images Docker</td><td><code>ghcr.io/mbay-diaay/mbay-diaay-api</code> (balises <code>latest</code> et SHA du commit)</td></tr>
              </tbody>
            </table>
          </div>
          <pre class="tree">{{ trees.livraison }}</pre>
          <h3>Variables d'environnement</h3>
          <p>Les valeurs secrètes sont saisies dans la configuration du serveur, jamais dans le code.</p>
          <div class="tbl">
            <table>
              <thead><tr><th>Groupe</th><th>Variables</th></tr></thead>
              <tbody>@for (v of envVars; track v.groupe) {<tr><td class="k">{{ v.groupe }}</td><td><code>{{ v.vars }}</code></td></tr>}</tbody>
            </table>
          </div>
        </section>
      </main>

      <footer>Mbay Diaay · Livrable L2 · Architecture fonctionnelle et technique · mis à jour le {{ updatedAt }}. Toutes les personnes et données citées sont fictives.</footer>
    </div>
  `,
})
export default class ArchitecturePage {
  private readonly document = inject(DOCUMENT);

  protected readonly updatedAt = new Date(`${L2_UPDATED_AT}T12:00:00`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  protected readonly total = TOTAL_PERMISSIONS;
  protected readonly columns = MATRIX_COLUMNS;
  protected readonly trees = TREES;
  protected readonly access = TEST_ACCESS;
  protected readonly credits = PHOTO_CREDITS;
  protected readonly avancement = AVANCEMENT;
  protected readonly progressLabel = PROGRESS_LABEL;
  protected readonly etapes = PROCHAINES_ETAPES;
  protected readonly apiRoutes = API_ROUTES;
  protected readonly stack = TECH_STACK;
  protected readonly envVars = ENV_VARS;

  protected readonly roles = DOC_ROLES.map((id) => ({
    id,
    doc: ROLE_DOCS[id],
    count: permissionCount(id),
    row: matrixRow(id),
  }));

  protected readonly fSections: SectionLink[] = [
    { id: "f1", n: "F1", label: "Ce que fait la plateforme" },
    { id: "f2", n: "F2", label: "Organisation du réseau" },
    { id: "f3", n: "F3", label: "Les rôles" },
    { id: "f4", n: "F4", label: "Parcours par rôle" },
    { id: "f5", n: "F5", label: "Parcours clés" },
    { id: "f6", n: "F6", label: "Les écrans" },
    { id: "f7", n: "F7", label: "Application mobile" },
    { id: "f8", n: "F8", label: "Protection des données" },
    { id: "f9", n: "F9", label: "Comptes de test" },
    { id: "f10", n: "F10", label: "Identité et crédits" },
    { id: "f11", n: "F11", label: "Avancement et suites" },
  ];
  protected readonly tSections: SectionLink[] = [
    { id: "t1", n: "T1", label: "Composants" },
    { id: "t2", n: "T2", label: "Dépôts et arborescences" },
    { id: "t3", n: "T3", label: "Serveur central (API)" },
    { id: "t4", n: "T4", label: "Hébergement" },
  ];

  protected readonly role = signal<DocRoleId>("admin");
  protected readonly current = computed(() => this.roles.find((r) => r.id === this.role()) ?? null);
  protected readonly copied = signal("");

  constructor() {
    // Lien direct vers une section (#f3) ou un rôle (#technicien) : lu une fois la page affichée.
    afterNextRender(() => {
      const hash = decodeURIComponent(this.document.location.hash.slice(1));
      if (!hash) return;
      if ((DOC_ROLES as readonly string[]).includes(hash)) this.pick(hash as DocRoleId, true);
      else this.go(hash, false);
    });
  }

  /** Défile jusqu'à une section ; l'adresse garde l'ancre pour pouvoir partager le lien. */
  protected go(id: string, updateHash = true): void {
    this.document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (updateHash) this.setHash(id);
  }

  protected pick(id: DocRoleId, scroll = false): void {
    this.role.set(id);
    this.setHash(id);
    if (scroll) this.document.getElementById("f4")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  protected copy(text: string): void {
    const done = () => {
      this.copied.set(text);
      setTimeout(() => this.copied.set(""), 1500);
    };
    try {
      void this.document.defaultView?.navigator.clipboard.writeText(text).then(done, () => undefined);
    } catch {
      // Presse-papiers refusé : l'adresse reste sélectionnable à la main.
    }
  }

  private setHash(id: string): void {
    try {
      const { pathname, search } = this.document.location;
      this.document.defaultView?.history.replaceState(this.document.defaultView.history.state, "", `${pathname}${search}#${id}`);
    } catch {
      // Sans historique (aperçu, navigateur restreint) : pas d'ancre, la page reste utilisable.
    }
  }
}
