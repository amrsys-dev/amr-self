/** Old nicks are never reissued. The env flag is kept for compatibility but is ignored. */

export function nickReissueAllowed(): boolean {
  return false;
}

export function reservedNickKey(nick: string): string {
  return `reserved:${nick.toLowerCase()}`;
}

export type ReservedNick = { reservedAt: string; reason: "retired" | "renamed" };
