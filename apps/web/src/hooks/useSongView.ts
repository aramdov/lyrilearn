import { useState, useRef } from "react";
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

  // Generation counter — incremented on each fetch cycle.
  // Stale translation results from a previous cycle are discarded.
  const generationRef = useRef(0);

  const translateLines = async (lines: LyricLine[], s: Settings, generation: number) => {
    const CONCURRENCY = 5;
    const queue = [...lines];

    const worker = async () => {
      while (queue.length > 0) {
        if (generationRef.current !== generation) return; // stale — abort

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

          if (generationRef.current !== generation) return; // stale — discard

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
          if (generationRef.current === generation) {
            setTranslating((prev) => {
              const next = new Set(prev);
              next.delete(line.id);
              return next;
            });
          }
        }
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  };

  const fetchTranslations = async (songId: number, s: Settings) => {
    const generation = ++generationRef.current;
    setTranslations(new Map());
    setTranslating(new Set());
    setLyricsLoading(true);
    setError(null);
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

  const clearSong = () => {
    generationRef.current++;
    setCurrentSong(null);
    setLyrics([]);
    setTranslations(new Map());
    setTranslating(new Set());
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
