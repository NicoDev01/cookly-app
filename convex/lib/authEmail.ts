/**
 * E-Mail-Varianten für den Duplikat-Check bei der Passwort-Registrierung:
 * exakter Wert, kleingeschrieben und Google-Alias (gmail.com <-> googlemail.com).
 */
export function duplicateEmailCandidates(email: string): string[] {
  const trimmed = email.trim();
  const lower = trimmed.toLowerCase();
  const candidates = new Set<string>([trimmed, lower]);

  if (lower.endsWith("@gmail.com")) {
    candidates.add(`${lower.slice(0, -"@gmail.com".length)}@googlemail.com`);
  } else if (lower.endsWith("@googlemail.com")) {
    candidates.add(`${lower.slice(0, -"@googlemail.com".length)}@gmail.com`);
  }

  return [...candidates].filter(Boolean);
}
