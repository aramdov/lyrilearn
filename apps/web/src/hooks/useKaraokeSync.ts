import { useState, useEffect, useCallback, type RefObject } from "react";
import type { LyricLine } from "@lyrilearn/shared";
import type { YouTubePlayerHandle } from "@/components/YouTubePlayer";

const POLL_INTERVAL_MS = 250;
const YT_PLAYING = 1;

function findActiveLineId(time: number, lyrics: LyricLine[]): number | null {
  let lo = 0;
  let hi = lyrics.length - 1;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const line = lyrics[mid];
    const start = line.startTime ?? Infinity;
    const end = line.endTime ?? Infinity;

    if (time < start) {
      hi = mid - 1;
    } else if (time >= end) {
      lo = mid + 1;
    } else {
      return line.id;
    }
  }
  return null;
}

export function useKaraokeSync(
  playerRef: RefObject<YouTubePlayerHandle | null>,
  lyrics: LyricLine[],
  enabled: boolean
) {
  const [activeLineId, setActiveLineId] = useState<number | null>(null);

  const hasSyncedLyrics =
    lyrics.length > 0 && lyrics[0].startTime !== undefined;

  useEffect(() => {
    if (!enabled || !hasSyncedLyrics) {
      setActiveLineId(null);
      return;
    }

    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;

      const state = player.getPlayerState();
      if (state !== YT_PLAYING) return;

      const time = player.getCurrentTime();
      const id = findActiveLineId(time, lyrics);
      setActiveLineId(id);
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [enabled, hasSyncedLyrics, lyrics, playerRef]);

  return {
    activeLineId,
    hasSyncedLyrics,
    findActiveLineId: useCallback(findActiveLineId, []),
  };
}
