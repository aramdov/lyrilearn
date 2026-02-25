# Phase 2 — Frontend Core Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the React SPA that lets users search for songs, view lyrics with side-by-side translations, watch YouTube video, and toggle translation providers.

**Architecture:** State-driven SPA (no router). App.tsx conditionally renders SearchView or SongView. Persistent search bar in header. All state via useState + prop drilling. API client wraps backend endpoints with shared types.

**Tech Stack:** Vite + React + TypeScript, Tailwind CSS v4, shadcn/ui, YouTube IFrame API, Bun workspace with `@lyrilearn/shared`

**Design doc:** `docs/plans/2026-02-25-phase2-frontend-design.md`

---

## Task 1: Scaffold Vite + React app

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/src/index.css`

**Step 1: Create the app with Vite**

```bash
cd apps && bunx create-vite web --template react-ts
cd web && bun install
```

**Step 2: Add workspace dependency on shared types**

In `apps/web/package.json`, add to dependencies:
```json
"@lyrilearn/shared": "workspace:*"
```

Then from project root:
```bash
bun install
```

**Step 3: Configure Vite proxy + Tailwind**

Install Tailwind CSS v4:
```bash
cd apps/web && bun add -d @tailwindcss/vite
```

Update `apps/web/vite.config.ts`:
```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
```

Replace `apps/web/src/index.css` with:
```css
@import "tailwindcss";
```

**Step 4: Verify it runs**

```bash
cd apps/web && bun run dev
```

Open `http://localhost:5173` — should see the default Vite React page with Tailwind available.

**Step 5: Commit**

```bash
git add apps/web/
git commit -m "feat: scaffold Vite + React + Tailwind app in apps/web"
```

---

## Task 2: Install shadcn/ui

**Files:**
- Modify: `apps/web/package.json` (new deps)
- Create: `apps/web/components.json` (shadcn config)
- Create: `apps/web/src/lib/utils.ts` (cn utility)
- Create: `apps/web/src/components/ui/` (shadcn components)

**Step 1: Initialize shadcn/ui**

```bash
cd apps/web && bunx shadcn@latest init
```

Follow prompts: TypeScript, default style, default color, CSS variables yes, `src/components/ui` as component dir.

**Step 2: Add required components**

```bash
cd apps/web
bunx shadcn@latest add button
bunx shadcn@latest add input
bunx shadcn@latest add select
bunx shadcn@latest add toggle-group
```

**Step 3: Verify build**

```bash
cd apps/web && bun run build
```

Should complete with no errors.

**Step 4: Commit**

```bash
git add apps/web/
git commit -m "feat: add shadcn/ui with button, input, select, toggle-group"
```

---

## Task 3: API client

**Files:**
- Create: `apps/web/src/lib/api.ts`

**Step 1: Write the API client**

This is a typed wrapper over fetch. Each function maps to one backend endpoint, unwraps the `{ data: T }` envelope, and throws on errors.

```typescript
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

export interface SearchResponse {
  song: Song;
  lyrics: LyricLine[];
  videoId?: string;
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

// ─── Config ─────────────────────────────────────────────────

export interface ProviderStatus {
  local: boolean;
  cloud: boolean;
  models: Record<string, boolean>;
}

export function getConfig(): Promise<ProviderStatus> {
  return request("/config");
}
```

**Step 2: Verify TypeScript compiles**

```bash
cd apps/web && bunx tsc --noEmit
```

**Step 3: Commit**

```bash
git add apps/web/src/lib/api.ts
git commit -m "feat: add typed API client for backend endpoints"
```

---

## Task 4: App shell — Header + SearchBar + view switching

**Files:**
- Create: `apps/web/src/components/Header.tsx`
- Create: `apps/web/src/components/SearchBar.tsx`
- Modify: `apps/web/src/App.tsx`

**Step 1: Create SearchBar component**

