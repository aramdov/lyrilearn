import type { TranslationResult, LocalModel } from "@lyrilearn/shared";
import type { TranslationProvider } from "./provider";
import { LocalProvider, EditorializedError } from "./local";
import type { BatchItemOutcome } from "./local";
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
  const localModel = opts.localModel || "translategemma-4b-4bit";
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
    try {
      result = await selectedProvider.translate(text, sourceLang, targetLang);
    } catch (err) {
      // If local model editorialized (e.g. profanity), fallback to cloud
      if (err instanceof EditorializedError && provider === "local") {
        if (await cloudProvider.isAvailable()) {
          result = await cloudProvider.translate(text, sourceLang, targetLang);
        } else {
          // No cloud fallback — return the editorialized output as-is
          result = {
            translatedText: err.translation,
            provider: "local",
            modelVariant: localModel,
            latencyMs: 0,
          };
        }
      } else {
        throw err;
      }
    }
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

// ─── Batch translation ──────────────────────────────────────

export interface BatchTranslateItem {
  text: string;
  sourceLang: string;
  lyricsId?: number;
}

export interface BatchTranslateOptions {
  items: BatchTranslateItem[];
  targetLang: string;
  provider: "local" | "cloud";
  localModel?: LocalModel;
}

export interface BatchTranslateResult {
  translatedText: string;
  provider: "local" | "cloud";
  modelVariant?: string;
  latencyMs: number;
}

/**
 * Batch translation with three-phase orchestration:
 * 1. Override + cache check per item → collect uncached indices
 * 2. Batch call to provider → map results back
 * 3. Cloud retry for editorialized items (local provider only)
 */
