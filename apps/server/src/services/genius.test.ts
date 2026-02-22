import { describe, test, expect } from "bun:test";
import { searchGenius } from "./genius";

describe("searchGenius", () => {
  test("returns empty array when no token configured", async () => {
    // GENIUS_ACCESS_TOKEN is not set in test env → graceful empty return
    const result = await searchGenius("test query");
    expect(result).toEqual([]);
  });
});