```typescript
// apps/web/src/components/SearchBar.tsx
import { useState } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";

interface SearchBarProps {
  onSearch: (query: string) => void;
  isLoading: boolean;
}

export function SearchBar({ onSearch, isLoading }: SearchBarProps) {
  const [query, setQuery] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed) onSearch(trimmed);
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 w-full max-w-xl">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search for a song..."
        disabled={isLoading}
        className="flex-1"
      />
      <Button type="submit" disabled={isLoading || !query.trim()}>
        {isLoading ? "Searching..." : "Search"}
      </Button>
    </form>
  );
}
```

**Step 2: Create Header component**

```typescript
// apps/web/src/components/Header.tsx
import { SearchBar } from "./SearchBar";

interface HeaderProps {
  onSearch: (query: string) => void;
  isSearching: boolean;
}

export function Header({ onSearch, isSearching }: HeaderProps) {
  return (
    <header className="border-b bg-background sticky top-0 z-10">
      <div className="container mx-auto px-4 py-3 flex items-center gap-4">
        <h1 className="text-xl font-bold shrink-0">LyriLearn</h1>
        <SearchBar onSearch={onSearch} isLoading={isSearching} />
      </div>
    </header>
  );
}
```

**Step 3: Wire up App.tsx with view switching state**

```typescript
// apps/web/src/App.tsx
import { useState, useEffect } from "react";
import { Header } from "./components/Header";
import type { Song, LyricLine, Provider, LocalModel } from "@lyrilearn/shared";
import * as api from "./lib/api";
import type { ProviderStatus, SearchResponse, LyricsTranslation } from "./lib/api";

type ViewMode = "side-by-side" | "interleaved";

interface Settings {
  sourceLang: string;
  targetLang: string;
  provider: Provider;
  localModel: LocalModel;
  viewMode: ViewMode;
}

const DEFAULT_SETTINGS: Settings = {
  sourceLang: "ru",
  targetLang: "en",
  provider: "local",
  localModel: "translategemma-12b-4bit",
  viewMode: "side-by-side",
};

export default function App() {
  // ─── State ───────────────────────────────────────────────
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [translations, setTranslations] = useState<Map<number, LyricsTranslation>>(new Map());
  const [config, setConfig] = useState<ProviderStatus | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState({
    search: false,
    lyrics: false,
    translating: new Set<number>(),
  });
  const [error, setError] = useState<string | null>(null);

  // ─── Load provider config on mount ───────────────────────
  useEffect(() => {
    api.getConfig().then(setConfig).catch(() => {});
  }, []);

  // ─── Search handler ──────────────────────────────────────
  const handleSearch = async (query: string) => {
    setError(null);
    setLoading((prev) => ({ ...prev, search: true }));
    setCurrentSong(null);
    setSearchResults(null);

    try {
      const result = await api.search(query, settings.sourceLang);
      setSearchResults(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading((prev) => ({ ...prev, search: false }));
    }
  };

  // ─── Song selection handler ──────────────────────────────
  const handleSelectSong = async (song: Song, songLyrics: LyricLine[], videoId?: string) => {
    setSearchResults(null);
    setCurrentSong(song);
    setLyrics(songLyrics);
    setTranslations(new Map());
    setError(null);

    // Fetch lyrics with cached translations
    setLoading((prev) => ({ ...prev, lyrics: true }));
    try {
      const data = await api.getLyrics(
        song.id,
        settings.targetLang,
        settings.provider,
        settings.provider === "local" ? settings.localModel : undefined
      );
      setLyrics(data.lyrics);
      const transMap = new Map<number, LyricsTranslation>();
      for (const t of data.translations) {
        if (t.translatedText) transMap.set(t.lyricsId, t);
      }
      setTranslations(transMap);

      // Translate lines that don't have cached translations
      const untranslated = data.lyrics.filter((l) => !transMap.has(l.id) && l.text.trim());
      if (untranslated.length > 0) {
        translateLines(untranslated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load lyrics");
    } finally {
      setLoading((prev) => ({ ...prev, lyrics: false }));
    }
  };

  // ─── Batch translate with concurrency cap ────────────────
  const translateLines = async (lines: LyricLine[]) => {
    const CONCURRENCY = 5;
    const queue = [...lines];

    const worker = async () => {
      while (queue.length > 0) {
        const line = queue.shift()!;
        setLoading((prev) => {
          const next = new Set(prev.translating);
          next.add(line.id);
          return { ...prev, translating: next };
        });

        try {
          const result = await api.translate(
            line.text,
            settings.sourceLang,
            settings.targetLang,
            settings.provider,
            line.id,
            settings.provider === "local" ? settings.localModel : undefined
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
          setLoading((prev) => {
            const next = new Set(prev.translating);
            next.delete(line.id);
            return { ...prev, translating: next };
          });
        }
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  };

  // ─── Render ──────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header onSearch={handleSearch} isSearching={loading.search} />
      <main className="container mx-auto px-4 py-6">
        {error && (
          <div className="text-destructive text-sm mb-4">{error}</div>
        )}

        {/* SearchView: shown when we have results but no selected song */}
        {searchResults && !currentSong && (
          <div>Search results will render here (Task 5)</div>
        )}

        {/* SongView: shown when a song is selected */}
        {currentSong && (
          <div>Song view will render here (Task 6-8)</div>
        )}

        {/* Landing state */}
        {!searchResults && !currentSong && !loading.search && (
          <div className="text-center text-muted-foreground mt-20">
            <p className="text-lg">Search for a song to get started</p>
          </div>
        )}
      </main>
    </div>
  );
}
```

