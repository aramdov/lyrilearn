import { describe, test, expect } from "bun:test";
import { searchYouTube } from "./youtube";

describe("searchYouTube", () => {
  test("returns null when no API key configured", async () => {
    // YOUTUBE_API_KEY is not set in test env → graceful null return
    const result = await searchYouTube("test query");
    expect(result).toBeNull();
  });
});
