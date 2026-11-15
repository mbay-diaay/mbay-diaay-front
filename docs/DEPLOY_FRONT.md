# Déploiement du front (Angular, `web-angular/`)

Le front est un **site statique** : `pnpm build` produit le dossier `web-angular/dist/client` (une page `index.html` et ses fichiers). Il n'y a aucun serveur Node à faire tourner.

## Réglages de l'application

| Réglage | Valeur |
|---|---|
| Dépôt / branche | `mbay-diaay/mbay-diaay` / `main` |
| Chemin de build (*Build Path*) | `/web-angular` |
| Type de build | Nixpacks, avec **Static SPA** activé |
| Dossier publié (*Publish Directory*) | `dist/client` |
| Node | 22.x |
| Domaine | `www.mbaydiaay.com` (HTTPS) |

**Static SPA** renvoie `index.html` pour toutes les adresses (`/login`, `/dashboard/…`, `/payer/…`) : sans lui, un rechargement de page donnerait une erreur 404.

## Variables d'environnement (lues à la construction)

| Variable | Valeur |
|---|---|
| `VITE_API_URL` | `https://api.mbaydiaay.com/v1` |
| `VITE_DEMO_MODE` | `false` |
| `VITE_SITE_GATE` | `true` tant que le site est « en construction » (code d'accès demandé) ; `false` à l'ouverture au public |
| `VITE_SITE_ACCESS_CODE` | code d'accès de l'écran « en construction » (par défaut `CRADESC-NIAYES`) |

Ces valeurs sont aussi dans `web-angular/.env.production`, qui sert de valeur par défaut. Elles sont figées dans le site au moment du build : pour changer l'adresse de l'API, modifiez la variable puis relancez le déploiement.

## En-têtes de sécurité

Un site statique ne pose pas d'en-têtes lui-même : HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` et la politique CSP (en mode rapport seulement, `connect-src 'self' https://api.mbaydiaay.com`) se règlent sur le routeur du serveur.

## En local

```bash
cd web-angular
pnpm install --ignore-workspace
pnpm dev          # développement
pnpm build        # produit dist/client
```

## Écran « en construction » et rapport L2

- Tant que `VITE_SITE_GATE` n'est pas à `false`, toute visite passe par `/construction` et demande le code d'accès (gardé ensuite dans le navigateur). Changer le code redemande l'accès à tout le monde. Ce n'est pas une sécurité : la protection reste la connexion.
- Restent ouverts sans code : `/architecture` (rapport L2, public, non indexé) et les liens de paiement `/payer/…`.
- Contenu du rapport : `web-angular/src/lib/architecture-l2.ts`. Le tableau des droits par rôle est calculé depuis `src/lib/permissions.ts`.
