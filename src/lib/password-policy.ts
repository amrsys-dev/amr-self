/**
 * Password rules: at least 8 characters with letters (any alphabet) and digits, not a common
 * password, not the nick. Simple to follow for everyone; the key is stretched by the KDF anyway.
 * The sign-up screen shows each rule live (green / red) so people see what to fix.
 */

const COMMON = new Set(
  [
    "password", "password1", "password10", "password123", "passw0rd",
    "1234567890", "12345678901", "0123456789", "1111111111", "0000000000",
    "qwertyuiop", "qwerty1234", "asdfghjkl;", "letmein123", "welcome123",
    "admin12345", "iloveyou12", "monkey1234", "dragon1234", "master1234",
    "abc1234567", "1q2w3e4r5t", "zaq12wsx", "zaq1xsw2", "pass123456",
    "q1w2e3r4t5", "sunshine12", "princess12", "football12", "baseball12",
    "changeme12", "letmein!23", "p@ssw0rd12", "p@ssword12", "adminadmin",
    "rootroot12", "welcome1!", "testtest12", "useruser12", "amrid12345",
    "amrpassword", "saudi12345", "riyadh1234", "makkah1234",
  ].map((s) => s.toLowerCase()),
);

export type PasswordPolicyResult = { ok: true } | { ok: false; reason: "short" | "weak" | "same_as_nick" };

export type PasswordChecks = { len: boolean; mix: boolean; simple: boolean; nick: boolean };

/** Each rule separately, for the live checklist. */
export function passwordChecks(password: string, nick?: string): PasswordChecks {
  const lower = password.toLowerCase();
  const compact = (nick ?? "").replace(/^@/, "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  return {
    len: password.length >= 8,
    mix: /\p{L}/u.test(password) && /\p{N}/u.test(password),
    simple: !(COMMON.has(lower) || /^(.)\1+$/.test(password) || /^(?:0123|1234|2345|3456|4567|5678|6789|9876|qwerty|asdf)/i.test(password)),
    nick: !(compact.length >= 4 && lower.replace(/[^\p{L}\p{N}]/gu, "").includes(compact)),
  };
}

export function checkPassword(password: string, nick?: string): PasswordPolicyResult {
  const c = passwordChecks(password, nick);
  if (!c.len) return { ok: false, reason: "short" };
  if (!c.nick) return { ok: false, reason: "same_as_nick" };
  if (!c.mix || !c.simple) return { ok: false, reason: "weak" };
  return { ok: true };
}

export const PASSWORD_MIN = 8;
