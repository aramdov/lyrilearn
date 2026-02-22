import { describe, test, expect } from "bun:test";
import { parseSyncedLyrics, parsePlainLyrics } from "./lrclib";

// ─── parseSyncedLyrics ─────────────────────────────────────

describe("parseSyncedLyrics", () => {
  test("parses standard LRC lines with timestamps", () => {
    const lrc = [
      "[00:12.34] Hello world",
      "[00:15.00] How are you",
      "[00:20.50] I'm fine",
    ].join("\n");

    const result = parseSyncedLyrics(lrc);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      lineNumber: 1,
      text: "Hello world",
      startTime: 12.34,
      endTime: 15.0,
    });
    expect(result[1]).toEqual({
      lineNumber: 2,
      text: "How are you",
      startTime: 15.0,
      endTime: 20.5,
    });
    expect(result[2]).toEqual({
      lineNumber: 3,
      text: "I'm fine",
      startTime: 20.5,
      endTime: null, // last line has no end time
    });
  });

  test("skips empty/instrumental lines (timestamp with no text)", () => {
    const lrc = [
      "[00:00.00] ",
      "[00:05.00] First real line",
      "[00:10.00]",
      "[00:15.00] Second real line",
    ].join("\n");

    const result = parseSyncedLyrics(lrc);

    expect(result).toHaveLength(2);
    expect(result[0].text).toBe("First real line");
    expect(result[0].lineNumber).toBe(1);
    expect(result[1].text).toBe("Second real line");
    expect(result[1].lineNumber).toBe(2);
  });

  test("filters blank lines between LRC entries", () => {
    const lrc = "[00:01.00] Line one\n\n\n[00:05.00] Line two";

    const result = parseSyncedLyrics(lrc);

    expect(result).toHaveLength(2);
    expect(result[0].endTime).toBe(5.0);
  });

  test("handles single line", () => {
    const lrc = "[01:30.00] Only line";
    const result = parseSyncedLyrics(lrc);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      lineNumber: 1,
      text: "Only line",
      startTime: 90.0, // 1 min 30 sec
      endTime: null,
    });
  });

  test("skips lines without valid timestamps", () => {
    const lrc = [
      "This is a header without timestamp",
      "[00:05.00] Real line",
      "[broken] Not valid",
      "[00:10.00] Another real line",
    ].join("\n");

    const result = parseSyncedLyrics(lrc);

    expect(result).toHaveLength(2);
    expect(result[0].text).toBe("Real line");
    expect(result[1].text).toBe("Another real line");
  });

  test("handles empty input", () => {
    expect(parseSyncedLyrics("")).toHaveLength(0);
  });

  test("computes minutes correctly in timestamps", () => {
    const lrc = "[03:45.67] Three minutes in";
    const result = parseSyncedLyrics(lrc);

    // 3 * 60 + 45 + 67/100 = 225.67
    expect(result[0].startTime).toBe(225.67);
  });

  test("trims whitespace from text", () => {
    const lrc = "[00:01.00]   padded text   ";
    const result = parseSyncedLyrics(lrc);

    expect(result[0].text).toBe("padded text");
  });
});

// ─── parsePlainLyrics ──────────────────────────────────────

describe("parsePlainLyrics", () => {
  test("parses plain text lines with no timestamps", () => {
    const plain = "Line one\nLine two\nLine three";
    const result = parsePlainLyrics(plain);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      lineNumber: 1,
      text: "Line one",
      startTime: null,
      endTime: null,
    });
    expect(result[2].lineNumber).toBe(3);
    expect(result[2].text).toBe("Line three");
  });

  test("filters empty lines", () => {
    const plain = "Line one\n\n\nLine two\n   \nLine three";
    const result = parsePlainLyrics(plain);

    expect(result).toHaveLength(3);
    expect(result[1].text).toBe("Line two");
    expect(result[1].lineNumber).toBe(2);
  });

  test("trims whitespace", () => {
    const plain = "  padded  \n  also padded  ";
    const result = parsePlainLyrics(plain);

    expect(result[0].text).toBe("padded");
    expect(result[1].text).toBe("also padded");
  });

  test("handles empty input", () => {
    expect(parsePlainLyrics("")).toHaveLength(0);
  });

  test("handles single line", () => {
    const result = parsePlainLyrics("Only line");

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      lineNumber: 1,
      text: "Only line",
      startTime: null,
      endTime: null,
    });
  });
});