**Step 4: Verify the app runs and search bar works**

```bash
cd apps/web && bun run dev
```

Open `http://localhost:5173`. You should see the header with "LyriLearn" and a search bar. Searching with the backend running should set state (visible in React DevTools if desired). The placeholders for search results and song view will be replaced in subsequent tasks.

**Step 5: Commit**

```bash
git add apps/web/src/
git commit -m "feat: add app shell with Header, SearchBar, and view switching"
```

---

## Task 5: SearchResultCard + SearchView

**Files:**
- Create: `apps/web/src/components/SearchResultCard.tsx`

**Step 1: Create SearchResultCard**

Displays the search result. When the backend returns a single result (current behavior), this shows that song with a "View Lyrics" action. Clicking transitions to SongView.

```typescript
// apps/web/src/components/SearchResultCard.tsx
import type { Song, LyricLine } from "@lyrilearn/shared";
import { Button } from "./ui/button";

interface SearchResultCardProps {
  song: Song;
  lyrics: LyricLine[];
  videoId?: string;
  onSelect: (song: Song, lyrics: LyricLine[], videoId?: string) => void;
}

export function SearchResultCard({
  song,
  lyrics,
  videoId,
  onSelect,
}: SearchResultCardProps) {
  return (
    <div className="flex items-center gap-4 p-4 border rounded-lg hover:bg-accent/50 transition-colors">
      {song.artworkUrl ? (
        <img
          src={song.artworkUrl}
          alt={`${song.title} artwork`}
          className="w-16 h-16 rounded object-cover"
        />
      ) : (
        <div className="w-16 h-16 rounded bg-muted flex items-center justify-center text-muted-foreground text-xs">
          No art
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{song.title}</p>
        <p className="text-sm text-muted-foreground truncate">{song.artist}</p>
        <p className="text-xs text-muted-foreground">
          {lyrics.length} lines{videoId ? " · Video available" : ""}
        </p>
      </div>
      <Button onClick={() => onSelect(song, lyrics, videoId)} variant="outline">
        View Lyrics
      </Button>
    </div>
  );
}
```

**Step 2: Wire into App.tsx**

Replace the search results placeholder in App.tsx:

```tsx
{/* SearchView: shown when we have results but no selected song */}
{searchResults && !currentSong && (
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
```

Import `SearchResultCard` at the top of App.tsx.

**Step 3: Test manually**

Start backend (`cd apps/server && bun run dev`) and frontend (`cd apps/web && bun run dev`). Search for a song — you should see the card with song info and "View Lyrics" button.

**Step 4: Commit**

```bash
git add apps/web/src/
git commit -m "feat: add SearchResultCard for search results display"
```

---

## Task 6: YouTubePlayer component

**Files:**
- Create: `apps/web/src/components/YouTubePlayer.tsx`

