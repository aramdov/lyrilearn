import { describe, test, expect, mock, beforeEach, afterAll } from "bun:test";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { Song, LyricLine } from "@lyrilearn/shared";
import type { Settings } from "./useSongView";

// ─── Test fixtures ──────────────────────────────────────────

const SONG: Song = {
  id: 1,
  title: "Катюша",
  artist: "Лидия Русланова",
  sourceLang: "ru",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const LYRICS: LyricLine[] = [
  { id: 10, songId: 1, lineNumber: 1, text: "Расцветали яблони и груши" },
  { id: 11, songId: 1, lineNumber: 2, text: "Поплыли туманы над рекой" },
  { id: 12, songId: 1, lineNumber: 3, text: "" }, // empty line
  { id: 13, songId: 1, lineNumber: 4, text: "Выходила на берег Катюша" },
];

const DEFAULT_SETTINGS: Settings = {
  sourceLang: "ru",
  targetLang: "en",
  provider: "local",
  localModel: "translategemma-4b-4bit",
  viewMode: "side-by-side",
  showTransliteration: false,
};

// ─── Mock helpers ───────────────────────────────────────────

/**
 * Creates a controlled mock for the api module.
 * Returns functions to configure getLyrics and translate responses.
 */
function createApiMocks() {
  const getLyricsMock = mock<(songId: number, targetLang: string, provider: string, localModel?: string) => Promise<any>>(
    () => Promise.resolve({ song: SONG, lyrics: LYRICS, translations: [] })
  );

  const translateBatchMock = mock<(items: any[], targetLang: string, provider: string, localModel?: string) => Promise<any>>(
    (items) =>
      Promise.resolve(
        items.map((item: any) => ({
          translatedText: `[translated] ${item.text}`,
          provider: "local",
          modelVariant: "translategemma-12b-4bit",
          latencyMs: 50,
        }))
      )
  );

  return { getLyricsMock, translateBatchMock };
}

// We need to mock the api module before importing useSongView.
// bun:test mock.module works at the module level.
let apiMocks = createApiMocks();

mock.module("@/lib/api", () => ({
  getLyrics: (...args: any[]) => apiMocks.getLyricsMock(...args),
  translateBatch: (...args: any[]) => apiMocks.translateBatchMock(...args),
  search: mock(() => Promise.resolve({})),
  getConfig: mock(() => Promise.resolve({})),
}));

// Import AFTER mock.module
const { useSongView } = await import("./useSongView");

beforeEach(() => {
  apiMocks = createApiMocks();
});

afterAll(() => {
  mock.restore();
});

// ─── Tests ──────────────────────────────────────────────────

describe("useSongView", () => {
  test("initial state has no song and empty collections", () => {
    const { result } = renderHook(() => useSongView(DEFAULT_SETTINGS));

    expect(result.current.currentSong).toBeNull();
    expect(result.current.lyrics).toEqual([]);
    expect(result.current.translations.size).toBe(0);
    expect(result.current.translating.size).toBe(0);
    expect(result.current.lyricsLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  test("selectSong sets currentSong and lyrics immediately", async () => {
    const { result } = renderHook(() => useSongView(DEFAULT_SETTINGS));

    await act(async () => {
      await result.current.selectSong(SONG, LYRICS);
    });

    expect(result.current.currentSong).toEqual(SONG);
    expect(result.current.lyrics.length).toBeGreaterThan(0);
  });

  test("selectSong calls getLyrics with correct params", async () => {
    const { result } = renderHook(() => useSongView(DEFAULT_SETTINGS));

    await act(async () => {
      await result.current.selectSong(SONG, LYRICS);
    });

    expect(apiMocks.getLyricsMock).toHaveBeenCalledWith(
      1, "en", "local", "translategemma-4b-4bit"
    );
  });

  test("translates untranslated lines after getLyrics returns", async () => {
    // getLyrics returns lyrics but no translations — all non-empty lines need translation
    apiMocks.getLyricsMock.mockImplementation(() =>
      Promise.resolve({ song: SONG, lyrics: LYRICS, translations: [] })
    );

    const { result } = renderHook(() => useSongView(DEFAULT_SETTINGS));

    await act(async () => {
      await result.current.selectSong(SONG, LYRICS);
    });

    // 3 non-empty lines should have been translated (ids 10, 11, 13)
    await waitFor(() => {
      expect(result.current.translations.size).toBe(3);
    });

    // Empty line (id 12) should NOT be translated
    expect(result.current.translations.has(12)).toBe(false);
    expect(result.current.translations.has(10)).toBe(true);
    expect(result.current.translations.has(11)).toBe(true);
    expect(result.current.translations.has(13)).toBe(true);
  });

  test("skips translation for lines already cached", async () => {
    // Return pre-cached translations for lines 10 and 11
    apiMocks.getLyricsMock.mockImplementation(() =>
      Promise.resolve({
        song: SONG,
        lyrics: LYRICS,
        translations: [
          { lyricsId: 10, translatedText: "Apple and pear trees were blooming", provider: "local", modelVariant: "test" },
          { lyricsId: 11, translatedText: "Mists floated over the river", provider: "local", modelVariant: "test" },
        ],
      })
    );

    const { result } = renderHook(() => useSongView(DEFAULT_SETTINGS));

    await act(async () => {
      await result.current.selectSong(SONG, LYRICS);
    });

    await waitFor(() => {
      expect(result.current.translations.size).toBe(3); // 2 cached + 1 live
    });

    // translateBatch() should only have been called for line 13 (the only untranslated non-empty line)
    expect(apiMocks.translateBatchMock).toHaveBeenCalledTimes(1);
    const batchItems = apiMocks.translateBatchMock.mock.calls[0][0];
    expect(batchItems).toHaveLength(1);
    expect(batchItems[0].lyricsId).toBe(13);
  });

  test("clearSong resets all state", async () => {
    const { result } = renderHook(() => useSongView(DEFAULT_SETTINGS));

    await act(async () => {
      await result.current.selectSong(SONG, LYRICS);
    });

    act(() => {
      result.current.clearSong();
    });

    expect(result.current.currentSong).toBeNull();
    expect(result.current.lyrics).toEqual([]);
    expect(result.current.translations.size).toBe(0);
    expect(result.current.translating.size).toBe(0);
    expect(result.current.error).toBeNull();
  });

  test("handles getLyrics error gracefully", async () => {
    apiMocks.getLyricsMock.mockImplementation(() =>
      Promise.reject(new Error("Network error"))
    );

    const { result } = renderHook(() => useSongView(DEFAULT_SETTINGS));

    await act(async () => {
      await result.current.selectSong(SONG, LYRICS);
    });

    expect(result.current.error).toBe("Network error");
    expect(result.current.lyricsLoading).toBe(false);
  });

  test("generation counter discards stale translations on rapid refetch", async () => {
    // First call: slow (200ms), returns stale data
    // Second call: fast (10ms), returns fresh data
    let callCount = 0;

    apiMocks.getLyricsMock.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        // First call: slow — will be stale by the time it resolves
        await new Promise((r) => setTimeout(r, 200));
        return {
          song: SONG,
          lyrics: [{ id: 99, songId: 1, lineNumber: 1, text: "STALE" }],
          translations: [{ lyricsId: 99, translatedText: "STALE TRANSLATION", provider: "local", modelVariant: "test" }],
        };
      }
      // Second call: fast
      await new Promise((r) => setTimeout(r, 10));
      return {
        song: SONG,
        lyrics: LYRICS,
        translations: [
          { lyricsId: 10, translatedText: "Fresh", provider: "local", modelVariant: "test" },
          { lyricsId: 11, translatedText: "Fresh", provider: "local", modelVariant: "test" },
          { lyricsId: 13, translatedText: "Fresh", provider: "local", modelVariant: "test" },
        ],
      };
    });

    const { result } = renderHook(() => useSongView(DEFAULT_SETTINGS));

    // Start first fetch
    await act(async () => {
      result.current.selectSong(SONG, LYRICS);
    });

    // Immediately refetch (simulating rapid provider change)
    const newSettings = { ...DEFAULT_SETTINGS, provider: "cloud" as const };
    await act(async () => {
      result.current.refetchTranslations(newSettings);
    });

    // Wait for both to settle
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });

    // The stale "STALE" lyrics should NOT be in state —
    // the fresh data from the second call should win
    const hasStale = result.current.lyrics.some((l) => l.text === "STALE");
    expect(hasStale).toBe(false);

    // Should have translations from the fresh call
    expect(result.current.translations.has(10)).toBe(true);
  });

  test("does not call cloud with localModel", async () => {
    const cloudSettings: Settings = {
      ...DEFAULT_SETTINGS,
      provider: "cloud",
    };

    const { result } = renderHook(() => useSongView(cloudSettings));

    await act(async () => {
      await result.current.selectSong(SONG, LYRICS);
    });

    // getLyrics should have been called with undefined for localModel
    expect(apiMocks.getLyricsMock).toHaveBeenCalledWith(
      1, "en", "cloud", undefined
    );
  });
});
