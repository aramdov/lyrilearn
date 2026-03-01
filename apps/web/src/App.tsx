import { useState, useEffect, useRef } from "react";
import { Header } from "@/components/Header";
import { SearchResultCard } from "@/components/SearchResultCard";
import { YouTubePlayer } from "@/components/YouTubePlayer";
import { LyricsToolbar } from "@/components/LyricsToolbar";
import { LyricsDisplay } from "@/components/LyricsDisplay";
import { FlashcardDeck } from "@/components/FlashcardDeck";
import * as api from "@/lib/api";
import type { ProviderStatus, SearchResponse, LyricsSource } from "@/lib/api";
import type { Song, LyricLine, Provider, LocalModel, FlashcardEntry } from "@lyrilearn/shared";
import { useSongView } from "@/hooks/useSongView";
import type { Settings, ViewMode } from "@/hooks/useSongView";
import { useKaraokeSync } from "@/hooks/useKaraokeSync";
import type { YouTubePlayerHandle } from "@/components/YouTubePlayer";
import { transliterate } from "@/lib/transliterate";
import { saveCard, makeCardId, getCardCount, getSavedCardIds } from "@/lib/db";

const DEFAULT_SETTINGS: Settings = {
  sourceLang: "ru",
  targetLang: "en",
  provider: "local",
  localModel: "translategemma-4b-4bit",
  viewMode: "side-by-side",
  showTransliteration: false,
};

