// ─── Translation ─────────────────────────────────────────────

/** Provider identifies where a translation runs */
export type Provider = "local" | "cloud";

/** The specific local model to use (selectable in the frontend toggle) */
export type LocalModel = "translategemma-12b-4bit" | "translategemma-4b-4bit";

/** What the frontend sends: which engine + model to use */
export interface TranslationConfig {
  provider: Provider;
  localModel?: LocalModel; // only relevant when provider = "local"
}

export interface TranslationResult {
  translatedText: string;
  transliteration?: string;
  provider: Provider;
  modelVariant?: string; // e.g. "translategemma-12b-4bit" or "google-cloud-v3"
  latencyMs: number;
}

export interface TranslationProvider {
  translate(
    text: string,
    sourceLang: string,
    targetLang: string
  ): Promise<TranslationResult>;

  isAvailable(): Promise<boolean>;
}

// ─── Songs & Lyrics ─────────────────────────────────────────

export interface Song {
  id: number;
  title: string;
  artist: string;
  sourceLang: string;
  youtubeId?: string;
  geniusId?: string;
  lrclibId?: string;
  artworkUrl?: string;
  createdAt: string;
}

export interface LyricLine {
  id: number;
  songId: number;
  lineNumber: number;
  text: string;
  startTime?: number; // seconds (for karaoke sync)
  endTime?: number;
}

export interface Translation {
  id: number;
  lyricsId: number;
  targetLang: string;
  provider: Provider;
  translatedText: string;
  transliteration?: string;
  modelVariant?: string;
  latencyMs?: number;
  createdAt: string;
}

// ─── Search ─────────────────────────────────────────────────

export interface SearchRequest {
  query: string;
  sourceLang: string;
  targetLang: string;
  provider?: Provider;
  localModel?: LocalModel;
}

export interface SearchResult {
  song: Song;
  lyrics: LyricLine[];
  translations: Translation[];
  videoId?: string;
}

// ─── API Responses ──────────────────────────────────────────

export interface ApiSuccess<T> {
  data: T;
}

export interface ApiError {
  error: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ─── Flashcards (browser-side, IndexedDB) ───────────────────

export interface FlashcardEntry {
  id: string;
  songId: number;
  songTitle: string;
  artist: string;
  type: "word" | "line";
  source: string;
  target: string;
  transliteration?: string;
  sourceLang: string;
  targetLang: string;
  provider: Provider;
  context?: string;
  createdAt: number;
  reviewCount: number;
  lastReviewed?: number;
}
