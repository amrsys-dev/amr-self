/** Old nicks are not reissued (default). Flip AMR_NICK_REISSUE=true only after Murad decides. */

export function nickReissueAllowed(): boolean {
  const v = (process.env.AMR_NICK_REISSUE ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

export function reservedNickKey(nick: string): string {
  return `reserved:${nick.toLowerCase()}`;
}

export type ReservedNick = { reservedAt: string; reason: "retired" };
