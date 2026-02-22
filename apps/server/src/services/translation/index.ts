import type { TranslationResult, LocalModel } from "@lyrilearn/shared";
import type { TranslationProvider } from "./provider";
import { LocalProvider } from "./local";
import { CloudProvider } from "./cloud";
import { getDb } from "../../db";

// ─── Provider instances ─────────────────────────────────────

const cloudProvider = new CloudProvider();

function getLocalProvider(model: LocalModel): LocalProvider {
  return new LocalProvider(model);
}

// ─── Cache + override lookups ───────────────────────────────

function getCachedTranslation(
  lyricsId: number,
  targetLang: string,
  provider: string,
  modelVariant: string
): TranslationResult | null {
  const db = getDb();
  const row = db
    .query(
      `SELECT translated_text, transliteration, provider, model_variant, latency_ms
       FROM translations
       WHERE lyrics_id = ? AND target_lang = ? AND provider = ? AND model_variant = ?`
    )
    .get(lyricsId, targetLang, provider, modelVariant) as any;

  if (!row) return null;

  return {
    translatedText: row.translated_text,
    transliteration: row.transliteration || undefined,
    provider: row.provider,
    modelVariant: row.model_variant,
    latencyMs: row.latency_ms || 0,
  };
}

function getOverride(
  lyricsId: number,
  targetLang: string
): string | null {
  const db = getDb();
  const row = db
    .query(
      `SELECT translated_text FROM translation_overrides
       WHERE lyrics_id = ? AND target_lang = ?`
    )
    .get(lyricsId, targetLang) as any;

  return row?.translated_text || null;
}

function cacheTranslation(
  lyricsId: number,
  targetLang: string,
  result: TranslationResult
): void {
  const db = getDb();
  db.query(
    `INSERT OR REPLACE INTO translations
     (lyrics_id, target_lang, provider, translated_text, transliteration, model_variant, latency_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    lyricsId,
    targetLang,
    result.provider,
    result.translatedText,
    result.transliteration || null,
    result.modelVariant || null,
    result.latencyMs
  );
}

// ─── Main translation function ──────────────────────────────

export interface TranslateOptions {
  text: string;
  sourceLang: string;
  targetLang: string;
  provider: "local" | "cloud";
  localModel?: LocalModel;
  /** If provided, enables cache lookup + storage via lyrics ID */
  lyricsId?: number;
}

/**
 * Priority order:
 * 1. Manual overrides (translation_overrides table) — always win
 * 2. Cached translation for the requested provider + model
 * 3. Live translation from the requested provider
 * 4. If requested provider is unavailable, fall back to the other one
 */
export async function translate(
  opts: TranslateOptions
): Promise<TranslationResult> {
  const { text, sourceLang, targetLang, provider, lyricsId } = opts;
  const localModel = opts.localModel || "translategemma-12b-4bit";
  const modelVariant =
    provider === "local" ? localModel : "google-cloud-v2";

  // 1. Check manual overrides
  if (lyricsId) {
    const override = getOverride(lyricsId, targetLang);
    if (override) {
      return {
        translatedText: override,
        provider,
        modelVariant: "manual-override",
        latencyMs: 0,
      };
    }
  }

  // 2. Check cache
  if (lyricsId) {
    const cached = getCachedTranslation(
      lyricsId,
      targetLang,
      provider,
      modelVariant
    );
    if (cached) return cached;
  }

  // 3. Live translation from requested provider
  const selectedProvider: TranslationProvider =
    provider === "local" ? getLocalProvider(localModel) : cloudProvider;

  let result: TranslationResult;

  if (await selectedProvider.isAvailable()) {
    result = await selectedProvider.translate(text, sourceLang, targetLang);
  } else {
    // 4. Fallback to the other provider
    const fallback: TranslationProvider =
      provider === "local" ? cloudProvider : getLocalProvider(localModel);

    if (!(await fallback.isAvailable())) {
      throw new Error("No translation provider available");
    }

    result = await fallback.translate(text, sourceLang, targetLang);
  }

  // Cache the result
  if (lyricsId) {
    cacheTranslation(lyricsId, targetLang, result);
  }

  return result;
}

// ─── Health check ───────────────────────────────────────────

export async function getProviderStatus() {
  const local12b = getLocalProvider("translategemma-12b-4bit");
  const local4b = getLocalProvider("translategemma-4b-4bit");

  return {
    local: await local12b.isAvailable(),
    cloud: await cloudProvider.isAvailable(),
    models: {
      "translategemma-12b-4bit": await local12b.isAvailable(),
      "translategemma-4b-4bit": await local4b.isAvailable(),
    },
  };
}
