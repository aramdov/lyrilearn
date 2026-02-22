import type { TranslationResult, LocalModel } from "@lyrilearn/shared";
import type { TranslationProvider } from "./provider";

const MLX_INFERENCE_URL = Bun.env.MLX_INFERENCE_URL || "http://localhost:8000";

interface MLXTranslateResponse {
  translation: string;
  latency_ms: number;
  model: string;
}

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

  constructor(model: LocalModel = "translategemma-12b-4bit") {
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

    return {
      translatedText: data.translation,
      provider: "local",
      modelVariant: data.model,
      latencyMs: Math.round(performance.now() - start),
    };
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