**Step 1: Create YouTubePlayer**

Wraps the YouTube IFrame API. Loads the API script once, creates a player instance. No programmatic controls yet (Phase 3).

```typescript
// apps/web/src/components/YouTubePlayer.tsx
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

interface YouTubePlayerProps {
  videoId: string | undefined;
}

let apiLoaded = false;
let apiReady = false;
const readyCallbacks: (() => void)[] = [];

function loadYouTubeAPI(): Promise<void> {
  if (apiReady) return Promise.resolve();
  return new Promise((resolve) => {
    readyCallbacks.push(resolve);
    if (!apiLoaded) {
      apiLoaded = true;
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
      window.onYouTubeIframeAPIReady = () => {
        apiReady = true;
        readyCallbacks.forEach((cb) => cb());
        readyCallbacks.length = 0;
      };
    }
  });
}

export function YouTubePlayer({ videoId }: YouTubePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);

  useEffect(() => {
    if (!videoId) return;

    let cancelled = false;

    loadYouTubeAPI().then(() => {
      if (cancelled || !containerRef.current) return;

      // Destroy existing player
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }

      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId,
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: 0,
          modestbranding: 1,
          rel: 0,
        },
      });
    });

    return () => {
      cancelled = true;
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [videoId]);

  if (!videoId) {
    return (
      <div className="w-full aspect-video bg-muted rounded-lg flex items-center justify-center text-muted-foreground">
        No video available
      </div>
    );
  }

  return (
    <div className="w-full aspect-video rounded-lg overflow-hidden">
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/components/YouTubePlayer.tsx
git commit -m "feat: add YouTubePlayer component wrapping IFrame API"
```

---

## Task 7: LyricsToolbar — LanguageSelector + ProviderToggle + ViewToggle

**Files:**
- Create: `apps/web/src/components/LyricsToolbar.tsx`

**Step 1: Create LyricsToolbar**

Contains three controls: language dropdowns, provider segmented toggle, and view mode toggle.

```typescript
// apps/web/src/components/LyricsToolbar.tsx
import type { Provider, LocalModel } from "@lyrilearn/shared";
import type { ProviderStatus } from "../lib/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

type ViewMode = "side-by-side" | "interleaved";

interface LyricsToolbarProps {
  sourceLang: string;
  targetLang: string;
  provider: Provider;
  localModel: LocalModel;
  viewMode: ViewMode;
  config: ProviderStatus | null;
  onSourceLangChange: (lang: string) => void;
  onTargetLangChange: (lang: string) => void;
  onProviderChange: (provider: Provider, localModel?: LocalModel) => void;
  onViewModeChange: (mode: ViewMode) => void;
}

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "ru", label: "Russian" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "zh", label: "Chinese" },
  { value: "ar", label: "Arabic" },
  { value: "pt", label: "Portuguese" },
  { value: "it", label: "Italian" },
  { value: "hy", label: "Armenian" },
];

export function LyricsToolbar({
  sourceLang,
  targetLang,
  provider,
  localModel,
  viewMode,
  config,
  onSourceLangChange,
  onTargetLangChange,
  onProviderChange,
  onViewModeChange,
}: LyricsToolbarProps) {
  // Combine provider + model into a single toggle value
  const providerValue =
    provider === "cloud" ? "cloud" : `local-${localModel}`;

  const handleProviderToggle = (value: string) => {
    if (!value) return; // toggling off, ignore
    if (value === "cloud") {
      onProviderChange("cloud");
    } else if (value === "local-translategemma-12b-4bit") {
      onProviderChange("local", "translategemma-12b-4bit");
    } else if (value === "local-translategemma-4b-4bit") {
      onProviderChange("local", "translategemma-4b-4bit");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-4 py-3 border-b">
      {/* Language selectors */}
      <div className="flex items-center gap-2">
        <Select value={sourceLang} onValueChange={onSourceLangChange}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGES.map((l) => (
              <SelectItem key={l.value} value={l.value}>
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground">→</span>
        <Select value={targetLang} onValueChange={onTargetLangChange}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Target" />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGES.map((l) => (
              <SelectItem key={l.value} value={l.value}>
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Provider toggle */}
      <ToggleGroup
        type="single"
        value={providerValue}
        onValueChange={handleProviderToggle}
        className="border rounded-md"
      >
        <ToggleGroupItem
          value="local-translategemma-12b-4bit"
          disabled={config ? !config.models["translategemma-12b-4bit"] : false}
          className="text-xs px-3"
        >
          Local 12B
        </ToggleGroupItem>
        <ToggleGroupItem
          value="local-translategemma-4b-4bit"
          disabled={config ? !config.models["translategemma-4b-4bit"] : false}
          className="text-xs px-3"
        >
          Local 4B
        </ToggleGroupItem>
        <ToggleGroupItem
          value="cloud"
          disabled={config ? !config.cloud : false}
          className="text-xs px-3"
        >
          Google
        </ToggleGroupItem>
      </ToggleGroup>

      {/* View mode toggle */}
      <ToggleGroup
        type="single"
        value={viewMode}
        onValueChange={(v) => v && onViewModeChange(v as ViewMode)}
        className="border rounded-md ml-auto"
      >
        <ToggleGroupItem value="side-by-side" className="text-xs px-3">
          Side by Side
        </ToggleGroupItem>
        <ToggleGroupItem value="interleaved" className="text-xs px-3">
          Interleaved
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/components/LyricsToolbar.tsx
git commit -m "feat: add LyricsToolbar with language, provider, and view toggles"
```

