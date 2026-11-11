/** Password rules from SECURITY review: at least 10 characters, reject weak/common ones. */

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

export function checkPassword(password: string, nick?: string): PasswordPolicyResult {
  if (password.length < 10) return { ok: false, reason: "short" };
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return { ok: false, reason: "weak" };
  if (/^(.)\1+$/.test(password)) return { ok: false, reason: "weak" };
  if (/^\d+$/.test(password) && /^(0123|1234|2345|3456|4567|5678|6789|9876|0000|1111|2222)/.test(password)) {
    return { ok: false, reason: "weak" };
  }
  if (nick) {
    const compact = nick.replace(/^@/, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (compact.length >= 4 && lower.includes(compact)) return { ok: false, reason: "same_as_nick" };
  }
  return { ok: true };
}

export const PASSWORD_MIN = 10;
