-- LyriLearn Database Schema
-- Applied via: bun run db:init

-- Cached songs
CREATE TABLE IF NOT EXISTS songs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    artist      TEXT NOT NULL,
    source_lang TEXT NOT NULL,
    youtube_id  TEXT,
    genius_id   TEXT,
    lrclib_id   TEXT,
    artwork_url TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(title, artist, source_lang)
);

-- Cached lyrics (original)
CREATE TABLE IF NOT EXISTS lyrics (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    song_id     INTEGER REFERENCES songs(id),
    line_number INTEGER NOT NULL,
    text        TEXT NOT NULL,
    start_time  REAL,
    end_time    REAL,
    UNIQUE(song_id, line_number)
);

-- Cached translations (keyed by provider + model variant)
CREATE TABLE IF NOT EXISTS translations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    lyrics_id       INTEGER REFERENCES lyrics(id),
    target_lang     TEXT NOT NULL,
    provider        TEXT NOT NULL DEFAULT 'local',
    translated_text TEXT NOT NULL,
    transliteration TEXT,
    model_variant   TEXT NOT NULL DEFAULT 'translategemma-4b-4bit',
    latency_ms      REAL,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(lyrics_id, target_lang, provider, model_variant)
);

-- Manual translation overrides (highest priority)
CREATE TABLE IF NOT EXISTS translation_overrides (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    lyrics_id       INTEGER REFERENCES lyrics(id),
    target_lang     TEXT NOT NULL,
    translated_text TEXT NOT NULL,
    notes           TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(lyrics_id, target_lang)
);

-- Search cache
CREATE TABLE IF NOT EXISTS search_cache (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    query       TEXT NOT NULL,
    source_lang TEXT NOT NULL,
    result_json TEXT NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at  DATETIME,
    UNIQUE(query, source_lang)
);

-- Benchmark results (for optimization experiments)
CREATE TABLE IF NOT EXISTS translation_benchmarks (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    experiment_name TEXT NOT NULL,
    model_variant   TEXT NOT NULL,
    provider        TEXT NOT NULL,
    source_lang     TEXT NOT NULL,
    target_lang     TEXT NOT NULL,
    input_text      TEXT NOT NULL,
    output_text     TEXT NOT NULL,
    reference_text  TEXT,
    tokens_per_sec  REAL,
    latency_ms      REAL,
    bleu_score      REAL,
    memory_usage_mb REAL,
    quantization    TEXT,
    notes           TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);
