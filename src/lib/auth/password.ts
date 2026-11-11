/** Server-side hash of a *derived* auth/verify key. The raw password never arrives here. */
import { argon2id } from "hash-wasm";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const MEMORY = 19_456;
const ITERATIONS = 2;
const PARALLELISM = 1;
const HASH_LEN = 32;

export async function hashAuthKey(raw: Uint8Array): Promise<string> {
  const salt = randomBytes(16);
  const hash = await argon2id({
    password: raw,
    salt,
    parallelism: PARALLELISM,
    iterations: ITERATIONS,
    memorySize: MEMORY,
    hashLength: HASH_LEN,
    outputType: "binary",
  });
  const digest = hash instanceof Uint8Array ? hash : new Uint8Array(hash);
  return `argon2id$${MEMORY}$${ITERATIONS}$${PARALLELISM}$${salt.toString("base64url")}$${Buffer.from(digest).toString("base64url")}`;
}

export async function verifyAuthKey(raw: Uint8Array, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "argon2id") return false;
  const memorySize = Number(parts[1]);
  const iterations = Number(parts[2]);
  const parallelism = Number(parts[3]);
  const salt = Buffer.from(parts[4] ?? "", "base64url");
  const expected = Buffer.from(parts[5] ?? "", "base64url");
  if (!salt.length || expected.length !== HASH_LEN) return false;
  const hash = await argon2id({
    password: raw,
    salt,
    parallelism,
    iterations,
    memorySize,
    hashLength: HASH_LEN,
    outputType: "binary",
  });
  const digest = hash instanceof Uint8Array ? hash : new Uint8Array(hash);
  if (digest.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(digest), expected);
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function hashOpaque(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}