---

## Task 8: LyricsDisplay — SideBySideView + InterleavedView

**Files:**
- Create: `apps/web/src/components/LyricsDisplay.tsx`

**Step 1: Create LyricsDisplay with both view modes**

```typescript
// apps/web/src/components/LyricsDisplay.tsx
import type { LyricLine } from "@lyrilearn/shared";
import type { LyricsTranslation } from "../lib/api";

type ViewMode = "side-by-side" | "interleaved";

interface LyricsDisplayProps {
  lyrics: LyricLine[];
  translations: Map<number, LyricsTranslation>;
  viewMode: ViewMode;
  translatingIds: Set<number>;
}

export function LyricsDisplay({
  lyrics,
  translations,
  viewMode,
  translatingIds,
}: LyricsDisplayProps) {
  if (lyrics.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-10">
        No lyrics available for this song
      </div>
    );
  }

  if (viewMode === "side-by-side") {
    return <SideBySideView lyrics={lyrics} translations={translations} translatingIds={translatingIds} />;
  }
  return <InterleavedView lyrics={lyrics} translations={translations} translatingIds={translatingIds} />;
}

// ─── Side by Side ───────────────────────────────────────────

function SideBySideView({
  lyrics,
  translations,
  translatingIds,
}: Omit<LyricsDisplayProps, "viewMode">) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-1 py-4">
      {lyrics.map((line) => {
        const translation = translations.get(line.id);
        const isTranslating = translatingIds.has(line.id);

        return (
          <div key={line.id} className="contents">
            {/* Original */}
            <div className="py-1.5 border-b border-border/50">
              <span className="text-sm">{line.text || "\u00A0"}</span>
            </div>
            {/* Translation */}
            <div className="py-1.5 border-b border-border/50">
              {isTranslating ? (
                <span className="text-sm text-muted-foreground animate-pulse">
                  Translating...
                </span>
              ) : translation ? (
                <span className="text-sm text-muted-foreground">
                  {translation.translatedText}
                </span>
              ) : line.text.trim() ? (
                <span className="text-sm text-muted-foreground/50">
                  Translation unavailable
                </span>
              ) : (
                <span>{"\u00A0"}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Interleaved ────────────────────────────────────────────

function InterleavedView({
  lyrics,
  translations,
  translatingIds,
}: Omit<LyricsDisplayProps, "viewMode">) {
  return (
    <div className="space-y-3 py-4">
      {lyrics.map((line) => {
        const translation = translations.get(line.id);
        const isTranslating = translatingIds.has(line.id);

        return (
          <div key={line.id}>
            <p className="text-sm">{line.text || "\u00A0"}</p>
            {line.text.trim() && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {isTranslating
                  ? "Translating..."
                  : translation
                    ? translation.translatedText
                    : "Translation unavailable"}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/components/LyricsDisplay.tsx
git commit -m "feat: add LyricsDisplay with side-by-side and interleaved views"
```

