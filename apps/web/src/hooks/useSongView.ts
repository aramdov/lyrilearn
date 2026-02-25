import { useState } from "react";
import type { Song, LyricLine, Provider, LocalModel } from "@lyrilearn/shared";
import * as api from "@/lib/api";
import type { LyricsTranslation } from "@/lib/api";

export type ViewMode = "side-by-side" | "interleaved";

export interface Settings {
  sourceLang: string;
  targetLang: string;
  provider: Provider;
  localModel: LocalModel;
  viewMode: ViewMode;
}

export function useSongView(settings: Settings) {
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [translations, setTranslations] = useState<Map<number, LyricsTranslation>>(new Map());
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [translating, setTranslating] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const translateLines = async (lines: LyricLine[], s: Settings) => {
    const CONCURRENCY = 5;
    const queue = [...lines];

    const worker = async () => {
      while (queue.length > 0) {
        const line = queue.shift()!;
        setTranslating((prev) => new Set(prev).add(line.id));

        try {
          const result = await api.translate(
            line.text,
            s.sourceLang,
            s.targetLang,
            s.provider,
            line.id,
            s.provider === "local" ? s.localModel : undefined
          );
          setTranslations((prev) => {
            const next = new Map(prev);
            next.set(line.id, {
              lyricsId: line.id,
              translatedText: result.translatedText,
              provider: result.provider,
              modelVariant: result.modelVariant || "",
            });
            return next;
          });
        } catch {
          // Line translation failed — leave it empty, don't block others
        } finally {
          setTranslating((prev) => {
            const next = new Set(prev);
            next.delete(line.id);
            return next;
          });
        }
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  };

  const fetchTranslations = async (songId: number, s: Settings) => {
    setTranslations(new Map());
    setLyricsLoading(true);
    setError(null);
    try {
      const data = await api.getLyrics(
        songId,
        s.targetLang,
        s.provider,
        s.provider === "local" ? s.localModel : undefined
      );
      setLyrics(data.lyrics);
      const transMap = new Map<number, LyricsTranslation>();
      for (const t of data.translations) {
        if (t.translatedText) transMap.set(t.lyricsId, t);
      }
      setTranslations(transMap);

      const untranslated = data.lyrics.filter(
        (l) => !transMap.has(l.id) && l.text.trim()
      );
      if (untranslated.length > 0) {
        translateLines(untranslated, s);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load lyrics");
    } finally {
      setLyricsLoading(false);
    }
  };

  const selectSong = async (song: Song, songLyrics: LyricLine[]) => {
    setCurrentSong(song);
    setLyrics(songLyrics);
    setTranslations(new Map());
    setError(null);
    await fetchTranslations(song.id, settings);
  };

  const clearSong = () => {
    setCurrentSong(null);
    setLyrics([]);
    setTranslations(new Map());
    setError(null);
  };

  const refetchTranslations = (s: Settings) => {
    if (currentSong) {
      fetchTranslations(currentSong.id, s);
    }
  };

  return {
    currentSong,
    lyrics,
    translations,
    lyricsLoading,
    translating,
    error,
    selectSong,
    clearSong,
    refetchTranslations,
  };
}
