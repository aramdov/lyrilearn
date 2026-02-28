import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { SearchResultCard } from "@/components/SearchResultCard";
import { YouTubePlayer } from "@/components/YouTubePlayer";
import { LyricsToolbar } from "@/components/LyricsToolbar";
import { LyricsDisplay } from "@/components/LyricsDisplay";
import * as api from "@/lib/api";
import type { ProviderStatus, SearchResponse } from "@/lib/api";
import type { Song, LyricLine, Provider, LocalModel } from "@lyrilearn/shared";
import { useSongView } from "@/hooks/useSongView";
import type { Settings, ViewMode } from "@/hooks/useSongView";

const DEFAULT_SETTINGS: Settings = {
  sourceLang: "ru",
  targetLang: "en",
  provider: "local",
  localModel: "translategemma-12b-4bit",
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

  // ─── Song view hook ──────────────────────────────────────
  const songView = useSongView(settings);

  // ─── Load provider config on mount ───────────────────────
  useEffect(() => {
    api.getConfig().then(setConfig).catch(() => {});
  }, []);

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
  const handleSelectSong = async (song: Song, lyrics: LyricLine[], _videoId?: string) => {
    setSearchResults(null);
    setSearchError(null);
    await songView.selectSong(song, lyrics);
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

  // ─── Render ──────────────────────────────────────────────
  const error = searchError || songView.error;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header onSearch={handleSearch} isSearching={searchLoading} />
      <main className="container mx-auto px-4 py-6">
        {error && (
          <div className="text-destructive text-sm mb-4">{error}</div>
        )}

        {/* SearchView: shown when we have results but no selected song */}
        {searchResults && !songView.currentSong && (
          <div className="max-w-2xl mx-auto space-y-3">
            <h2 className="text-lg font-medium mb-2">Search Results</h2>
            <SearchResultCard
              song={searchResults.song}
              lyrics={searchResults.lyrics}
              videoId={searchResults.videoId}
              onSelect={handleSelectSong}
            />
          </div>
        )}

        {/* SongView: shown when a song is selected */}
        {songView.currentSong && (
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
              </div>
            </div>

            {/* YouTube player */}
            <YouTubePlayer videoId={songView.currentSong.youtubeId} />

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
            />

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
              />
            )}
          </div>
        )}

        {/* Landing state */}
        {!searchResults && !songView.currentSong && !searchLoading && (
          <div className="text-center text-muted-foreground mt-20">
            <p className="text-lg">Search for a song to get started</p>
          </div>
        )}
      </main>
    </div>
  );
}
