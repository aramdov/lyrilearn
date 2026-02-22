import type { TranslationResult } from "@lyrilearn/shared";

/**
 * Common interface for all translation providers.
 * Both LocalProvider (MLX) and CloudProvider (Google) implement this.
 */
export interface TranslationProvider {
  readonly name: string;

  translate(
    text: string,
    sourceLang: string,
    targetLang: string
  ): Promise<TranslationResult>;

  isAvailable(): Promise<boolean>;
}
