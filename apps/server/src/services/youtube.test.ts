import { describe, test, expect } from "bun:test";

type YouTubeModule = typeof import("./youtube");
let youtubeModule: YouTubeModule;
let importVersion = 0;

describe("searchYouTube", () => {
  test("returns an empty list when no API key configured", async () => {
    youtubeModule = await import(`./youtube.ts?youtube-test=${importVersion++}`);
    // YOUTUBE_API_KEY is not set in test env → graceful empty result
    const result = await youtubeModule.searchYouTube("test query");
    expect(result).toEqual([]);
  });
});
