import { describe, expect, it } from "bun:test";
import { makeCardId } from "./db";

describe("makeCardId", () => {
  it("returns the correct composite key format", () => {
    expect(makeCardId(42, "ru", "word", "привет")).toBe(
      "42-ru-word-привет"
    );
  });

  it("handles line type", () => {
    expect(makeCardId(1, "ko", "line", "안녕하세요")).toBe(
      "1-ko-line-안녕하세요"
    );
  });

  it("handles special characters in source", () => {
    expect(makeCardId(10, "ja", "word", "食べる")).toBe(
      "10-ja-word-食べる"
    );
  });

  it("handles numeric songId correctly", () => {
    expect(makeCardId(0, "en", "word", "hello")).toBe("0-en-word-hello");
  });

  it("handles source text with spaces", () => {
    expect(makeCardId(5, "fr", "line", "je t'aime")).toBe(
      "5-fr-line-je t'aime"
    );
  });

  it("handles source text with hyphens", () => {
    expect(makeCardId(3, "de", "word", "über-cool")).toBe(
      "3-de-word-über-cool"
    );
  });
});
