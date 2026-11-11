/** Constant-time string compare for bearer tokens and other secrets.
 *  Works in Node and in Cloudflare Workers (no Buffer).
 */
export function safeEqual(a: string, b: string): boolean {
  const len = a.length;
  let diff = a.length === b.length ? 0 : 1;
  const right = diff === 0 ? b : a;
  for (let i = 0; i < len; i++) diff |= a.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}
