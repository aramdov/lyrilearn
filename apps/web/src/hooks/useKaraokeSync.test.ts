import { describe, test, expect } from "bun:test";
import { renderHook } from "@testing-library/react";
import type { LyricLine } from "@lyrilearn/shared";
import type { YouTubePlayerHandle } from "@/components/YouTubePlayer";
import { useKaraokeSync } from "./useKaraokeSync";

// ── Fixtures ─────────────────────────────────────────────────

const SYNCED_LYRICS: LyricLine[] = [
  { id: 1, songId: 1, lineNumber: 1, text: "Line one", startTime: 0, endTime: 5 },
  { id: 2, songId: 1, lineNumber: 2, text: "Line two", startTime: 5, endTime: 10 },
  { id: 3, songId: 1, lineNumber: 3, text: "Line three", startTime: 10, endTime: 15 },
];

const UNSYNCED_LYRICS: LyricLine[] = [
  { id: 1, songId: 1, lineNumber: 1, text: "No timestamps" },
];

function makeMockRef(time: number, state: number) {
  return {
    current: {
      getCurrentTime: () => time,
      getPlayerState: () => state,
    },
  } as React.RefObject<YouTubePlayerHandle>;
}

const PLAYING = 1;
const PAUSED = 2;

// ── Tests ────────────────────────────────────────────────────

describe("useKaraokeSync", () => {
  test("returns null activeLineId when not enabled", () => {
    const ref = makeMockRef(3, PLAYING);
    const { result } = renderHook(() =>
      useKaraokeSync(ref, SYNCED_LYRICS, false)
    );
    expect(result.current.activeLineId).toBeNull();
  });

  test("returns null activeLineId for unsynced lyrics", () => {
    const ref = makeMockRef(3, PLAYING);
    const { result } = renderHook(() =>
      useKaraokeSync(ref, UNSYNCED_LYRICS, true)
    );
    expect(result.current.activeLineId).toBeNull();
  });

  test("hasSyncedLyrics is true when lyrics have startTime", () => {
    const ref = makeMockRef(0, PAUSED);
    const { result } = renderHook(() =>
      useKaraokeSync(ref, SYNCED_LYRICS, false)
    );
    expect(result.current.hasSyncedLyrics).toBe(true);
  });

  test("hasSyncedLyrics is false when lyrics lack startTime", () => {
    const ref = makeMockRef(0, PAUSED);
    const { result } = renderHook(() =>
      useKaraokeSync(ref, UNSYNCED_LYRICS, false)
    );
    expect(result.current.hasSyncedLyrics).toBe(false);
  });

  test("findActiveLineId returns correct line for given time", () => {
    const ref = makeMockRef(0, PAUSED);
    const { result } = renderHook(() =>
      useKaraokeSync(ref, SYNCED_LYRICS, true)
    );

    expect(result.current.findActiveLineId(0, SYNCED_LYRICS)).toBe(1);
    expect(result.current.findActiveLineId(3, SYNCED_LYRICS)).toBe(1);
    expect(result.current.findActiveLineId(5, SYNCED_LYRICS)).toBe(2);
    expect(result.current.findActiveLineId(12, SYNCED_LYRICS)).toBe(3);
  });

  test("findActiveLineId returns null for time outside all ranges", () => {
    const ref = makeMockRef(0, PAUSED);
    const { result } = renderHook(() =>
      useKaraokeSync(ref, SYNCED_LYRICS, true)
    );
    expect(result.current.findActiveLineId(99, SYNCED_LYRICS)).toBeNull();
  });
});
