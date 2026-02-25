# Phase 2 — Frontend Core Design

**Date:** 2026-02-25
**Status:** Approved

---

## Overview

React SPA for LyriLearn — search for songs, view lyrics with side-by-side translations, watch the YouTube video, and toggle between translation providers.

## Architecture

**State-driven views (no router library).** App.tsx conditionally renders SearchView or SongView based on component state. Persistent search bar in the header drives view switching. No React Router — only two views needed for Phase 2. Adding a router is a trivial refactor for Phase 4 when flashcard pages arrive.

**Trade-off:** No shareable song URLs. Acceptable for now.

## Tooling

- Vite + React + TypeScript (react-ts template)
- Tailwind CSS v4 via `@tailwindcss/vite` plugin
- shadcn/ui for form components (Button, Input, Select, ToggleGroup)
- Vite dev server proxies `/api` → `http://localhost:3001`
- `@lyrilearn/shared` workspace dependency for shared types

## Component Tree

```
App
├── Header
│   └── SearchBar (persistent, always visible)
├── SearchView (when no song selected)
│   └── SearchResultsList
│       └── SearchResultCard (artwork, title, artist)
└── SongView (when song selected)
    ├── YouTubePlayer (top, full-width)
    ├── LyricsToolbar
    │   ├── LanguageSelector (source + target dropdowns)
    │   ├── ProviderToggle (segmented: Local 12B / Local 4B / Google)
    │   └── ViewToggle (side-by-side / interleaved)
    └── LyricsDisplay
        ├── SideBySideView (two columns)
        └── InterleavedView (stacked lines)
```

## API Client (`lib/api.ts`)

Thin typed wrapper over `fetch`, one function per backend endpoint:

- `search(query, sourceLang)` → `POST /api/search`
- `getLyrics(songId, targetLang, provider, localModel?)` → `GET /api/lyrics/:songId`
- `translate(text, sourceLang, targetLang, provider, lyricsId?, localModel?)` → `POST /api/translate`
- `getConfig()` → `GET /api/config`

All functions unwrap the `{ data: T }` envelope and throw on non-OK responses. No retry logic or client-side caching — the backend handles caching.

## Data Flow

1. **Search:** SearchBar → `api.search()` → results in SearchResultsList
2. **Song select:** Click result → `api.getLyrics()` → populates SongView
3. **Provider/lang change:** Clears translations → `api.getLyrics()` for cached → `api.translate()` for missing lines
4. **Config:** On mount, `api.getConfig()` to determine provider availability (disable unavailable toggles)

## State Management

All state in App.tsx via `useState`. No context providers — tree is shallow enough to prop-drill.

```
App state:
  - currentSong: Song | null
  - lyrics: LyricLine[]
  - translations: Map<number, TranslationResult>  (keyed by lyricsId)
  - searchResults: SearchResult[] | null
  - config: ProviderStatus | null
  - settings: { sourceLang, targetLang, provider, localModel, viewMode }
  - loading: { search: boolean, lyrics: boolean, translating: Set<number> }
```

## Lyrics Display

Two toggleable views, same data:

- **Side-by-side:** Two columns — original left, translation right. Matched by lineNumber. Scrolls together.
- **Interleaved:** Single column — each original line followed by translation in smaller muted text.

Empty/instrumental lines passed through as empty rows to maintain alignment.

## Translation Loading

When entering a song or changing provider/lang:
1. Call `getLyrics()` to get cached translations
2. For lines with no cached translation, fire `translate()` calls in parallel (capped at 5 concurrent)
3. Per-line loading spinner while in flight

## Error Handling

| Scenario | Behavior |
|---|---|
| Search fails | Inline message below search bar |
| Lyrics load fails | Message in lyrics area |
| Translation fails for a line | "Translation unavailable" for that line, others unaffected |
| Provider unavailable | Toggle option disabled with tooltip |
| No lyrics found | YouTube player + "No lyrics available" message |
| No video found | Placeholder in player area, lyrics still work |

## Design Decisions Summary

| Decision | Choice | Rationale |
|---|---|---|
| Routing | State-driven, no router | Only 2 views; router adds overhead for no benefit |
| Search UX | Persistent search bar in header | Zero-friction re-search across songs |
| Lyrics layout | Side-by-side default + interleaved toggle | User preference; same data, different render |
| YouTube player | Top, full-width | Clean vertical flow, natural for Phase 3 karaoke |
| Provider toggle | Segmented control near lyrics | Keeps context close to translations |
| Language selection | Two explicit dropdowns (source + target) | Song metadata unreliable for auto-detection |
| State management | useState + prop drilling | Shallow tree, simple state, no need for context/stores |