---

## Task 9: Assemble SongView and wire everything together

**Files:**
- Modify: `apps/web/src/App.tsx`

**Step 1: Wire SongView into App.tsx**

Replace the song view placeholder in App.tsx with the full composition:

```tsx
{/* SongView: shown when a song is selected */}
{currentSong && (
  <div className="space-y-4">
    {/* Song header */}
    <div className="flex items-center gap-3">
      {currentSong.artworkUrl && (
        <img
          src={currentSong.artworkUrl}
          alt=""
          className="w-12 h-12 rounded"
        />
      )}
      <div>
        <h2 className="font-bold text-lg">{currentSong.title}</h2>
        <p className="text-sm text-muted-foreground">{currentSong.artist}</p>
      </div>
    </div>

    {/* YouTube player */}
    <YouTubePlayer videoId={currentSong.youtubeId} />

    {/* Toolbar */}
    <LyricsToolbar
      sourceLang={settings.sourceLang}
      targetLang={settings.targetLang}
      provider={settings.provider}
      localModel={settings.localModel}
      viewMode={settings.viewMode}
      config={config}
      onSourceLangChange={(lang) =>
        setSettings((s) => ({ ...s, sourceLang: lang }))
      }
      onTargetLangChange={handleTargetLangChange}
      onProviderChange={handleProviderChange}
      onViewModeChange={(mode) =>
        setSettings((s) => ({ ...s, viewMode: mode }))
      }
    />

    {/* Lyrics */}
    {loading.lyrics ? (
      <div className="text-center text-muted-foreground py-10">
        Loading lyrics...
      </div>
    ) : (
      <LyricsDisplay
        lyrics={lyrics}
        translations={translations}
        viewMode={settings.viewMode}
        translatingIds={loading.translating}
      />
    )}
  </div>
)}
```

**Step 2: Add provider/lang change handlers to App.tsx**

These handlers clear translations and re-fetch when provider or target language changes:

```typescript
// Add these functions inside the App component, after translateLines

const handleProviderChange = async (
  provider: Provider,
  localModel?: LocalModel
) => {
  const newSettings = {
    ...settings,
    provider,
    localModel: localModel || settings.localModel,
  };
  setSettings(newSettings);

  if (currentSong) {
    setTranslations(new Map());
    setLoading((prev) => ({ ...prev, lyrics: true }));
    try {
      const data = await api.getLyrics(
        currentSong.id,
        newSettings.targetLang,
        newSettings.provider,
        newSettings.provider === "local" ? newSettings.localModel : undefined
      );
      const transMap = new Map<number, LyricsTranslation>();
      for (const t of data.translations) {
        if (t.translatedText) transMap.set(t.lyricsId, t);
      }
      setTranslations(transMap);

      const untranslated = data.lyrics.filter(
        (l) => !transMap.has(l.id) && l.text.trim()
      );
      if (untranslated.length > 0) {
        // Use newSettings since state may not be updated yet
        translateLinesWithSettings(untranslated, newSettings);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reload translations");
    } finally {
      setLoading((prev) => ({ ...prev, lyrics: false }));
    }
  }
};

const handleTargetLangChange = async (lang: string) => {
  const newSettings = { ...settings, targetLang: lang };
  setSettings(newSettings);

  if (currentSong) {
    setTranslations(new Map());
    setLoading((prev) => ({ ...prev, lyrics: true }));
    try {
      const data = await api.getLyrics(
        currentSong.id,
        lang,
        newSettings.provider,
        newSettings.provider === "local" ? newSettings.localModel : undefined
      );
      const transMap = new Map<number, LyricsTranslation>();
      for (const t of data.translations) {
        if (t.translatedText) transMap.set(t.lyricsId, t);
      }
      setTranslations(transMap);

      const untranslated = data.lyrics.filter(
        (l) => !transMap.has(l.id) && l.text.trim()
      );
      if (untranslated.length > 0) {
        translateLinesWithSettings(untranslated, newSettings);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reload translations");
    } finally {
      setLoading((prev) => ({ ...prev, lyrics: false }));
    }
  }
};
```

