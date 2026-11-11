/** Client-side data key wrap/unwrap + gzip + AES-GCM. Also used in Node tests. */

const enc = new TextEncoder();
const dec = new TextDecoder();
const PBKDF2_ITERS = 210_000;

export type WrappedKey = {
  salt: string;
  iv: string;
  ct: string;
};

export type EncryptedBlob = {
  iv: string;
  ct: string;
};

export function b64url(data: Uint8Array): string {
  let bin = "";
  for (const b of data) bin += String.fromCharCode(b);
  const b64 = btoa(bin);
  return b64.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function unb64url(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = s.replaceAll("-", "+").replaceAll("_", "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

function asSource(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}


export async function generateDataKey(): Promise<Uint8Array> {
  return randomBytes(32);
}

async function deriveAesKey(secret: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", enc.encode(secret), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: asSource(salt), iterations: PBKDF2_ITERS, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function wrapKey(dataKey: Uint8Array, secret: string): Promise<WrappedKey> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveAesKey(secret, salt);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: asSource(iv) }, key, asSource(dataKey)));
  return { salt: b64url(salt), iv: b64url(iv), ct: b64url(ct) };
}

export async function unwrapKey(wrapped: WrappedKey, secret: string): Promise<Uint8Array> {
  const key = await deriveAesKey(secret, unb64url(wrapped.salt));
  const iv = unb64url(wrapped.iv);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: asSource(iv) }, key, asSource(unb64url(wrapped.ct)));
  return new Uint8Array(pt);
}

export async function gzipBytes(data: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream !== "undefined") {
    const stream = new Blob([asSource(data)]).stream().pipeThrough(new CompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  const { gzipSync } = await import("node:zlib");
  return new Uint8Array(gzipSync(data));
}

export async function gunzipBytes(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream !== "undefined") {
    const stream = new Blob([asSource(data)]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  const { gunzipSync } = await import("node:zlib");
  return new Uint8Array(gunzipSync(data));
}

export async function compressAndEncrypt(dataKey: Uint8Array, value: unknown): Promise<EncryptedBlob> {
  const plain = enc.encode(JSON.stringify(value));
  const zipped = await gzipBytes(plain);
  const iv = randomBytes(12);
  const key = await crypto.subtle.importKey("raw", asSource(dataKey), "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: asSource(iv) }, key, asSource(zipped)));
  return { iv: b64url(iv), ct: b64url(ct) };
}

export async function decryptAndDecompress(dataKey: Uint8Array, blob: EncryptedBlob): Promise<unknown> {
  const key = await crypto.subtle.importKey("raw", asSource(dataKey), "AES-GCM", false, ["decrypt"]);
  const iv = unb64url(blob.iv);
  const zipped = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: asSource(iv) }, key, asSource(unb64url(blob.ct))));
  const plain = await gunzipBytes(zipped);
  return JSON.parse(dec.decode(plain)) as unknown;
}

const RECOVERY_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function generateRecoveryCode(): string {
  const bytes = randomBytes(16);
  const chars = Array.from(bytes, (b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]).join("");
  return (chars.match(/.{1,4}/g) ?? [chars]).join("-");
}

export function normalizeRecoveryCode(raw: string): string {
  const cleaned = raw
    .toUpperCase()
    .replaceAll("O", "0")
    .replaceAll("I", "1")
    .replaceAll("L", "1")
    .replace(/[^0-9A-Z]/g, "");
  return (cleaned.match(/.{1,4}/g) ?? [cleaned]).join("-");
}

export function recoveryCodeCompact(code: string): string {
  return normalizeRecoveryCode(code).replaceAll("-", "");
}
