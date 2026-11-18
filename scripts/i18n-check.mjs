#!/usr/bin/env node
/**
 * Check i18n completeness.
 * English is the source of truth. Other languages fall back to English if a key is missing.
 * Run: node scripts/i18n-check.mjs
 */
import { readFileSync } from "node:fs";

const src = readFileSync("src/lib/i18n.ts", "utf8");
const langs = ["en", "ar", "ru", "uz", "tj", "hi", "bn", "ur"];

function extractBlock(lang) {
  const re = new RegExp(`${lang}:\\s*\\{([\\s\\S]*?)\\n  \\},?\\n`, "m");
  const m = src.match(re);
  if (!m) return null;
  const keys = [...m[1].matchAll(/(\w+)\s*:/g)].map((x) => x[1]);
  return new Set(keys);
}

const en = extractBlock("en");
if (!en) {
  console.error("English block not found");
  process.exit(1);
}

console.log(`English keys: ${en.size}\n`);
let missing = 0;
for (const lang of langs) {
  if (lang === "en") continue;
  const block = extractBlock(lang);
  if (!block) {
    console.log(`${lang}: NO BLOCK — falls back to English entirely`);
    missing += en.size;
    continue;
  }
  const absent = [...en].filter((k) => !block.has(k));
  if (absent.length) {
    console.log(`${lang}: ${absent.length} missing → ${absent.slice(0, 8).join(", ")}${absent.length > 8 ? "…" : ""}`);
    missing += absent.length;
  } else {
    console.log(`${lang}: complete`);
  }
}
console.log(`\nTotal missing key-slots: ${missing}`);
console.log("Missing keys automatically show English text.");
