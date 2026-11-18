import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("имя на визитке: сервер чистит управляющие символы и ограничивает длину", () => {
  const src = readFileSync(new URL("./auth/handlers.ts", import.meta.url), "utf8");
  assert.match(src, /export function cleanDisplayName/);
  assert.match(src, /displayName: z\.string\(\)\.max\(80\)\.regex\(NO_CONTROL\)/);
  assert.match(src, /\\u202A-\\u202E/);
});
