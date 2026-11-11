/** Base64 helpers for moving small encrypted blobs through the Durable Object worker. */

export function bytesToB64(data: Uint8Array): string {
  return Buffer.from(data).toString("base64");
}

export function b64ToBytes(raw: string): Uint8Array {
  return new Uint8Array(Buffer.from(raw, "base64"));
}

export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < a.byteLength; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}
