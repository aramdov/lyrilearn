import { describe, test, expect, mock, beforeEach } from "bun:test";
import { Hono } from "hono";
import { parseSyncedLyrics, parsePlainLyrics } from "../services/lrclib";

// ─── Mock HTTP service functions only, not the parsing logic ──

(globalThis as any).__searchMock = {
  lrclibResults: [] as any[],
  lrclibLyrics: null as any,
  geniusResults: [] as any[],
  youtubeResult: null as any,
  dbData: new Map<string, any>(),
};

// Mock only the HTTP functions from lrclib, re-export real parsing functions
mock.module("../services/lrclib", () => ({
  searchLrclib: async () => (globalThis as any).__searchMock.lrclibResults,
  getLrclibLyrics: async () => (globalThis as any).__searchMock.lrclibLyrics,
  parseSyncedLyrics,
  parsePlainLyrics,
}));

mock.module("../services/genius", () => ({
  searchGenius: async () => (globalThis as any).__searchMock.geniusResults,
}));

mock.module("../services/youtube", () => ({
  searchYouTube: async () => (globalThis as any).__searchMock.youtubeResult,
}));

mock.module("../db", () => ({
  getDb: () => ({
    query(sql: string) {
      const data = (globalThis as any).__searchMock.dbData;
      return {
        get(..._args: any[]) {
          if (sql.includes("search_cache")) return data.get("search_cache") || null;
          if (sql.includes("RETURNING")) return data.get("songInsert") || { id: 1 };
          if (sql.includes("SELECT id FROM songs")) return { id: 1 };
          return null;
        },
        all(..._args: any[]) {
          if (sql.includes("FROM lyrics")) return data.get("lyrics") || [];
          return [];
        },
        run() {},
      };
    },
  }),
}));

import { searchRoutes } from "./search";

const app = new Hono();
app.route("/api/search", searchRoutes);

function post(body: any) {
  return app.request("http://localhost/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  const m = (globalThis as any).__searchMock;
  m.lrclibResults = [];
  m.lrclibLyrics = null;
  m.geniusResults = [];
  m.youtubeResult = null;
  m.dbData = new Map();
});

describe("POST /api/search", () => {
  test("returns 400 when query is missing", async () => {
    const res = await post({ sourceLang: "en" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing required fields");
  });

  test("returns 400 when sourceLang is missing", async () => {
    const res = await post({ query: "test" });
    expect(res.status).toBe(400);
  });

  test("returns cached result when available", async () => {
    const cached = {
      song: { id: 1, title: "Cached Song", artist: "Artist" },
      lyrics: [],
    };
    (globalThis as any).__searchMock.dbData.set("search_cache", {
      result_json: JSON.stringify(cached),
    });

    const res = await post({ query: "test", sourceLang: "en" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.song.title).toBe("Cached Song");
  });

  test("searches LRCLIB and returns song with lyrics", async () => {
    (globalThis as any).__searchMock.lrclibResults = [
      {
        id: 100,
        trackName: "Shape of You",
        artistName: "Ed Sheeran",
        syncedLyrics: "[00:05.00] The club isn't the best\n[00:10.00] Place to find a lover",
        plainLyrics: null,
      },
    ];
    (globalThis as any).__searchMock.dbData.set("songInsert", { id: 1 });

    const res = await post({ query: "Shape of You", sourceLang: "en" });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.song.title).toBe("Shape of You");
    expect(body.data.song.artist).toBe("Ed Sheeran");
    expect(body.data.lyrics.length).toBeGreaterThan(0);
  });

  test("falls back to Genius metadata when LRCLIB has no results", async () => {
    (globalThis as any).__searchMock.geniusResults = [
      {
        id: 42,
        title: "Genius Title",
        artist: "Genius Artist",
        artworkUrl: "https://example.com/art.jpg",
      },
    ];

    const res = await post({ query: "test song", sourceLang: "en" });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.song.title).toBe("Genius Title");
    expect(body.data.song.artist).toBe("Genius Artist");
  });

  test("includes YouTube videoId when available", async () => {
    (globalThis as any).__searchMock.lrclibResults = [
      {
        id: 1,
        trackName: "Test",
        artistName: "Artist",
        syncedLyrics: "[00:01.00] Line one",
      },
    ];
    (globalThis as any).__searchMock.youtubeResult = { videoId: "abc123", title: "Test Video" };

    const res = await post({ query: "test", sourceLang: "en" });
    const body = await res.json();
    expect(body.data.videoId).toBe("abc123");
  });

  test("falls back to query as title when no sources match", async () => {
    const res = await post({ query: "obscure song", sourceLang: "en" });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.song.title).toBe("obscure song");
    expect(body.data.song.artist).toBe("Unknown");
  });
});
