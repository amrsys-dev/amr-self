/** Cards saved on this phone before signing in (moved into the account after sign-in). */
const KEY = "amr-id:saved-local";

export function localSaved(): string[] {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) || "[]") as unknown;
    return Array.isArray(a) ? a.filter((x): x is string => typeof x === "string").slice(0, 50) : [];
  } catch {
    return [];
  }
}

export function addLocalSaved(nick: string) {
  try {
    const list = [nick, ...localSaved().filter((n) => n !== nick)].slice(0, 50);
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function clearLocalSaved() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
