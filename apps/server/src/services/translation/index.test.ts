import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";

// ─── Mock fetch to control provider HTTP behavior ───────────

const originalFetch = globalThis.fetch;

const fetchMock = {
  localHealthOk: false,
  localTranslation: "local translation",
  cloudTranslation: "cloud translation",
};

globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

  // MLX health check
  if (urlStr.includes("/health")) {
    if (!fetchMock.localHealthOk) throw new Error("Connection refused");
    return new Response(
      JSON.stringify({
        status: "ok",
        default_model: "translategemma-12b-4bit",
        loaded_models: ["translategemma-12b-4bit"],
        available_models: ["translategemma-12b-4bit", "translategemma-4b-4bit"],
        backend: "mlx",
      }),
      { status: 200 }
    );
  }

  // MLX translate
  if (urlStr.includes("localhost:8000/translate")) {
    return new Response(
      JSON.stringify({
        translation: fetchMock.localTranslation,
        latency_ms: 100,
        model: "translategemma-12b-4bit",
      }),
      { status: 200 }
    );
  }

  // Google Cloud Translation
  if (urlStr.includes("googleapis.com")) {
    return new Response(
      JSON.stringify({
        data: {
          translations: [{ translatedText: fetchMock.cloudTranslation }],
        },
      }),
      { status: 200 }
    );
  }

  return originalFetch(url, init);
}) as any;

// ─── Mock DB ────────────────────────────────────────────────

const dbState: { db: Database | null } = { db: null };

mock.module("../../db", () => ({
  getDb: () => dbState.db,
}));

import { translate, getProviderStatus } from "./index";

// ─── Setup ──────────────────────────────────────────────────

function initTestDb() {
  dbState.db = new Database(":memory:");
  dbState.db.exec(`
    CREATE TABLE translations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lyrics_id INTEGER,
      target_lang TEXT NOT NULL,
      provider TEXT NOT NULL,
      translated_text TEXT NOT NULL,
      transliteration TEXT,
      model_variant TEXT NOT NULL,
      latency_ms REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(lyrics_id, target_lang, provider, model_variant)
    );
    CREATE TABLE translation_overrides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lyrics_id INTEGER,
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
  fetchMock.localHealthOk = false;
  // Control cloud availability via env var (read at call time by CloudProvider)
  delete (Bun.env as any).GOOGLE_CLOUD_API_KEY;
});

afterEach(() => {
  dbState.db?.close();
  delete (Bun.env as any).GOOGLE_CLOUD_API_KEY;
});

// ─── Priority Chain Tests ───────────────────────────────────

describe("translate() priority chain", () => {
  test("1. manual override wins over everything", async () => {
    dbState.db!
      .query(
        "INSERT INTO translation_overrides (lyrics_id, target_lang, translated_text) VALUES (?, ?, ?)"
      )
      .run(1, "en", "manually corrected");

    fetchMock.localHealthOk = true;

    const result = await translate({
      text: "Привет",
      sourceLang: "ru",
      targetLang: "en",
      provider: "local",
      lyricsId: 1,
    });

    expect(result.translatedText).toBe("manually corrected");
    expect(result.modelVariant).toBe("manual-override");
    expect(result.latencyMs).toBe(0);
  });

  test("2. cache hit returns cached translation", async () => {
    dbState.db!
      .query(
        `INSERT INTO translations (lyrics_id, target_lang, provider, translated_text, model_variant, latency_ms)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(1, "en", "local", "cached result", "translategemma-12b-4bit", 200);

    const result = await translate({
      text: "Привет",
      sourceLang: "ru",
      targetLang: "en",
      provider: "local",
      lyricsId: 1,
    });

    expect(result.translatedText).toBe("cached result");
    expect(result.latencyMs).toBe(200);
  });

  test("3. live translation when no cache", async () => {
    fetchMock.localHealthOk = true;

    const result = await translate({
      text: "Привет",
      sourceLang: "ru",
      targetLang: "en",
      provider: "local",
      lyricsId: 1,
    });

    expect(result.translatedText).toBe("local translation");
    expect(result.provider).toBe("local");
  });

  test("3b. live translation is cached for future lookups", async () => {
    fetchMock.localHealthOk = true;

    await translate({
      text: "Привет",
      sourceLang: "ru",
      targetLang: "en",
      provider: "local",
      lyricsId: 1,
    });

    const cached = dbState.db!
      .query(
        "SELECT translated_text FROM translations WHERE lyrics_id = 1 AND target_lang = 'en'"
      )
      .get() as any;

    expect(cached.translated_text).toBe("local translation");
  });

  test("4. falls back to cloud when local unavailable", async () => {
    fetchMock.localHealthOk = false;
    Bun.env.GOOGLE_CLOUD_API_KEY = "test-key";

    const result = await translate({
      text: "Привет",
      sourceLang: "ru",
      targetLang: "en",
      provider: "local",
      lyricsId: 1,
    });

    expect(result.translatedText).toBe("cloud translation");
    expect(result.provider).toBe("cloud");
  });

  test("throws when no provider is available", async () => {
    fetchMock.localHealthOk = false;

    expect(
      translate({
        text: "Привет",
        sourceLang: "ru",
        targetLang: "en",
        provider: "local",
      })
    ).rejects.toThrow("No translation provider available");
  });

  test("works without lyricsId (no caching)", async () => {
    fetchMock.localHealthOk = true;

    const result = await translate({
      text: "Привет",
      sourceLang: "ru",
      targetLang: "en",
      provider: "local",
    });

    expect(result.translatedText).toBe("local translation");

    const count = dbState.db!
      .query("SELECT COUNT(*) as c FROM translations")
      .get() as any;
    expect(count.c).toBe(0);
  });

  test("cloud provider uses correct model variant for cache key", async () => {
    Bun.env.GOOGLE_CLOUD_API_KEY = "test-key";

    await translate({
      text: "Hello",
      sourceLang: "en",
      targetLang: "ru",
      provider: "cloud",
      lyricsId: 5,
    });

    const cached = dbState.db!
      .query("SELECT model_variant FROM translations WHERE lyrics_id = 5")
      .get() as any;

    expect(cached.model_variant).toBe("google-cloud-v2");
  });
});

// ─── Provider Status Tests ──────────────────────────────────

describe("getProviderStatus()", () => {
  test("reports all unavailable", async () => {
    const status = await getProviderStatus();
    expect(status.local).toBe(false);
    expect(status.cloud).toBe(false);
  });

  test("reports local available, cloud unavailable", async () => {
    fetchMock.localHealthOk = true;

    const status = await getProviderStatus();
    expect(status.local).toBe(true);
    expect(status.cloud).toBe(false);
  });

  test("reports cloud available when API key set", async () => {
    Bun.env.GOOGLE_CLOUD_API_KEY = "test-key";

    const status = await getProviderStatus();
    expect(status.cloud).toBe(true);
  });
});
