import { Hono } from "hono";
import { getDb } from "../db";
import { searchLrclib, getLrclibLyrics, parseSyncedLyrics, parsePlainLyrics } from "../services/lrclib";
import { searchGenius } from "../services/genius";
import { searchYouTube } from "../services/youtube";
import type { Song, LyricLine } from "@lyrilearn/shared";

export const searchRoutes = new Hono();

/**
 * POST /api/search
 * Body: { query, sourceLang, targetLang?, provider? }
 *
 * Orchestrates: LRCLIB (lyrics) + Genius (metadata) + YouTube (video)
 * Caches everything in SQLite.
 */
searchRoutes.post("/", async (c) => {
  const body = await c.req.json();
  const { query, sourceLang } = body;

  if (!query || !sourceLang) {
    return c.json({ error: "Missing required fields: query, sourceLang" }, 400);
  }

  const db = getDb();

  // 1. Check search cache
  const cached = db
    .query("SELECT result_json FROM search_cache WHERE query = ? AND source_lang = ?")
    .get(query, sourceLang) as any;

  if (cached) {
    return c.json({ data: JSON.parse(cached.result_json) });
  }

  try {
    // 2. Search LRCLIB for lyrics
    const lrclibResults = await searchLrclib(`${query}`);
    const topLrclib = lrclibResults[0] || null;

    // 3. Search Genius for metadata (parallel with YouTube)
    const [geniusResults, youtubeResults] = await Promise.all([
      searchGenius(query).catch(() => []),
      searchYouTube(`${query} official audio`).catch(() => []),
    ]);

    const topGenius = geniusResults[0] || null;

    // 4. Get detailed lyrics if we found a match
    let lyrics: LyricLine[] = [];
    let lyricsSource: "lrclib-synced" | "lrclib-plain" | "none" = "none";
    if (topLrclib) {
      // Try to get synced lyrics first
      const detailed = await getLrclibLyrics(
        topLrclib.artistName,
        topLrclib.trackName
      ).catch(() => null);

      const lrcData = detailed || topLrclib;

      if (lrcData.syncedLyrics) {
        lyricsSource = "lrclib-synced";
        lyrics = parseSyncedLyrics(lrcData.syncedLyrics).map((l, i) => ({
          id: 0, // assigned on DB insert
          songId: 0,
          lineNumber: l.lineNumber,
          text: l.text,
          startTime: l.startTime ?? undefined,
          endTime: l.endTime ?? undefined,
        }));
      } else if (lrcData.plainLyrics) {
        lyricsSource = "lrclib-plain";
        lyrics = parsePlainLyrics(lrcData.plainLyrics).map((l) => ({
          id: 0,
          songId: 0,
          lineNumber: l.lineNumber,
          text: l.text,
          startTime: undefined,
          endTime: undefined,
        }));
      }
    }

    // 5. Determine metadata source
    const metadataSource: "lrclib" | "genius" | "query-fallback" =
      topLrclib ? "lrclib" : topGenius ? "genius" : "query-fallback";

    // Compose song metadata
    const song: Song = {
      id: 0,
      title: topLrclib?.trackName || topGenius?.title || query,
      artist: topLrclib?.artistName || topGenius?.artist || "Unknown",
      sourceLang,
      youtubeId: youtubeResults[0]?.videoId,
      geniusId: topGenius?.id?.toString(),
      lrclibId: topLrclib?.id?.toString(),
      artworkUrl: topGenius?.artworkUrl,
      createdAt: new Date().toISOString(),
    };

    // 6. Persist song + lyrics to DB
    const songRow = db
      .query(
        `INSERT OR IGNORE INTO songs (title, artist, source_lang, youtube_id, genius_id, lrclib_id, artwork_url)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         RETURNING id`
      )
      .get(
        song.title,
        song.artist,
        song.sourceLang,
        song.youtubeId || null,
        song.geniusId || null,
        song.lrclibId || null,
        song.artworkUrl || null
      ) as any;

    // If song already existed, fetch its ID
    const songId =
      songRow?.id ||
      (
        db
          .query(
            "SELECT id FROM songs WHERE title = ? AND artist = ? AND source_lang = ?"
          )
          .get(song.title, song.artist, song.sourceLang) as any
      )?.id;

    song.id = songId;

    // Insert lyrics
    if (songId && lyrics.length > 0) {
      const insertLyric = db.query(
        `INSERT OR IGNORE INTO lyrics (song_id, line_number, text, start_time, end_time)
         VALUES (?, ?, ?, ?, ?)`
      );

      for (const line of lyrics) {
        insertLyric.run(
          songId,
          line.lineNumber,
          line.text,
          line.startTime ?? null,
          line.endTime ?? null
        );
        line.songId = songId;
      }

      // Fetch the actual IDs assigned by the DB
      const dbLyrics = db
        .query("SELECT id, line_number FROM lyrics WHERE song_id = ?")
        .all(songId) as any[];

      for (const dbLine of dbLyrics) {
        const match = lyrics.find((l) => l.lineNumber === dbLine.line_number);
        if (match) match.id = dbLine.id;
      }
    }

    const result = { song, lyrics, youtubeResults, lyricsSource, metadataSource };

    // 8. Cache the search result
    db.query(
      `INSERT OR REPLACE INTO search_cache (query, source_lang, result_json, expires_at)
       VALUES (?, ?, ?, datetime('now', '+7 days'))`
    ).run(query, sourceLang, JSON.stringify(result));

    return c.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return c.json({ error: message }, 500);
  }
});
