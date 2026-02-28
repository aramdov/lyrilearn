import anyAscii from "any-ascii";

const NON_LATIN_LANGS = new Set(["ru", "ja", "ko", "zh", "ar", "hy"]);

export function transliterate(text: string): string {
  if (!text) return "";
  return anyAscii(text);
}

export function isNonLatinScript(langCode: string): boolean {
  return NON_LATIN_LANGS.has(langCode);
}
