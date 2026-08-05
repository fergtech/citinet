/**
 * Password strength check — client-side mirror of the same rule enforced in
 * api/server.js (isPasswordAcceptable). NIST 800-63B favors length + a
 * common-password blocklist over forced complexity rules (no "must contain a
 * symbol" nonsense), so that's what this checks: a floor length, and outright
 * rejection of passwords weak enough that the "search-then-verify" attack
 * described for this hub's demo users would find them in seconds.
 */

const MIN_LENGTH = 10;

// Not exhaustive -- just enough to catch the passwords a real dictionary
// attack tries first. Checked case-insensitively.
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890',
  'qwerty123', 'qwertyuiop', 'letmein123', 'iloveyou123', 'admin1234', 'welcome123',
  'sunshine123', 'football123', 'baseball123', 'dragon1234', 'monkey1234', 'trustno1',
  'abc123456', 'password!', 'p@ssword', 'p@ssw0rd', 'changeme123', 'temppassword',
]);

function isTrivialPattern(password: string): boolean {
  const lower = password.toLowerCase();
  // All one repeated character (e.g. "aaaaaaaaaa")
  if (/^(.)\1+$/.test(password)) return true;
  // Straight ascending/descending run of digits or letters (e.g. "1234567890", "abcdefghij")
  const isSequential = (s: string, step: number) =>
    [...s].every((_ch, i) => i === 0 || s.charCodeAt(i) === s.charCodeAt(i - 1) + step);
  if (isSequential(lower, 1) || isSequential(lower, -1)) return true;
  return false;
}

export interface PasswordStrengthResult {
  acceptable: boolean;
  reason: string | null;
}

/** Checks length + blocklist + trivial patterns. Not a full entropy estimator by design. */
export function checkPasswordStrength(password: string): PasswordStrengthResult {
  if (password.length < MIN_LENGTH) {
    return { acceptable: false, reason: `Use at least ${MIN_LENGTH} characters — a short memorable phrase works well` };
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return { acceptable: false, reason: 'That password is too common — anyone with server access could guess it in seconds' };
  }
  if (isTrivialPattern(password)) {
    return { acceptable: false, reason: 'Avoid repeated or sequential characters' };
  }
  return { acceptable: true, reason: null };
}
