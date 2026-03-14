import { useState, useRef } from "react";
import type { Song, LyricLine, Provider, LocalModel } from "@lyrilearn/shared";
import * as api from "@/lib/api";
import type { LyricsTranslation } from "@/lib/api";

export type ViewMode = "side-by-side" | "interleaved" | "karaoke";

export interface Settings {
  sourceLang: string;
  targetLang: string;
  provider: Provider;
  localModel: LocalModel;
  viewMode: ViewMode;
  showTransliteration: boolean;
}

export function useSongView(settings: Settings) {
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [translations, setTranslations] = useState<Map<number, LyricsTranslation>>(new Map());
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [translating, setTranslating] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [translationFailCount, setTranslationFailCount] = useState(0);
  const [translationError, setTranslationError] = useState<string | null>(null);

  // ─── Compare mode state ──────────────────────────────────
  const [compareTranslations, setCompareTranslations] = useState<Map<number, LyricsTranslation>>(new Map());
  const [comparingIds, setComparingIds] = useState<Set<number>>(new Set());
  const [compareError, setCompareError] = useState<string | null>(null);

  // Generation counter — incremented on each fetch cycle.
  // Stale translation results from a previous cycle are discarded.
  const generationRef = useRef(0);
  const compareGenRef = useRef(0);

  const translateLines = async (lines: LyricLine[], s: Settings, generation: number) => {
    // Mark all lines as translating upfront
    setTranslating(new Set(lines.map((l) => l.id)));

    try {
      const batchItems = lines.map((line) => ({
        text: line.text,
        sourceLang: s.sourceLang,
        lyricsId: line.id,
      }));

      const results = await api.translateBatch(
        batchItems,
        s.targetLang,
        s.provider,
        s.provider === "local" ? s.localModel : undefined
      );

      if (generationRef.current !== generation) return; // stale — discard

      setTranslations((prev) => {
        const next = new Map(prev);
        let failCount = 0;
        let firstError: string | null = null;

        for (let i = 0; i < lines.length; i++) {
          const result = results[i];
          if (result) {
            next.set(lines[i].id, {
              lyricsId: lines[i].id,
              translatedText: result.translatedText,
              provider: result.provider,
              modelVariant: result.modelVariant || "",
            });
          } else {
            failCount++;
            if (!firstError) firstError = "Translation failed for some lines";
          }
        }

        if (failCount > 0) {
          setTranslationFailCount((prev) => prev + failCount);
          setTranslationError((prev) => prev ?? firstError);
        }

        return next;
      });
    } catch (err) {
      if (generationRef.current === generation) {
        setTranslationFailCount(lines.length);
        setTranslationError(
          err instanceof Error ? err.message : "Batch translation failed"
        );
      }
    } finally {
      if (generationRef.current === generation) {
        setTranslating(new Set());
      }
    }
  };

  const fetchTranslations = async (songId: number, s: Settings) => {
    const generation = ++generationRef.current;
    setTranslations(new Map());
    setTranslating(new Set());
    setLyricsLoading(true);
    setError(null);
    setTranslationFailCount(0);
    setTranslationError(null);
    try {
      const data = await api.getLyrics(
        songId,
        s.targetLang,
        s.provider,
        s.provider === "local" ? s.localModel : undefined
      );

      if (generationRef.current !== generation) return; // stale — discard

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
        translateLines(untranslated, s, generation);
      }
    } catch (err) {
      if (generationRef.current !== generation) return;
      setError(err instanceof Error ? err.message : "Failed to load lyrics");
    } finally {
      if (generationRef.current === generation) {
        setLyricsLoading(false);
      }
    }
  };

  const selectSong = async (song: Song, songLyrics: LyricLine[]) => {
    setCurrentSong(song);
    setLyrics(songLyrics);
    setTranslations(new Map());
    setError(null);
    await fetchTranslations(song.id, settings);
  };

  const fetchCompareTranslations = async (altProvider: Provider, altModel?: LocalModel) => {
    if (!currentSong) return;
    const generation = ++compareGenRef.current;
    setCompareTranslations(new Map());
    setComparingIds(new Set());
    setCompareError(null);

    try {
      const data = await api.getLyrics(
        currentSong.id,
        settings.targetLang,
        altProvider,
        altProvider === "local" ? altModel : undefined
      );

      if (compareGenRef.current !== generation) return;

      const transMap = new Map<number, LyricsTranslation>();
      for (const t of data.translations) {
        if (t.translatedText) transMap.set(t.lyricsId, t);
      }
      setCompareTranslations(transMap);

      // Translate any uncached lines with the alternate provider
      const untranslated = lyrics.filter(
        (l) => !transMap.has(l.id) && l.text.trim()
      );
      if (untranslated.length > 0) {
        setComparingIds(new Set(untranslated.map((l) => l.id)));

        try {
          const batchItems = untranslated.map((line) => ({
            text: line.text,
            sourceLang: settings.sourceLang,
            lyricsId: line.id,
          }));

          const results = await api.translateBatch(
            batchItems,
            settings.targetLang,
            altProvider,
            altProvider === "local" ? altModel : undefined
          );

          if (compareGenRef.current !== generation) return;

          setCompareTranslations((prev) => {
            const next = new Map(prev);
            for (let i = 0; i < untranslated.length; i++) {
              const result = results[i];
              if (result) {
                next.set(untranslated[i].id, {
                  lyricsId: untranslated[i].id,
                  translatedText: result.translatedText,
                  provider: result.provider,
                  modelVariant: result.modelVariant || "",
                });
              }
            }
            return next;
          });
        } catch (err) {
          if (compareGenRef.current === generation) {
            setCompareError(
              err instanceof Error ? err.message : "Compare translation failed"
            );
          }
        } finally {
          if (compareGenRef.current === generation) {
            setComparingIds(new Set());
          }
        }
      }
    } catch (err) {
      if (compareGenRef.current === generation) {
        setCompareError(
          err instanceof Error ? err.message : "Failed to load compare translations"
        );
      }
    }
  };

  const clearCompare = () => {
    compareGenRef.current++;
    setCompareTranslations(new Map());
    setComparingIds(new Set());
    setCompareError(null);
  };

  const clearSong = () => {
    generationRef.current++;
    setCurrentSong(null);
    setLyrics([]);
    setTranslations(new Map());
    setTranslating(new Set());
    setError(null);
    setTranslationFailCount(0);
    setTranslationError(null);
    clearCompare();
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
    translationFailCount,
    translationError,
    compareTranslations,
    comparingIds,
    compareError,
    selectSong,
    clearSong,
    clearCompare,
    refetchTranslations,
    fetchCompareTranslations,
  };
}
