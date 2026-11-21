/**
 * «Contacts» in AMR ID: cards the user saved. Only the nicks are kept; the card itself is read
 * fresh every time, so a saved contact never goes stale (new number → you already see it).
 */
import type { KvStore } from "./storage/types.ts";

export const SAVED_MAX = 300;
export type SavedEntry = { nick: string; at: number };

export const savedKey = (owner: string) => `saved:${owner}`;

export function parseSaved(raw: string | null): SavedEntry[] {
  if (!raw) return [];
  try {
    const a = JSON.parse(raw) as SavedEntry[];
    return Array.isArray(a) ? a.filter((x) => x && typeof x.nick === "string" && typeof x.at === "number") : [];
  } catch {
    return [];
  }
}

/** Adds (or moves to the top) several nicks; the own nick is skipped; newest first; capped. */
export function addSaved(list: SavedEntry[], nicks: string[], self: string, now = Date.now()): SavedEntry[] {
  const fresh = nicks.filter((n, i) => n && n !== self && nicks.indexOf(n) === i).map((nick, i) => ({ nick, at: now - i }));
  const keep = list.filter((x) => !fresh.some((f) => f.nick === x.nick));
  return [...fresh, ...keep].slice(0, SAVED_MAX);
}

export function removeSaved(list: SavedEntry[], nick: string): SavedEntry[] {
  return list.filter((x) => x.nick !== nick);
}

export async function readSaved(kv: KvStore, owner: string): Promise<SavedEntry[]> {
  return parseSaved(await kv.get(savedKey(owner)));
}
