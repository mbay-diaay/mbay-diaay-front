/**
 * Styles des écrans d'authentification (charte V2) : libellé, bouton principal, liens, encadrés. Même rendu que la page
 * de connexion ; à placer dans `styles` de chaque page qui utilise `<app-auth-shell>`.
 */
export const AUTH_FORM_STYLES = `
  button:not(:disabled),
  a[href] {
    cursor: pointer;
  }
  button:disabled {
    cursor: not-allowed;
  }
  .mono {
    font-family: var(--v2-font-mono);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .label {
    display: block;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--v2-ardoise);
  }
  .btn-primary {
    display: flex;
    height: 64px;
    width: 100%;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border-radius: var(--v2-radius-champ);
    background: var(--v2-foret);
    padding: 0 8px 0 24px;
    font-size: 17px;
    font-weight: 800;
    color: var(--v2-blanc);
    transition: background-color 0.15s ease;
  }
  .btn-primary:hover {
    background: var(--v2-foret-clair);
  }
  .btn-primary:focus-visible {
    outline: none;
    box-shadow: var(--v2-halo);
  }
  .btn-primary:disabled {
    background: var(--v2-lin);
    color: var(--v2-gris-texte);
    pointer-events: none;
  }
  .btn-chip {
    display: grid;
    height: 48px;
    width: 48px;
    place-items: center;
    border-radius: 14px;
    background: var(--v2-citron);
    color: var(--v2-foret);
  }
  .btn-primary:disabled .btn-chip {
    background: var(--v2-gris-trait);
    color: var(--v2-blanc);
  }
  .link {
    font-weight: 700;
    color: var(--v2-foret-clair);
    text-underline-offset: 3px;
  }
  .link:hover {
    text-decoration: underline;
  }
  .link:focus-visible,
  .ghost:focus-visible {
    outline: 2px solid var(--v2-foret);
    outline-offset: 2px;
    border-radius: 6px;
  }
  .alert {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    border-radius: 16px;
    padding: 14px 16px;
    font-size: 15px;
    font-weight: 600;
    background: var(--v2-erreur-bg);
    color: var(--v2-erreur-fg);
  }
  .note {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    border-radius: 16px;
    border: 2px dashed var(--v2-gris-trait);
    background: var(--v2-blanc);
    padding: 14px;
    font-size: 14px;
  }
  @media (max-width: 420px) {
    :host ::ng-deep app-otp-input input {
      width: 46px;
      height: 58px;
    }
  }
  :host ::ng-deep app-otp-input input {
    height: 64px;
    width: 56px;
    border-radius: 16px;
    border: 1.5px solid var(--v2-gris-trait);
    background: var(--v2-blanc);
    font-family: var(--v2-font-mono);
    font-size: 20px;
    font-weight: 700;
    color: var(--v2-encre);
    box-shadow: none;
  }
  :host ::ng-deep app-otp-input input:focus-visible {
    outline: none;
    border: 2px solid var(--v2-foret);
    box-shadow: var(--v2-halo);
  }
`;
