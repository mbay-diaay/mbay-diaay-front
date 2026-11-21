/**
 * Téléphone sénégalais : 9 chiffres, affichés « 77 123 45 67 ». Mobiles en 70, 75, 76, 77, 78 ; fixes en 30, 33, 34.
 * L'indicatif 221 saisi ou collé est retiré. Aucun autre pays n'est accepté.
 */
const SENEGAL_PHONE = /^(7[05678]|3[034])\d{7}$/;

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

export function isSenegalPhone(raw: string): boolean {
  const allDigits = raw.replace(/\D/g, "");
  const national = allDigits.length === 12 && allDigits.startsWith("221") ? allDigits.slice(3) : allDigits;
  return SENEGAL_PHONE.test(national);
}
