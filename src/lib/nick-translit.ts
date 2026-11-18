/**
 * Typing a nick: any letters become Latin nick characters.
 * Spaces between first/last/father's name become dots; Cyrillic (Russian, Tajik, Uzbek)
 * and Arabic letters are transliterated, so a full name can be typed as is.
 */
const CYR: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
  н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  // Tajik / Uzbek Cyrillic
  ғ: "gh", ӣ: "i", қ: "q", ӯ: "u", ҳ: "h", ҷ: "j", ў: "o", ҳ̣: "h",
};
const ARA: Record<string, string> = {
  ا: "a", أ: "a", إ: "i", آ: "a", ب: "b", ت: "t", ث: "th", ج: "j", ح: "h", خ: "kh", د: "d", ذ: "dh", ر: "r", ز: "z",
  س: "s", ش: "sh", ص: "s", ض: "d", ط: "t", ظ: "z", ع: "a", غ: "gh", ف: "f", ق: "q", ك: "k", ل: "l", م: "m", ن: "n",
  ه: "h", ة: "a", و: "w", ؤ: "w", ي: "y", ى: "a", ئ: "y", ء: "", پ: "p", چ: "ch", ژ: "zh", گ: "g", ک: "k", ی: "y",
};

export function toNickChars(input: string): string {
  let out = "";
  for (const ch of input.toLowerCase()) {
    if (/[a-z0-9]/.test(ch)) out += ch;
    else if (ch in CYR) out += CYR[ch];
    else if (ch in ARA) out += ARA[ch];
    else if (/[\s.,_\-–—]/.test(ch)) out += /[_-]/.test(ch) ? ch : ".";
    // other symbols are dropped
  }
  // one separator at a time, none at the start
  return out.replace(/[._-]{2,}/g, (m) => m[0]).replace(/^[._-]+/, "").slice(0, 32);
}