export async function translateBatch(
  opts: BatchTranslateOptions
): Promise<(BatchTranslateResult | null)[]> {
  const { items, targetLang, provider } = opts;
  const localModel = opts.localModel || "translategemma-4b-4bit";
  const modelVariant =
    provider === "local" ? localModel : "google-cloud-v2";

  const results: (BatchTranslateResult | null)[] = new Array(items.length).fill(null);

  // ── Phase 1: Override + cache check ─────────────────────
  const uncachedIndices: number[] = [];

  for (let i = 0; i < items.length; i++) {
    const { lyricsId } = items[i];

    if (lyricsId) {
      const override = getOverride(lyricsId, targetLang);
      if (override) {
        results[i] = {
          translatedText: override,
          provider,
          modelVariant: "manual-override",
          latencyMs: 0,
        };
        continue;
      }

      const cached = getCachedTranslation(lyricsId, targetLang, provider, modelVariant);
      if (cached) {
        results[i] = {
          translatedText: cached.translatedText,
          provider: cached.provider as "local" | "cloud",
          modelVariant: cached.modelVariant || modelVariant,
          latencyMs: cached.latencyMs,
        };
        continue;
      }
    }

    uncachedIndices.push(i);
  }

  if (uncachedIndices.length === 0) return results;

  // ── Phase 1b: Deduplicate identical texts ───────────────
  // Many songs repeat lines (choruses). Translate each unique text once,
  // then fan the result back to all indices sharing that text.
  const textToFirstIdx = new Map<string, number>(); // text → first uncachedIndices position
  const uniqueIndices: number[] = [];               // indices into uncachedIndices (deduped)
  const duplicateMap = new Map<number, number[]>();  // first position → [duplicate positions]

  for (let j = 0; j < uncachedIndices.length; j++) {
    const text = items[uncachedIndices[j]].text;
    const existing = textToFirstIdx.get(text);
    if (existing !== undefined) {
      // This text was already seen — record as duplicate
      const dupes = duplicateMap.get(existing) || [];
      dupes.push(j);
      duplicateMap.set(existing, dupes);
    } else {
      textToFirstIdx.set(text, j);
      uniqueIndices.push(j);
    }
  }

  // ── Phase 2: Batch call to provider ─────────────────────
  const textsToTranslate = uniqueIndices.map((j) => items[uncachedIndices[j]].text);
  const sourceLang = items[uncachedIndices[0]].sourceLang;
  const editorializedIndices: number[] = [];

  // Apply a result to the unique index position + all its duplicates
  function applyResult(uniquePos: number, result: BatchTranslateResult | null) {
    const idx = uncachedIndices[uniquePos];
    results[idx] = result;
    if (result && items[idx].lyricsId) {
      cacheTranslation(items[idx].lyricsId!, targetLang, result);
    }
    // Fan out to duplicates
    for (const dupePos of duplicateMap.get(uniquePos) || []) {
      const dupeIdx = uncachedIndices[dupePos];
      results[dupeIdx] = result;
      if (result && items[dupeIdx].lyricsId) {
        cacheTranslation(items[dupeIdx].lyricsId!, targetLang, result);
      }
    }
  }

  if (provider === "local") {
    const localProvider = getLocalProvider(localModel);
    if (!(await localProvider.isAvailable())) {
      // Fallback: try cloud batch for everything
      if (await cloudProvider.isAvailable()) {
        const cloudResults = await cloudProvider.translateBatch(
          textsToTranslate,
          sourceLang,
          targetLang
        );
        for (let u = 0; u < uniqueIndices.length; u++) {
          applyResult(uniqueIndices[u], cloudResults[u]);
        }
        return results;
      }
      throw new Error("No translation provider available");
    }

    // Chunk at 20 (server-side cap)
    const CHUNK_SIZE = 20;
    const allOutcomes: BatchItemOutcome[] = [];

    for (let start = 0; start < textsToTranslate.length; start += CHUNK_SIZE) {
      const chunk = textsToTranslate.slice(start, start + CHUNK_SIZE);
      const outcomes = await localProvider.translateBatch(chunk, sourceLang, targetLang);
      allOutcomes.push(...outcomes);
    }

    for (let u = 0; u < uniqueIndices.length; u++) {
      const uniquePos = uniqueIndices[u];
      const outcome = allOutcomes[u];

      if (outcome.kind === "ok") {
        applyResult(uniquePos, outcome.result);
      } else if (outcome.kind === "editorialized") {
        const editResult: BatchTranslateResult = {
          translatedText: outcome.rawTranslation,
          provider: "local",
          modelVariant: localModel,
          latencyMs: 0,
        };
        applyResult(uniquePos, editResult);
        // Track all items indices (unique + dupes) for cloud retry
        editorializedIndices.push(uncachedIndices[uniquePos]);
        for (const dupePos of duplicateMap.get(uniquePos) || []) {
          editorializedIndices.push(uncachedIndices[dupePos]);
        }
      } else {
        applyResult(uniquePos, null);
      }
    }
  } else {
    // Cloud provider batch
    if (!(await cloudProvider.isAvailable())) {
      throw new Error("GOOGLE_CLOUD_API_KEY not configured");
    }

    const cloudResults = await cloudProvider.translateBatch(
      textsToTranslate,
      sourceLang,
      targetLang
    );
    for (let u = 0; u < uniqueIndices.length; u++) {
      applyResult(uniqueIndices[u], cloudResults[u]);
    }
  }

  // ── Phase 3: Cloud retry for editorialized items ────────
  if (editorializedIndices.length > 0 && (await cloudProvider.isAvailable())) {
    const editTexts = editorializedIndices.map((i) => items[i].text);
    try {
      const retryResults = await cloudProvider.translateBatch(
        editTexts,
        sourceLang,
        targetLang
      );
      for (let j = 0; j < editorializedIndices.length; j++) {
        const idx = editorializedIndices[j];
        results[idx] = retryResults[j];
        if (items[idx].lyricsId) {
          cacheTranslation(items[idx].lyricsId!, targetLang, retryResults[j]);
        }
      }
    } catch {
      // Cloud retry failed — keep the raw editorialized translations (already set in results)
      for (const idx of editorializedIndices) {
        if (items[idx].lyricsId && results[idx]) {
          cacheTranslation(items[idx].lyricsId!, targetLang, results[idx]!);
        }
      }
    }
  } else if (editorializedIndices.length > 0) {
    // No cloud available — cache the editorialized translations as-is
    for (const idx of editorializedIndices) {
      if (items[idx].lyricsId && results[idx]) {
        cacheTranslation(items[idx].lyricsId!, targetLang, results[idx]!);
      }
    }
  }

  return results;
}

// ─── Health check ───────────────────────────────────────────

export async function getProviderStatus() {
  const local4b = getLocalProvider("translategemma-4b-4bit");
  const local27b = getLocalProvider("translategemma-27b-4bit");

  return {
    local: await local4b.isAvailable(),
    cloud: await cloudProvider.isAvailable(),
    models: {
      "translategemma-4b-4bit": await local4b.isAvailable(),
      "translategemma-27b-4bit": await local27b.isAvailable(),
    },
  };
}
