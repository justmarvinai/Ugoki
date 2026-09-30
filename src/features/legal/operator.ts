/**
 * The site operator — a private individual in Germany (USER_QUESTIONS A3, ADR-017). Shown in the
 * Impressum, the privacy policy's controller section and the copyright line on /legal/licenses.
 *
 * TODO(owner, USER_QUESTIONS O4): replace the bracketed placeholders with your full name, a
 * street address where you can be reached (a P.O. box is not enough) and an email address, then
 * set OPERATOR_COMPLETE to true. Have the final legal texts checked before launch — they are not
 * legal advice.
 */

export const OPERATOR = {
  name: '[Vor- und Nachname]',
  street: '[Straße und Hausnummer]',
  city: '[PLZ und Ort]',
  country: { de: 'Deutschland', en: 'Germany' },
  email: '[E-Mail-Adresse]',
} as const;

/** False while the details above are placeholders. */
export const OPERATOR_COMPLETE = false;

/** The year the copyright line starts from. */
export const COPYRIGHT_YEAR = 2026;
