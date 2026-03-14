import { describe, test, expect, mock, beforeEach, afterEach, afterAll } from "bun:test";
import { Hono } from "hono";
import { Database } from "bun:sqlite";

// Use real in-memory SQLite for accurate query testing
let testDb: Database;

mock.module("../db", () => ({
  getDb: () => testDb,
}));

import { lyricsRoutes } from "./lyrics";

const app = new Hono();
app.route("/api/lyrics", lyricsRoutes);

function req(path: string) {
  return app.request(`http://localhost/api/lyrics${path}`);
}

function initTestDb() {
  testDb = new Database(":memory:");
  testDb.exec(`
    CREATE TABLE songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      source_lang TEXT NOT NULL,
      youtube_id TEXT,
      genius_id TEXT,
      lrclib_id TEXT,
      artwork_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(title, artist, source_lang)
    );
    CREATE TABLE lyrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      song_id INTEGER REFERENCES songs(id),
      line_number INTEGER NOT NULL,
      text TEXT NOT NULL,
      start_time REAL,
      end_time REAL,
      UNIQUE(song_id, line_number)
    );
    CREATE TABLE translations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lyrics_id INTEGER REFERENCES lyrics(id),
      target_lang TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'local',
      translated_text TEXT NOT NULL,
      transliteration TEXT,
      model_variant TEXT NOT NULL DEFAULT 'translategemma-4b-4bit',
      latency_ms REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(lyrics_id, target_lang, provider, model_variant)
    );
    CREATE TABLE translation_overrides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lyrics_id INTEGER REFERENCES lyrics(id),
      target_lang TEXT NOT NULL,
      translated_text TEXT NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(lyrics_id, target_lang)
    );
  `);
}

beforeEach(() => {
  initTestDb();
});

afterEach(() => {
  testDb.close();
});

afterAll(() => {
  mock.restore();
});

describe("GET /api/lyrics/:songId", () => {
  test("returns 400 for non-numeric songId", async () => {
    const res = await req("/abc");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid songId");
  });

  test("returns 404 when song not found", async () => {
    const res = await req("/999");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Song not found");
  });

  test("returns song with lyrics (no translations)", async () => {
    testDb.exec(`
      INSERT INTO songs (id, title, artist, source_lang, youtube_id, artwork_url)
      VALUES (1, 'Test Song', 'Test Artist', 'en', 'abc123', 'https://example.com/art.jpg');
      INSERT INTO lyrics (id, song_id, line_number, text, start_time, end_time)
      VALUES (10, 1, 1, 'Hello world', 5.0, 10.0);
      INSERT INTO lyrics (id, song_id, line_number, text, start_time, end_time)
      VALUES (11, 1, 2, 'Goodbye world', 10.0, 15.0);
    `);

    const res = await req("/1");
    expect(res.status).toBe(200);
    const { data } = await res.json();

    expect(data.song).toEqual({
      id: 1,
      title: "Test Song",
      artist: "Test Artist",
      sourceLang: "en",
      youtubeId: "abc123",
      artworkUrl: "https://example.com/art.jpg",
    });

    expect(data.lyrics).toHaveLength(2);
    expect(data.lyrics[0]).toEqual({
      id: 10,
      songId: 1,
      lineNumber: 1,
      text: "Hello world",
      startTime: 5.0,
      endTime: 10.0,
    });

    expect(data.translations).toHaveLength(0);
  });

  test("returns translations with override precedence", async () => {
    testDb.exec(`
      INSERT INTO songs (id, title, artist, source_lang) VALUES (1, 'Song', 'Artist', 'ru');
      INSERT INTO lyrics (id, song_id, line_number, text, start_time, end_time)
      VALUES (10, 1, 1, 'Привет', 0, 5);
      INSERT INTO translations (lyrics_id, target_lang, provider, translated_text, model_variant)
      VALUES (10, 'en', 'local', 'Hi (machine)', 'translategemma-4b-4bit');
      INSERT INTO translation_overrides (lyrics_id, target_lang, translated_text)
      VALUES (10, 'en', 'Hello (corrected)');
    `);

    const res = await req("/1?targetLang=en");
    expect(res.status).toBe(200);
    const { data } = await res.json();

    // Override text should win
    expect(data.translations[0].translatedText).toBe("Hello (corrected)");
    expect(data.translations[0].provider).toBe("override");
    expect(data.translations[0].modelVariant).toBe("manual");
  });

  test("returns machine translation when no override exists", async () => {
    testDb.exec(`
      INSERT INTO songs (id, title, artist, source_lang) VALUES (1, 'Song', 'Artist', 'ru');
      INSERT INTO lyrics (id, song_id, line_number, text, start_time, end_time)
      VALUES (10, 1, 1, 'Мир', 0, 5);
      INSERT INTO translations (lyrics_id, target_lang, provider, translated_text, model_variant)
      VALUES (10, 'en', 'local', 'World', 'translategemma-4b-4bit');
    `);

    const res = await req("/1?targetLang=en");
    const { data } = await res.json();

    expect(data.translations[0].translatedText).toBe("World");
    expect(data.translations[0].provider).toBe("local");
    expect(data.translations[0].modelVariant).toBe("translategemma-4b-4bit");
  });
});
