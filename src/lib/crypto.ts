/** Client-side key wrap and data-file encryption (also used in Node tests).
 *
 * Data-file key is random 256-bit, wrapped twice:
 *   password  → argon2id → HKDF(label=amrid-wrap-v1)
 *   recovery  → argon2id → HKDF(label=amrid-recovery-wrap-v1)
 * A second HKDF label produces an auth/verify key that is sent to the server
 * (never the raw password or recovery code). The server stores a hash of that key.
 *
 * Data blobs are gzip + XChaCha20-Poly1305 with AAD = account id + version.
 */

import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { argon2id } from "hash-wasm";

const enc = new TextEncoder();
const dec = new TextDecoder();

/** OWASP minimum for argon2id (19 MiB, t=2, p=1). */
export const ARGON2_PARAMS = {
  memorySize: 19_456,
  iterations: 2,
  parallelism: 1,
  hashLength: 32,
} as const;

export type Argon2Opts = {
  memorySize: number;
  iterations: number;
  parallelism: number;
  hashLength: number;
};

export const HKDF_WRAP = "amrid-wrap-v1";
export const HKDF_AUTH = "amrid-auth-v1";
export const HKDF_RECOVERY_WRAP = "amrid-recovery-wrap-v1";
export const HKDF_RECOVERY_VERIFY = "amrid-recovery-verify-v1";
const WRAP_AAD = enc.encode("amrid-keywrap-v1");

export type KdfParams = {
  alg: "argon2id";
  salt: string;
  memorySize: number;
  iterations: number;
  parallelism: number;
};

export type WrappedKey = {
  iv: string;
  ct: string;
  /** Present on older wraps; new wraps keep the salt on KdfParams instead. */
  salt?: string;
};

export type EncryptedBlob = {
  alg: "xchacha20poly1305";
  iv: string;
  ct: string;
};

