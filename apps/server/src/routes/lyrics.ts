import { Hono } from "hono";
import { getDb } from "../db";

export const lyricsRoutes = new Hono();

/**
 * GET /api/lyrics/:songId
 * Returns all lyrics lines for a song, with any cached translations.
 * Query params: targetLang, provider, localModel
 */
lyricsRoutes.get("/:songId", async (c) => {
  const songId = parseInt(c.req.param("songId"));
  if (isNaN(songId)) {
    return c.json({ error: "Invalid songId" }, 400);
  }

  const targetLang = c.req.query("targetLang");
  const provider = c.req.query("provider") || "local";
  const modelVariant =
    provider === "local"
      ? c.req.query("localModel") || "translategemma-4b-4bit"
      : "google-cloud-v2";

  const db = getDb();

  // Fetch song
  const song = db
    .query("SELECT * FROM songs WHERE id = ?")
    .get(songId) as any;

  if (!song) {
    return c.json({ error: "Song not found" }, 404);
  }

  // Fetch lyrics
  const lyrics = db
    .query("SELECT * FROM lyrics WHERE song_id = ? ORDER BY line_number")
    .all(songId) as any[];

  // Fetch translations if targetLang specified
  let translations: any[] = [];
  if (targetLang) {
    translations = db
      .query(
        `SELECT t.*, o.translated_text as override_text
         FROM lyrics l
         LEFT JOIN translations t ON t.lyrics_id = l.id
           AND t.target_lang = ? AND t.provider = ? AND t.model_variant = ?
         LEFT JOIN translation_overrides o ON o.lyrics_id = l.id
           AND o.target_lang = ?
         WHERE l.song_id = ?
         ORDER BY l.line_number`
      )
      .all(targetLang, provider, modelVariant, targetLang, songId) as any[];
  }

  return c.json({
    data: {
      song: {
        id: song.id,
        title: song.title,
        artist: song.artist,
        sourceLang: song.source_lang,
        youtubeId: song.youtube_id,
        artworkUrl: song.artwork_url,
      },
      lyrics: lyrics.map((l: any) => ({
        id: l.id,
        songId: l.song_id,
        lineNumber: l.line_number,
        text: l.text,
        startTime: l.start_time,
        endTime: l.end_time,
      })),
      translations: translations.map((t: any) => ({
        lyricsId: t.lyrics_id,
        translatedText: t.override_text || t.translated_text,
        provider: t.override_text ? "override" : t.provider,
        modelVariant: t.override_text ? "manual" : t.model_variant,
      })),
    },
  });
});