export default function App() {
  // ─── Global state ────────────────────────────────────────
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null);
  const [config, setConfig] = useState<ProviderStatus | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [lyricsSource, setLyricsSource] = useState<LyricsSource | null>(null);

  // ─── Flashcard state ───────────────────────────────────
  const [appView, setAppView] = useState<"main" | "flashcards">("main");
  const [flashcardMode, setFlashcardMode] = useState(false);
  const [flashcardCount, setFlashcardCount] = useState(0);
  const [savedCardIds, setSavedCardIds] = useState<Set<string>>(new Set());
  const [savedToast, setSavedToast] = useState<string | null>(null);

  // ─── Refs ───────────────────────────────────────────────
  const playerRef = useRef<YouTubePlayerHandle>(null);

  // ─── Song view hook ──────────────────────────────────────
  const songView = useSongView(settings);

  // ─── Karaoke sync ──────────────────────────────────────
  const karaoke = useKaraokeSync(
    playerRef,
    songView.lyrics,
    settings.viewMode === "karaoke"
  );

  // ─── Load provider config + flashcard count on mount ─────
  useEffect(() => {
    api.getConfig().then(setConfig).catch(() => {});
    getCardCount().then(setFlashcardCount).catch(() => {});
  }, []);

  // ─── Load saved card IDs when song changes ─────────────
  useEffect(() => {
    if (songView.currentSong) {
      getSavedCardIds(songView.currentSong.id).then(setSavedCardIds);
    } else {
      setSavedCardIds(new Set());
    }
  }, [songView.currentSong]);

  // ─── Search handler ──────────────────────────────────────
  const handleSearch = async (query: string) => {
    setSearchError(null);
    setSearchLoading(true);
    songView.clearSong();
    setSearchResults(null);

    try {
      const result = await api.search(query, settings.sourceLang);
      setSearchResults(result);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearchLoading(false);
    }
  };

  // ─── Song selection ──────────────────────────────────────
  const handleSelectSong = async (song: Song, lyrics: LyricLine[], videoId?: string) => {
    setLyricsSource(searchResults?.lyricsSource ?? null);
    setSearchResults(null);
    setSearchError(null);
    const songWithVideo = videoId ? { ...song, youtubeId: videoId } : song;
    await songView.selectSong(songWithVideo, lyrics);
  };

  // ─── Provider change ────────────────────────────────────
  const handleProviderChange = (provider: Provider, localModel?: LocalModel) => {
    const newSettings: Settings = {
      ...settings,
      provider,
      localModel: localModel || settings.localModel,
    };
    setSettings(newSettings);
    songView.refetchTranslations(newSettings);
  };

  // ─── Target language change ──────────────────────────────
  const handleTargetLangChange = (lang: string) => {
    const newSettings: Settings = { ...settings, targetLang: lang };
    setSettings(newSettings);
    songView.refetchTranslations(newSettings);
  };

  // ─── Save word flashcard ────────────────────────────────
  const handleSaveWord = async (
    lineId: number,
    word: string,
    _startIdx: number,
    _endIdx: number
  ) => {
    if (!songView.currentSong) return;
    const song = songView.currentSong;
    const translation = songView.translations.get(lineId);
    const line = songView.lyrics.find((l) => l.id === lineId);

    const card: FlashcardEntry = {
      id: makeCardId(song.id, settings.sourceLang, "word", word),
      songId: song.id,
      songTitle: song.title,
      artist: song.artist,
      type: "word",
      source: word,
      target: "",
      sourceLang: settings.sourceLang,
      targetLang: settings.targetLang,
      provider: settings.provider,
      context: line?.text,
      createdAt: Date.now(),
      reviewCount: 0,
    };

    // Try single-word translation
    try {
      const result = await api.translate(
        word,
        settings.sourceLang,
        settings.targetLang,
        settings.provider,
        undefined,
        settings.provider === "local" ? settings.localModel : undefined
      );
      card.target = result.translatedText;
    } catch {
      card.target = translation?.translatedText || "";
    }

    await saveCard(card);
    setSavedCardIds((prev) => new Set(prev).add(card.id));
    setFlashcardCount((c) => c + 1);
    setSavedToast(`Saved "${word}"`);
    setTimeout(() => setSavedToast(null), 2000);
  };

  // ─── Save line flashcard ───────────────────────────────
  const handleSaveLine = async (lineId: number) => {
    if (!songView.currentSong) return;
    const song = songView.currentSong;
    const line = songView.lyrics.find((l) => l.id === lineId);
    const translation = songView.translations.get(lineId);
    if (!line) return;

    const card: FlashcardEntry = {
      id: makeCardId(song.id, settings.sourceLang, "line", line.text),
      songId: song.id,
      songTitle: song.title,
      artist: song.artist,
      type: "line",
      source: line.text,
      target: translation?.translatedText || "",
      sourceLang: settings.sourceLang,
      targetLang: settings.targetLang,
      provider: settings.provider,
      createdAt: Date.now(),
      reviewCount: 0,
    };

    await saveCard(card);
    setSavedCardIds((prev) => new Set(prev).add(card.id));
    setFlashcardCount((c) => c + 1);
    setSavedToast("Saved line");
    setTimeout(() => setSavedToast(null), 2000);
  };

  // ─── Render ──────────────────────────────────────────────
  const error = searchError || songView.error;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header
        onSearch={handleSearch}
        isSearching={searchLoading}
        onGoHome={() => {
          songView.clearSong();
          setSearchResults(null);
          setSearchError(null);
          setLyricsSource(null);
          setFlashcardMode(false);
          setAppView("main");
        }}
        onFlashcards={() => setAppView("flashcards")}
        flashcardCount={flashcardCount}
      />
      <main className="container mx-auto px-4 py-6">
        {/* Flashcard deck view */}
        {appView === "flashcards" && (
          <FlashcardDeck onBack={() => setAppView("main")} />
        )}

        {appView === "main" && error && (
          <div className="text-destructive text-sm mb-4">{error}</div>
        )}

        {/* SearchView: shown when we have results but no selected song */}
        {appView === "main" && searchResults && !songView.currentSong && (
          <div className="max-w-4xl mx-auto space-y-3">
            <SearchResultCard
              song={searchResults.song}
              lyrics={searchResults.lyrics}
              youtubeResults={searchResults.youtubeResults}
              lyricsSource={searchResults.lyricsSource}
              onSelect={handleSelectSong}
            />
          </div>
        )}

        {/* SongView: shown when a song is selected */}
        {appView === "main" && songView.currentSong && (
          <div className="space-y-4">
            {/* Song header */}
            <div className="flex items-center gap-3">
              {songView.currentSong.artworkUrl && (
                <img
                  src={songView.currentSong.artworkUrl}
                  alt=""
                  className="w-12 h-12 rounded"
                />
              )}
              <div>
                <h2 className="font-bold text-lg">{songView.currentSong.title}</h2>
                <p className="text-sm text-muted-foreground">{songView.currentSong.artist}</p>
                {lyricsSource && (
                  <p className="text-xs text-muted-foreground/60">
                    Lyrics: {lyricsSource === "lrclib-synced"
                      ? "LRCLIB (synced)"
                      : lyricsSource === "lrclib-plain"
                        ? "LRCLIB (plain)"
                        : "No lyrics available"}
                  </p>
                )}
              </div>
            </div>

            {/* YouTube player */}
            <YouTubePlayer ref={playerRef} videoId={songView.currentSong.youtubeId} />

            {/* Translation error banner */}
            {songView.translationError && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
                <p className="font-medium text-amber-600 dark:text-amber-400">
                  Translation failed for {songView.translationFailCount} line{songView.translationFailCount !== 1 ? "s" : ""}: {songView.translationError}
                </p>
                <p className="text-amber-600/70 dark:text-amber-400/70 text-xs mt-1">
                  Start the MLX server or set GOOGLE_CLOUD_API_KEY
                </p>
              </div>
            )}

            {/* Toolbar */}
            <LyricsToolbar
              sourceLang={settings.sourceLang}
              targetLang={settings.targetLang}
              provider={settings.provider}
              localModel={settings.localModel}
              viewMode={settings.viewMode}
              config={config}
              onSourceLangChange={(lang) => {
                const newSettings: Settings = { ...settings, sourceLang: lang };
                setSettings(newSettings);
                songView.refetchTranslations(newSettings);
              }}
              onTargetLangChange={handleTargetLangChange}
              onProviderChange={handleProviderChange}
              onViewModeChange={(mode: ViewMode) =>
                setSettings((s) => ({ ...s, viewMode: mode }))
              }
              hasSyncedLyrics={karaoke.hasSyncedLyrics}
              showTransliteration={settings.showTransliteration}
              onTransliterationChange={(show) =>
                setSettings((s) => ({ ...s, showTransliteration: show }))
              }
              flashcardMode={flashcardMode}
              onFlashcardModeChange={setFlashcardMode}
            />

            {/* Flashcard mode banner */}
            {flashcardMode && (
              <div className="rounded-md border border-primary/30 bg-primary/5 px-4 py-2 text-xs text-primary">
                Flashcard mode — tap words to save, tap + to save a whole line.
                <button
                  onClick={() => setFlashcardMode(false)}
                  className="ml-2 underline hover:no-underline"
                >
                  Exit
                </button>
              </div>
            )}

            {/* Lyrics */}
            {songView.lyricsLoading ? (
              <div className="text-center text-muted-foreground py-10">
                Loading lyrics...
              </div>
            ) : (
              <LyricsDisplay
                lyrics={songView.lyrics}
                translations={songView.translations}
                viewMode={settings.viewMode}
                translatingIds={songView.translating}
                activeLineId={karaoke.activeLineId}
                showTransliteration={settings.showTransliteration}
                transliterate={transliterate}
                translationError={songView.translationError}
                flashcardMode={flashcardMode}
                savedCardIds={savedCardIds}
                onSaveWord={handleSaveWord}
                onSaveLine={handleSaveLine}
              />
            )}
          </div>
        )}

        {/* Landing state */}
        {appView === "main" && !searchResults && !songView.currentSong && !searchLoading && (
          <div className="text-center text-muted-foreground mt-20">
            <p className="text-lg">Search for a song to get started</p>
          </div>
        )}
      </main>

      {/* Save toast */}
      {savedToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-md bg-foreground text-background px-4 py-2 text-sm shadow-lg">
          {savedToast}
        </div>
      )}
    </div>
  );
}
