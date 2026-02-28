import { describe, test, expect } from "bun:test";
import { transliterate, isNonLatinScript } from "./transliterate";

describe("transliterate", () => {
  test("converts Cyrillic to Latin", () => {
    const result = transliterate("Привет мир");
    expect(result).toBe("Privet mir");
  });

  test("passes Latin text through unchanged", () => {
    const result = transliterate("Hello world");
    expect(result).toBe("Hello world");
  });

  test("handles empty string", () => {
    expect(transliterate("")).toBe("");
  });
});

describe("isNonLatinScript", () => {
  test("returns true for non-Latin language codes", () => {
    expect(isNonLatinScript("ru")).toBe(true);
    expect(isNonLatinScript("ja")).toBe(true);
    expect(isNonLatinScript("ko")).toBe(true);
    expect(isNonLatinScript("zh")).toBe(true);
    expect(isNonLatinScript("ar")).toBe(true);
    expect(isNonLatinScript("hy")).toBe(true);
  });

  test("returns false for Latin-script language codes", () => {
    expect(isNonLatinScript("en")).toBe(false);
    expect(isNonLatinScript("es")).toBe(false);
    expect(isNonLatinScript("fr")).toBe(false);
    expect(isNonLatinScript("de")).toBe(false);
    expect(isNonLatinScript("pt")).toBe(false);
    expect(isNonLatinScript("it")).toBe(false);
  });
});
