import { Hono } from "hono";
import { translate, translateBatch } from "../services/translation";
import type { LocalModel } from "@lyrilearn/shared";

export const translateRoutes = new Hono();

/**
 * POST /api/translate
 * Body: { text, sourceLang, targetLang, provider?, localModel?, lyricsId? }
 * Returns: { data: TranslationResult }
 */
translateRoutes.post("/", async (c) => {
  const body = await c.req.json();
  const { text, sourceLang, targetLang, provider, localModel, lyricsId } = body;

  if (!text || !sourceLang || !targetLang) {
    return c.json(
      { error: "Missing required fields: text, sourceLang, targetLang" },
      400
    );
  }

  try {
    const result = await translate({
      text,
      sourceLang,
      targetLang,
      provider: provider || "local",
      localModel: localModel as LocalModel | undefined,
      lyricsId,
    });

    return c.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Translation failed";
    return c.json({ error: message }, 503);
  }
});

/**
 * POST /api/translate/batch
 * Body: { items: [{text, sourceLang, lyricsId?}], targetLang, provider?, localModel? }
 * Returns: { data: Array<{translatedText, provider, modelVariant, latencyMs} | null> }
 */
translateRoutes.post("/batch", async (c) => {
  const body = await c.req.json();
  const { items, targetLang, provider, localModel } = body;

  if (!Array.isArray(items) || items.length === 0) {
    return c.json({ error: "items must be a non-empty array" }, 400);
  }
  if (!targetLang) {
    return c.json({ error: "Missing required field: targetLang" }, 400);
  }

  try {
    const results = await translateBatch({
      items: items.map((item: any) => ({
        text: item.text,
        sourceLang: item.sourceLang,
        lyricsId: item.lyricsId,
      })),
      targetLang,
      provider: provider || "local",
      localModel: localModel as LocalModel | undefined,
    });

    return c.json({ data: results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Batch translation failed";
    return c.json({ error: message }, 503);
  }
});