**Note:** You'll need a `translateLinesWithSettings` variant that accepts a settings object instead of reading from state (since React state updates are async). This is the same as `translateLines` but takes `settings` as a parameter:

```typescript
const translateLinesWithSettings = async (
  lines: LyricLine[],
  s: Settings
) => {
  const CONCURRENCY = 5;
  const queue = [...lines];

  const worker = async () => {
    while (queue.length > 0) {
      const line = queue.shift()!;
      setLoading((prev) => {
        const next = new Set(prev.translating);
        next.add(line.id);
        return { ...prev, translating: next };
      });

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
        // Leave empty
      } finally {
        setLoading((prev) => {
          const next = new Set(prev.translating);
          next.delete(line.id);
          return { ...prev, translating: next };
        });
      }
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
};
```

Also update the original `translateLines` to call `translateLinesWithSettings(lines, settings)`.

**Step 3: Add all missing imports at the top of App.tsx**

```typescript
import { YouTubePlayer } from "./components/YouTubePlayer";
import { LyricsToolbar } from "./components/LyricsToolbar";
import { LyricsDisplay } from "./components/LyricsDisplay";
import { SearchResultCard } from "./components/SearchResultCard";
```

**Step 4: Full integration test**

1. Start backend: `cd apps/server && bun run dev`
2. Start frontend: `cd apps/web && bun run dev`
3. Open `http://localhost:5173`
4. Search for a song (e.g., "Кино Группа крови")
5. Click "View Lyrics" — should see YouTube player, toolbar, and lyrics
6. Toggle between side-by-side and interleaved views
7. Change target language — translations should re-fetch
8. Change provider — translations should re-fetch
9. Search for another song while viewing one — should clear and show new results

**Step 5: Commit**

```bash
git add apps/web/src/
git commit -m "feat: assemble SongView with YouTube player, toolbar, and lyrics display"
```

---

## Task 10: Clean up App.tsx — extract hooks

**Files:**
- Create: `apps/web/src/hooks/useSongView.ts`
- Modify: `apps/web/src/App.tsx`

App.tsx from Task 9 has a lot of handler logic. Extract the song/translation state and handlers into a custom hook to keep App.tsx clean.

**Step 1: Extract useSongView hook**

Move these from App.tsx into `useSongView.ts`:
- `currentSong`, `lyrics`, `translations`, `loading.lyrics`, `loading.translating` state
- `handleSelectSong`, `handleProviderChange`, `handleTargetLangChange`, `translateLines`, `translateLinesWithSettings`

The hook takes `settings` as a parameter and returns the state + handlers.

```typescript
// apps/web/src/hooks/useSongView.ts
import { useState } from "react";
import type { Song, LyricLine, Provider, LocalModel } from "@lyrilearn/shared";
import * as api from "../lib/api";
import type { LyricsTranslation } from "../lib/api";

type ViewMode = "side-by-side" | "interleaved";

interface Settings {
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

  const translateLinesWithSettings = async (lines: LyricLine[], s: Settings) => {
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
          // Leave empty
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
        translateLinesWithSettings(untranslated, s);
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
```

**Step 2: Simplify App.tsx to use the hook**

App.tsx becomes much cleaner — state management is in the hook, App.tsx just wires components together.

**Step 3: Verify everything still works**

Same manual test as Task 9.

**Step 4: Commit**

```bash
git add apps/web/src/
git commit -m "refactor: extract useSongView hook from App.tsx"
```

---

## Task 11: Update README with Phase 2 status

**Files:**
- Modify: `README.md`

**Step 1: Update the development phases table**

Mark Phase 2 as Complete, Phase 3 as Up Next.

**Step 2: Add any new commands** (e.g., `bun run dev:web`)

**Step 3: Commit**

```bash
git add README.md
git commit -m "docs: update README with Phase 2 complete"
```
