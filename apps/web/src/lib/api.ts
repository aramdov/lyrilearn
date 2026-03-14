import type {
  Song,
  LyricLine,
  TranslationResult,
  Provider,
  LocalModel,
} from "@lyrilearn/shared";

const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || `Request failed: ${res.status}`);
  }
  return json.data;
}

// ─── Search ─────────────────────────────────────────────────

export interface YouTubeResult {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl?: string;
}

export type LyricsSource = "lrclib-synced" | "lrclib-plain" | "none";
export type MetadataSource = "lrclib" | "genius" | "query-fallback";

export interface SearchResponse {
  song: Song;
  lyrics: LyricLine[];
  youtubeResults: YouTubeResult[];
  lyricsSource: LyricsSource;
  metadataSource: MetadataSource;
}

export function search(
  query: string,
  sourceLang: string
): Promise<SearchResponse> {
  return request("/search", {
    method: "POST",
    body: JSON.stringify({ query, sourceLang }),
  });
}

// ─── Lyrics ─────────────────────────────────────────────────

export interface LyricsTranslation {
  lyricsId: number;
  translatedText: string;
  provider: string;
  modelVariant: string;
}

export interface LyricsResponse {
  song: Song;
  lyrics: LyricLine[];
  translations: LyricsTranslation[];
}

export function getLyrics(
  songId: number,
  targetLang: string,
  provider: Provider,
  localModel?: LocalModel
): Promise<LyricsResponse> {
  const params = new URLSearchParams({ targetLang, provider });
  if (localModel) params.set("localModel", localModel);
  return request(`/lyrics/${songId}?${params}`);
}

// ─── Translate ──────────────────────────────────────────────

export function translate(
  text: string,
  sourceLang: string,
  targetLang: string,
  provider: Provider,
  lyricsId?: number,
  localModel?: LocalModel
): Promise<TranslationResult> {
  return request("/translate", {
    method: "POST",
    body: JSON.stringify({
      text,
      sourceLang,
      targetLang,
      provider,
      localModel,
      lyricsId,
    }),
  });
}

// ─── Batch Translate ─────────────────────────────────────────

export interface BatchTranslateItem {
  text: string;
  sourceLang: string;
  lyricsId?: number;
}

export interface BatchTranslateResultItem {
  translatedText: string;
  provider: string;
  modelVariant?: string;
  latencyMs: number;
}

export function translateBatch(
  items: BatchTranslateItem[],
  targetLang: string,
  provider: Provider,
  localModel?: LocalModel
): Promise<(BatchTranslateResultItem | null)[]> {
  return request("/translate/batch", {
    method: "POST",
    body: JSON.stringify({
      items,
      targetLang,
      provider,
      localModel,
    }),
  });
}

// ─── Config ─────────────────────────────────────────────────

export interface ProviderStatus {
  local: boolean;
  cloud: boolean;
  models: Record<string, boolean>;
}

export function getConfig(): Promise<ProviderStatus> {
  return request("/config");
}
