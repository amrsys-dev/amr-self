/**
 * Card cover photo. The client sends an already compressed JPEG (or WebP); it is stored
 * as a blob under a random key that does not change when the nick changes.
 */
import { randomBytes } from "node:crypto";
import { json, limits } from "../http.ts";
import { getStores } from "../storage/index.ts";
import { normalizeNick } from "../nick.ts";
import { nickKey, type UserRecord } from "../user.ts";
import { requireUser } from "./session.ts";

export const PHOTO_MAX_BYTES = 400 * 1024;

export function photoUrl(user: Pick<UserRecord, "nick" | "photo">): string | null {
  if (!user.photo) return null;
  return `/api/card-photo/${encodeURIComponent(user.nick.replace(/^@/, ""))}?v=${user.photo.v}`;
}

export function avatarUrl(user: Pick<UserRecord, "nick" | "avatar">): string | null {
  if (!user.avatar) return null;
  return `/api/card-photo/${encodeURIComponent(user.nick.replace(/^@/, ""))}?slot=avatar&v=${user.avatar.v}`;
}

/** Two pictures per card: the cover (background) and the round face photo. */
export type PhotoSlot = "cover" | "avatar";
export const photoSlot = (raw: string | null | undefined): PhotoSlot => (raw === "avatar" ? "avatar" : "cover");
const field = (slot: PhotoSlot) => (slot === "avatar" ? "avatar" : "photo") as "avatar" | "photo";

/** JPEG starts with FF D8 FF; WebP is RIFF....WEBP. */
export function photoType(bytes: Uint8Array): "image/jpeg" | "image/webp" | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

export async function handlePhotoPut(request: Request): Promise<Response> {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  if (Number(request.headers.get("content-length") ?? "0") > PHOTO_MAX_BYTES) return json({ error: "invalid", hint: "too_large" }, 413);
  const slot = photoSlot(new URL(request.url).searchParams.get("slot"));
  // Own limiter (not the one for SMS codes): changing photos a few times must not lock you out.
  const hit = await limits.nick.take(`photo:${user.nick}`);
  if (!hit.ok) return json({ error: "rate_limited", retryAfterMs: hit.retryAfterMs }, 429);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length === 0 || bytes.length > PHOTO_MAX_BYTES) return json({ error: "invalid", hint: "too_large" }, 413);
  const type = photoType(bytes);
  if (!type) return json({ error: "invalid", hint: "jpeg_or_webp" }, 400);
  const stores = getStores();
  const f = field(slot);
  const key = user[f]?.key ?? `card-photo/${randomBytes(12).toString("base64url")}`;
  await stores.blobs.put(key, bytes, type);
  user[f] = { key, v: Date.now(), type };
  await stores.kv.put(nickKey(user.nick), JSON.stringify(user));
  return json({ ok: true, photo: photoUrl(user), avatar: avatarUrl(user) });
}

export async function handlePhotoDelete(request: Request): Promise<Response> {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const f = field(photoSlot(new URL(request.url).searchParams.get("slot")));
  const cur = user[f];
  if (cur) {
    await getStores().blobs.delete(cur.key);
    delete user[f];
    await getStores().kv.put(nickKey(user.nick), JSON.stringify(user));
  }
  return json({ ok: true, photo: photoUrl(user), avatar: avatarUrl(user) });
}

/** Short cache: a deleted or replaced photo disappears from caches within minutes. */
export const PHOTO_CACHE_CONTROL = "public, max-age=60, s-maxage=60, stale-while-revalidate=300";

/** Public: anyone with the card link can see the cover photo. */
export async function handlePhotoGet(nickParam: string, slotParam?: string | null): Promise<Response> {
  const nick = normalizeNick(nickParam);
  if (!nick) return new Response("not found", { status: 404 });
  const raw = await getStores().kv.get(nickKey(nick));
  if (!raw) return new Response("not found", { status: 404 });
  const user = JSON.parse(raw) as UserRecord;
  const pic = user[field(photoSlot(slotParam))];
  if (!pic) return new Response("not found", { status: 404 });
  const bytes = await getStores().blobs.get(pic.key);
  if (!bytes) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(bytes).buffer as ArrayBuffer, {
    headers: {
      "content-type": pic.type ?? "image/jpeg",
      "cache-control": PHOTO_CACHE_CONTROL,
      "x-content-type-options": "nosniff",
    },
  });
}
