#!/usr/bin/env node
/**
 * Fill missing language blocks from English.
 * Creates hi/bn/ur blocks (and any other missing) by copying English.
 * Real translations replace the English text later.
 * Run: node scripts/i18n-fill.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const path = "src/lib/i18n.ts";
let src = readFileSync(path, "utf8");

const toAdd = ["hi", "bn", "ur"];
const enMatch = src.match(/en:\s*\{([\s\S]*?)\n  \},?\n/);
if (!enMatch) {
  console.error("English block not found");
  process.exit(1);
}
const enBody = enMatch[1];

for (const lang of toAdd) {
  if (new RegExp(`${lang}:\\s*\\{`).test(src)) {
    console.log(`${lang}: already exists`);
    continue;
  }
  const block = `  ${lang}: {${enBody}\n  },\n`;
  // insert before the closing of t
  src = src.replace(/\n\};\n\nexport type MsgKey/, `\n${block}};\n\nexport type MsgKey`);
  console.log(`${lang}: added (English placeholder)`);
}

writeFileSync(path, src);
console.log("Done. Run i18n-check.mjs to verify.");
