import type { TranslationResult } from "@lyrilearn/shared";
import type { TranslationProvider } from "./provider";

const GOOGLE_TRANSLATE_URL =
  "https://translation.googleapis.com/language/translate/v2";

function getApiKey(): string | undefined {
  return Bun.env.GOOGLE_CLOUD_API_KEY;
}

interface GoogleTranslateResponse {
  data: {
    translations: Array<{
      translatedText: string;
      detectedSourceLanguage?: string;
    }>;
  };
}

export class CloudProvider implements TranslationProvider {
  readonly name = "cloud";

  async translate(
    text: string,
    sourceLang: string,
    targetLang: string
  ): Promise<TranslationResult> {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error("GOOGLE_CLOUD_API_KEY not configured");
    }

    const start = performance.now();

    const params = new URLSearchParams({
      q: text,
      source: sourceLang,
      target: targetLang,
      key: apiKey!,
      format: "text",
    });

    const res = await fetch(`${GOOGLE_TRANSLATE_URL}?${params}`);

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Google Translate error (${res.status}): ${body}`);
    }

    const data: GoogleTranslateResponse = await res.json();
    const translation = data.data.translations[0];

    return {
      translatedText: translation.translatedText,
      provider: "cloud",
      modelVariant: "google-cloud-v2",
      latencyMs: Math.round(performance.now() - start),
    };
  }

  async isAvailable(): Promise<boolean> {
    return !!getApiKey();
  }
}
