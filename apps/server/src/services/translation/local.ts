import type { TranslationResult, LocalModel } from "@lyrilearn/shared";
import type { TranslationProvider } from "./provider";

const MLX_INFERENCE_URL = Bun.env.MLX_INFERENCE_URL || "http://localhost:8000";

interface MLXTranslateResponse {
  translation: string;
  latency_ms: number;
  model: string;
  editorialized?: boolean;
}

export class EditorializedError extends Error {
  readonly translation: string;
  constructor(translation: string) {
    super("Model editorialized instead of translating");
    this.name = "EditorializedError";
    this.translation = translation;
  }
}

interface MLXBatchResponse {
  items: Array<{
    translation: string;
    latency_ms: number;
    editorialized?: boolean;
    error?: string;
  }>;
  total_latency_ms: number;
  model: string;
}

export type BatchItemOutcome =
  | { kind: "ok"; result: TranslationResult }
  | { kind: "editorialized"; rawTranslation: string }
  | { kind: "error"; message: string };

interface MLXHealthResponse {
  status: string;
  default_model: string;
  loaded_models: string[];
  available_models: string[];
  backend: string;
}

export class LocalProvider implements TranslationProvider {
  readonly name = "local";
  private model: LocalModel;

  constructor(model: LocalModel = "translategemma-4b-4bit") {
    this.model = model;
  }

  async translate(
    text: string,
    sourceLang: string,
    targetLang: string
  ): Promise<TranslationResult> {
    const start = performance.now();

    const res = await fetch(`${MLX_INFERENCE_URL}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        target_lang: targetLang,
        source_lang: sourceLang,
        model: this.model,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`MLX inference error (${res.status}): ${body}`);
    }

    const data: MLXTranslateResponse = await res.json();

    // If the model editorialized (e.g. profanity commentary), throw so
    // the translation service can fallback to cloud provider
    if (data.editorialized) {
      throw new EditorializedError(data.translation);
    }

    return {
      translatedText: data.translation,
      provider: "local",
      modelVariant: data.model,
      latencyMs: Math.round(performance.now() - start),
    };
  }

  async translateBatch(
    texts: string[],
    sourceLang: string,
    targetLang: string
  ): Promise<BatchItemOutcome[]> {
    const res = await fetch(`${MLX_INFERENCE_URL}/translate_batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        texts,
        target_lang: targetLang,
        source_lang: sourceLang,
        model: this.model,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`MLX batch inference error (${res.status}): ${body}`);
    }

    const data: MLXBatchResponse = await res.json();

    return data.items.map((item): BatchItemOutcome => {
      if (item.error) {
        return { kind: "error", message: item.error };
      }
      if (item.editorialized) {
        return { kind: "editorialized", rawTranslation: item.translation };
      }
      return {
        kind: "ok",
        result: {
          translatedText: item.translation,
          provider: "local",
          modelVariant: data.model,
          latencyMs: Math.round(item.latency_ms),
        },
      };
    });
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${MLX_INFERENCE_URL}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) return false;
      const data: MLXHealthResponse = await res.json();
      return data.status === "ok";
    } catch {
      return false;
    }
  }
}
