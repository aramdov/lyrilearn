/**
 * LRCLIB client — synced lyrics with timestamps.
 * API docs: https://lrclib.net/docs
 */

const LRCLIB_BASE = "https://lrclib.net/api";

export interface LrclibSearchResult {
  id: number;
  trackName: string;
  artistName: string;
  albumName?: string;
  duration: number;
  syncedLyrics?: string; // .lrc format with [mm:ss.xx] timestamps
  plainLyrics?: string;
}

/** Parse a single .lrc timestamp like [01:23.45] into seconds */
function parseLrcTimestamp(ts: string): number {
  const match = ts.match(/\[(\d+):(\d+)\.(\d+)\]/);
  if (!match) return 0;
  const [, min, sec, ms] = match;
  return parseInt(min) * 60 + parseInt(sec) + parseInt(ms) / 100;
}

export interface ParsedLyricLine {
  lineNumber: number;
  text: string;
  startTime: number | null;
  endTime: number | null;
}

/** Parse .lrc synced lyrics into structured lines with timestamps */
export function parseSyncedLyrics(lrc: string): ParsedLyricLine[] {
  const lines = lrc.split("\n").filter((l) => l.trim());
  const parsed: ParsedLyricLine[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const tsMatch = line.match(/^\[(\d+:\d+\.\d+)\]\s*(.*)/);
    if (!tsMatch) continue;

    const startTime = parseLrcTimestamp(`[${tsMatch[1]}]`);
    const text = tsMatch[2].trim();
    if (!text) continue; // skip empty instrumental lines

    parsed.push({
      lineNumber: parsed.length + 1,
      text,
      startTime,
      endTime: null, // filled in below
    });
  }

  // Fill in end times: each line ends when the next begins
  for (let i = 0; i < parsed.length - 1; i++) {
    parsed[i].endTime = parsed[i + 1].startTime;
  }

  return parsed;
}

/** Parse plain (unsynchronized) lyrics into structured lines */
export function parsePlainLyrics(plain: string): ParsedLyricLine[] {
  return plain
    .split("\n")
    .filter((l) => l.trim())
    .map((text, i) => ({
      lineNumber: i + 1,
      text: text.trim(),
      startTime: null,
      endTime: null,
    }));
}

/** Search for tracks on LRCLIB */
export async function searchLrclib(
  query: string
): Promise<LrclibSearchResult[]> {
  const params = new URLSearchParams({ q: query });
  const res = await fetch(`${LRCLIB_BASE}/search?${params}`, {
    headers: { "User-Agent": "LyriLearn/1.0" },
  });

  if (!res.ok) {
    throw new Error(`LRCLIB search error (${res.status})`);
  }

  return res.json();
}

/** Get lyrics for a specific track by artist + track name */
export async function getLrclibLyrics(
  artistName: string,
  trackName: string
): Promise<LrclibSearchResult | null> {
  const params = new URLSearchParams({
    artist_name: artistName,
    track_name: trackName,
  });

  const res = await fetch(`${LRCLIB_BASE}/get?${params}`, {
    headers: { "User-Agent": "LyriLearn/1.0" },
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`LRCLIB get error (${res.status})`);
  }

  return res.json();
}
