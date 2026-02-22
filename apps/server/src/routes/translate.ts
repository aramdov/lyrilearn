import { Hono } from "hono";
import { translate } from "../services/translation";
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
