/**
 * Téléphone sénégalais : 9 chiffres commençant par 70, 75, 76, 77 ou 78, affichés « 77 123 45 67 ». L'indicatif 221
 * (avec ou sans +) saisi ou collé est toléré, ainsi que les espaces. Aucun autre pays n'est accepté.
 *
 * RÈGLE (décision Q-17, REGLES.md §4 ter) : ce format n'est exigé QUE SUR LE WEB, quand une personne saisit une valeur
 * NOUVELLE ou MODIFIÉE. Une valeur existante inchangée n'est jamais refusée et n'empêche jamais d'enregistrer une fiche
 * (voir `isPhoneInputAccepted`). Ni l'API ni la base ne contrôlent le téléphone.
 */
const SENEGAL_PHONE = /^7[05678]\d{7}$/;

/** Chiffres seulement, sans l'indicatif 221, au plus 9 chiffres. */
export function senegalPhoneDigits(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.length > 9 && digits.startsWith("221")) digits = digits.slice(3);
  return digits.slice(0, 9);
}

/** Met en forme pendant la saisie : « 771234567 » devient « 77 123 45 67 ». Les lettres et symboles sont ignorés. */
export function formatSenegalPhone(raw: string): string {
  const digits = senegalPhoneDigits(raw);
  const groups = [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 7), digits.slice(7, 9)];
  return groups.filter((group) => group.length > 0).join(" ");
}

/**
 * Le numéro saisi est-il acceptable ? Oui s'il est inchangé par rapport à la valeur existante (même hors format), sinon
 * il doit avoir le format sénégalais. Une saisie vide est acceptée ici : l'obligation de renseigner le numéro, quand
 * elle existe, se contrôle à part.
 */
export function isPhoneInputAccepted(raw: string, original?: string | null): boolean {
  const next = raw.trim();
  if (!next) return true;
  const before = (original ?? "").trim();
  if (next === before) return true;
  if (before && next.replace(/\D/g, "") === before.replace(/\D/g, "")) return true;
  return isSenegalPhone(next);
}

export function isSenegalPhone(raw: string): boolean {
  const allDigits = raw.replace(/\D/g, "");
  const national = allDigits.length === 12 && allDigits.startsWith("221") ? allDigits.slice(3) : allDigits;
  return SENEGAL_PHONE.test(national);
}
