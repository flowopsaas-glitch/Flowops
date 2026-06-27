/**
 * ISO 6346 container-number validation.
 * Format: 4 letters (owner code + category U/J/Z) + 6 digits + 1 check digit.
 * Returns whether the number is well-formed and whether the check digit is valid.
 */

// Letter values per ISO 6346 (skips multiples of 11: 11, 22, 33).
const LETTER_VALUES: Record<string, number> = {
  A: 10, B: 12, C: 13, D: 14, E: 15, F: 16, G: 17, H: 18, I: 19, J: 20,
  K: 21, L: 23, M: 24, N: 25, O: 26, P: 27, Q: 28, R: 29, S: 30, T: 31,
  U: 32, V: 34, W: 35, X: 36, Y: 37, Z: 38,
};

export interface ContainerNumberCheck {
  normalized: string;
  wellFormed: boolean;
  checkDigitValid: boolean;
}

export function checkContainerNumber(raw: string): ContainerNumberCheck {
  const normalized = String(raw || '').toUpperCase().replace(/\s+/g, '');
  const wellFormed = /^[A-Z]{4}\d{7}$/.test(normalized);
  if (!wellFormed) return { normalized, wellFormed: false, checkDigitValid: false };

  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const ch = normalized[i];
    const value = i < 4 ? LETTER_VALUES[ch] : Number(ch);
    sum += value * Math.pow(2, i);
  }
  let check = sum % 11;
  if (check === 10) check = 0;
  const checkDigitValid = check === Number(normalized[10]);
  return { normalized, wellFormed: true, checkDigitValid };
}