export function b64url(data: Uint8Array): string {
  let bin = "";
  for (const b of data) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
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

export function encodeAuthKey(key: Uint8Array): string {
  return b64url(key);
}

export function decodeAuthKey(s: string): Uint8Array | null {
  try {
    const raw = unb64url(s);
    return raw.length === 32 ? raw : null;
  } catch {
    return null;
  }
}

function paramsFrom(salt: Uint8Array, override?: Partial<Argon2Opts>): KdfParams {
  return {
    alg: "argon2id",
    salt: b64url(salt),
    memorySize: override?.memorySize ?? ARGON2_PARAMS.memorySize,
    iterations: override?.iterations ?? ARGON2_PARAMS.iterations,
    parallelism: override?.parallelism ?? ARGON2_PARAMS.parallelism,
  };
}

export async function argon2idMaster(
  secret: string,
  salt: Uint8Array,
  params: Pick<KdfParams, "memorySize" | "iterations" | "parallelism"> = ARGON2_PARAMS,
): Promise<Uint8Array> {
  const out = await argon2id({
    password: secret,
    salt,
    parallelism: params.parallelism,
    iterations: params.iterations,
    memorySize: params.memorySize,
    hashLength: ARGON2_PARAMS.hashLength,
    outputType: "binary",
  });
  return out instanceof Uint8Array ? out : new Uint8Array(out);
}

export function hkdfLabel(master: Uint8Array, label: string): Uint8Array {
  return hkdf(sha256, master, undefined, enc.encode(label), 32);
}

export async function derivePasswordKeys(
  password: string,
  salt?: Uint8Array,
  params?: Partial<Argon2Opts>,
): Promise<{ params: KdfParams; wrapKey: Uint8Array; authKey: Uint8Array }> {
  const s = salt ?? randomBytes(16);
  const kdf = paramsFrom(s, params);
  const master = await argon2idMaster(password, s, kdf);
  return { params: kdf, wrapKey: hkdfLabel(master, HKDF_WRAP), authKey: hkdfLabel(master, HKDF_AUTH) };
}

export async function deriveRecoveryKeys(
  code: string,
  salt?: Uint8Array,
  params?: Partial<Argon2Opts>,
): Promise<{ params: KdfParams; wrapKey: Uint8Array; verifyKey: Uint8Array }> {
  const s = salt ?? randomBytes(16);
  const kdf = paramsFrom(s, params);
  const master = await argon2idMaster(recoveryCodeCompact(code), s, kdf);
  return {
    params: kdf,
    wrapKey: hkdfLabel(master, HKDF_RECOVERY_WRAP),
    verifyKey: hkdfLabel(master, HKDF_RECOVERY_VERIFY),
  };
}

export function keysFromParams(params: KdfParams): { salt: Uint8Array; opts: Argon2Opts } {
  return {
    salt: unb64url(params.salt),
    opts: {
      memorySize: params.memorySize,
      iterations: params.iterations,
      parallelism: params.parallelism,
      hashLength: 32,
    },
  };
}

function xaead(key: Uint8Array, nonce: Uint8Array, aad: Uint8Array) {
  return xchacha20poly1305(key, nonce, aad);
}

export async function wrapDataKey(dataKey: Uint8Array, wrapKey: Uint8Array): Promise<WrappedKey> {
  const iv = randomBytes(24);
  const ct = xaead(wrapKey, iv, WRAP_AAD).encrypt(dataKey);
  return { iv: b64url(iv), ct: b64url(ct) };
}

export async function unwrapDataKey(wrapped: WrappedKey, wrapKey: Uint8Array): Promise<Uint8Array> {
  const iv = unb64url(wrapped.iv);
  const pt = xaead(wrapKey, iv, WRAP_AAD).decrypt(unb64url(wrapped.ct));
  return new Uint8Array(pt);
}

/** @deprecated use wrapDataKey with a derived wrap key */
export async function wrapKey(dataKey: Uint8Array, secret: string): Promise<WrappedKey> {
  const derived = await derivePasswordKeys(secret);
  const wrapped = await wrapDataKey(dataKey, derived.wrapKey);
  return { ...wrapped, salt: derived.params.salt };
}

/** @deprecated use unwrapDataKey with a derived wrap key */
export async function unwrapKey(wrapped: WrappedKey, secret: string): Promise<Uint8Array> {
  if (!wrapped.salt) throw new Error("missing wrap salt");
  const derived = await derivePasswordKeys(secret, unb64url(wrapped.salt));
  return unwrapDataKey(wrapped, derived.wrapKey);
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

export type BlobAad = { accountId: string; version: number };

export function encodeAad(aad: BlobAad): Uint8Array {
  return enc.encode(`${aad.accountId}:${aad.version}`);
}

export async function compressAndEncrypt(dataKey: Uint8Array, value: unknown, aad: BlobAad): Promise<EncryptedBlob> {
  const zipped = await gzipBytes(enc.encode(JSON.stringify(value)));
  const iv = randomBytes(24);
  const ct = xaead(dataKey, iv, encodeAad(aad)).encrypt(zipped);
  return { alg: "xchacha20poly1305", iv: b64url(iv), ct: b64url(ct) };
}

export async function decryptAndDecompress(dataKey: Uint8Array, blob: EncryptedBlob, aad: BlobAad): Promise<unknown> {
  const iv = unb64url(blob.iv);
  const zipped = xaead(dataKey, iv, encodeAad(aad)).decrypt(unb64url(blob.ct));
  const plain = await gunzipBytes(new Uint8Array(zipped));
  return JSON.parse(dec.decode(plain)) as unknown;
}

/** Crockford base32 alphabet (no I, L, O, U). */
const RECOVERY_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function encodeCrockford(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += RECOVERY_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += RECOVERY_ALPHABET[(value << (5 - bits)) & 31];
  return (out.match(/.{1,4}/g) ?? [out]).join("-");
}

/** 16 random bytes (128 bits) encoded as Crockford base32 groups. */
export function generateRecoveryCode(): string {
  return encodeCrockford(randomBytes(16));
}

/** One-time recovery codes. Count is 1..10 (default 10 at signup). */
export function generateRecoveryCodes(count: number): string[] {
  const n = Number.isInteger(count) ? Math.min(10, Math.max(1, count)) : 10;
  return Array.from({ length: n }, () => generateRecoveryCode());
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
