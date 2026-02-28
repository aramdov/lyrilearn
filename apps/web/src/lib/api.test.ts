import { describe, test, expect, mock, beforeEach } from "bun:test";
import type { Song, LyricLine, TranslationResult } from "@lyrilearn/shared";

import * as api from "./api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock fetch function that resolves with a synthetic Response.
 *
 * @param data  - Payload placed under `{ data }` for success or used raw for errors.
 * @param ok    - Whether the response should be considered successful (HTTP 2xx).
 * @param status - HTTP status code.
 */
function mockFetchResponse(data: unknown, ok = true, status = 200) {
  const body = ok ? { data } : data;
  return mock(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      })
    )
  );
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const SONG: Song = {
  id: 1,
  title: "Smells Like Teen Spirit",
  artist: "Nirvana",
  youtubeId: "hTWKbfoikeg",
  sourceLang: "en",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const LYRICS: LyricLine[] = [
  { id: 1, songId: 1, lineNumber: 0, text: "Load up on guns" },
  { id: 2, songId: 1, lineNumber: 1, text: "Bring your friends" },
];

const TRANSLATIONS: api.LyricsTranslation[] = [
  { lyricsId: 1, translatedText: "Зарядите ружья", provider: "local", modelVariant: "translategemma-12b-4bit" },
  { lyricsId: 2, translatedText: "Приведите своих друзей", provider: "local", modelVariant: "translategemma-12b-4bit" },
];

const TRANSLATION_RESULT: TranslationResult = {
  translatedText: "Зарядите ружья",
  provider: "local",
  modelVariant: "translategemma-12b-4bit",
  latencyMs: 210,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("api", () => {
  beforeEach(() => {
    // Reset any previously installed fetch mock before each test so that
    // accumulated call history and return values don't bleed across tests.
    globalThis.fetch = undefined as unknown as typeof fetch;
  });

  // -------------------------------------------------------------------------
  // search()
  // -------------------------------------------------------------------------

  describe("search()", () => {
    test("sends a POST to /api/search with the correct JSON body", async () => {
      const responsePayload: api.SearchResponse = { song: SONG, lyrics: LYRICS, youtubeResults: [{ videoId: "hTWKbfoikeg", title: "Test", channelTitle: "Ch" }] };
      globalThis.fetch = mockFetchResponse(responsePayload);

      await api.search("Nirvana teen spirit", "en");

      const [url, init] = (globalThis.fetch as ReturnType<typeof mock>).mock.calls[0] as [string, RequestInit];

      expect(url).toBe("/api/search");
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body as string)).toEqual({ query: "Nirvana teen spirit", sourceLang: "en" });
    });

    test("returns the unwrapped data payload", async () => {
      const responsePayload: api.SearchResponse = { song: SONG, lyrics: LYRICS, youtubeResults: [{ videoId: "hTWKbfoikeg", title: "Test", channelTitle: "Ch" }] };
      globalThis.fetch = mockFetchResponse(responsePayload);

      const result = await api.search("Nirvana teen spirit", "en");

      expect(result).toEqual(responsePayload);
    });
  });

  // -------------------------------------------------------------------------
  // getLyrics()
  // -------------------------------------------------------------------------

  describe("getLyrics()", () => {
    test("sends a GET request with correct query params including optional localModel", async () => {
      const responsePayload: api.LyricsResponse = { song: SONG, lyrics: LYRICS, translations: TRANSLATIONS };
      globalThis.fetch = mockFetchResponse(responsePayload);

      await api.getLyrics(1, "ru", "local", "translategemma-12b-4bit");

      const [url, init] = (globalThis.fetch as ReturnType<typeof mock>).mock.calls[0] as [string, RequestInit];
      const parsed = new URL(url, "http://localhost");

      expect(parsed.pathname).toBe("/api/lyrics/1");
      expect(parsed.searchParams.get("targetLang")).toBe("ru");
      expect(parsed.searchParams.get("provider")).toBe("local");
      expect(parsed.searchParams.get("localModel")).toBe("translategemma-12b-4bit");
      // GET is the default when no method is specified
      expect(init?.method).toBeUndefined();
    });

    test("omits localModel query param when not provided", async () => {
      const responsePayload: api.LyricsResponse = { song: SONG, lyrics: LYRICS, translations: TRANSLATIONS };
      globalThis.fetch = mockFetchResponse(responsePayload);

      await api.getLyrics(1, "ru", "cloud");

      const [url] = (globalThis.fetch as ReturnType<typeof mock>).mock.calls[0] as [string, RequestInit];
      const parsed = new URL(url, "http://localhost");

      expect(parsed.searchParams.has("localModel")).toBe(false);
    });

    test("returns the unwrapped data payload", async () => {
      const responsePayload: api.LyricsResponse = { song: SONG, lyrics: LYRICS, translations: TRANSLATIONS };
      globalThis.fetch = mockFetchResponse(responsePayload);

      const result = await api.getLyrics(1, "ru", "local", "translategemma-4b-4bit");

      expect(result).toEqual(responsePayload);
    });
  });

  // -------------------------------------------------------------------------
  // translate()
  // -------------------------------------------------------------------------

  describe("translate()", () => {
    test("sends a POST with all fields serialised into the request body", async () => {
      globalThis.fetch = mockFetchResponse(TRANSLATION_RESULT);

      await api.translate(
        "Load up on guns",
        "en",
        "ru",
        "local",
        42,
        "translategemma-12b-4bit"
      );

      const [url, init] = (globalThis.fetch as ReturnType<typeof mock>).mock.calls[0] as [string, RequestInit];

      expect(url).toBe("/api/translate");
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body as string)).toEqual({
        text: "Load up on guns",
        sourceLang: "en",
        targetLang: "ru",
        provider: "local",
        lyricsId: 42,
        localModel: "translategemma-12b-4bit",
      });
    });

    test("returns the unwrapped translation result", async () => {
      globalThis.fetch = mockFetchResponse(TRANSLATION_RESULT);

      const result = await api.translate("Load up on guns", "en", "ru", "local");

      expect(result).toEqual(TRANSLATION_RESULT);
    });
  });

  // -------------------------------------------------------------------------
  // getConfig()
  // -------------------------------------------------------------------------

  describe("getConfig()", () => {
    test("sends a GET request to /api/config", async () => {
      const configPayload: api.ProviderStatus = {
        local: true,
        cloud: false,
        models: { "translategemma-12b-4bit": true, "translategemma-4b-4bit": false },
      };
      globalThis.fetch = mockFetchResponse(configPayload);

      await api.getConfig();

      const [url, init] = (globalThis.fetch as ReturnType<typeof mock>).mock.calls[0] as [string, RequestInit];

      expect(url).toBe("/api/config");
      expect(init?.method).toBeUndefined();
    });

    test("returns the unwrapped provider status", async () => {
      const configPayload: api.ProviderStatus = {
        local: true,
        cloud: false,
        models: { "translategemma-12b-4bit": true },
      };
      globalThis.fetch = mockFetchResponse(configPayload);

      const result = await api.getConfig();

      expect(result).toEqual(configPayload);
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe("error handling", () => {
    test("throws an Error with json.error when the response is not ok", async () => {
      globalThis.fetch = mockFetchResponse({ error: "Song not found" }, false, 404);

      await expect(api.search("unknown song", "en")).rejects.toThrow("Song not found");
    });

    test("falls back to status-code message when json.error is absent", async () => {
      globalThis.fetch = mockFetchResponse({}, false, 500);

      await expect(api.getConfig()).rejects.toThrow("Request failed: 500");
    });
  });

  // -------------------------------------------------------------------------
  // Envelope unwrapping
  // -------------------------------------------------------------------------

  describe("envelope unwrapping", () => {
    test("returns json.data, not the full { data } envelope", async () => {
      const inner = { song: SONG, lyrics: LYRICS };
      globalThis.fetch = mockFetchResponse(inner);

      const result = await api.search("anything", "en");

      // The result must be the inner value, not wrapped in { data: ... }
      expect((result as { data?: unknown }).data).toBeUndefined();
      expect(result).toEqual(inner);
    });
  });
});
