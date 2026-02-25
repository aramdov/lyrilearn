# 005 — Phase 2: Frontend Core

**Date:** 2026-02-25
**Commits:** `5b8052c` → `26a92a9` (12 commits)

## What Was Built

React SPA in `apps/web/` that connects to the Phase 1 backend. Two views: search landing and song view. No router — state-driven view switching.

### Component Architecture

```
App
├── Header → SearchBar (persistent, always visible)
├── SearchResultCard (when search results exist)
└── SongView (when song selected)
    ├── YouTubePlayer
    ├── LyricsToolbar (language, provider, view toggles)
    └── LyricsDisplay (side-by-side or interleaved)
```

### Key Files

| File | Role |
|------|------|
| `src/lib/api.ts` | Typed fetch wrapper — unwraps `{ data: T }` envelope, throws on error |
| `src/hooks/useSongView.ts` | All song/translation state + concurrent translation workers |
| `src/App.tsx` | View switching, settings management, search flow |
| `src/components/LyricsDisplay.tsx` | Two render modes sharing same data |
| `src/components/YouTubePlayer.tsx` | YouTube IFrame API with singleton script loader |
| `src/components/LyricsToolbar.tsx` | Language selectors + provider + view toggles |

## Tooling

- **Vite + React 19 + TypeScript** (react-ts template)
- **Tailwind CSS v4** via `@tailwindcss/vite` plugin (no config file needed)
- **shadcn/ui** for form components (Button, Input, Select, ToggleGroup)
- **Vite proxy** — `/api` → `localhost:3001` so frontend hits backend seamlessly
- **Path alias** — `@/` maps to `./src/` via tsconfig + vite resolve

## Design Decisions

**No router.** Only two views (search + song). Adding React Router for Phase 4 flashcard pages is a trivial refactor. Trade-off: no shareable song URLs.

**useState + prop drilling.** The component tree is shallow (3 levels max). No context providers or state management libraries needed.

**useSongView hook.** Extracts all song/translation state from App.tsx. App.tsx only handles search state and settings — clean separation.

**Concurrent translation with worker pool.** When a song has uncached translations, fires up to 5 parallel `POST /api/translate` calls. Per-line loading spinners while in flight.

## Review Fixes

A code review caught three issues that were fixed before completion:

### 1. Translation Race Condition

**Problem:** `translateLines` was fire-and-forget. If the user switched providers while translations were in flight, stale results from the old provider would overwrite the new translations.

**Fix:** Added a generation counter (`generationRef`). Each `fetchTranslations` call increments the generation. Workers check `generationRef.current === generation` before writing results — stale results are silently discarded.

### 2. Source Language Change Not Triggering Re-fetch

**Problem:** Target language changes correctly called `refetchTranslations()`, but source language changes only updated the settings state. Translations would be stale because the backend needs the source language to translate.

**Fix:** Added `songView.refetchTranslations(newSettings)` to the source language change handler, same pattern as target language.

### 3. ViewMode Type Duplicated in 3 Files

**Problem:** `type ViewMode = "side-by-side" | "interleaved"` was independently defined in `useSongView.ts`, `LyricsToolbar.tsx`, and `LyricsDisplay.tsx`.

**Fix:** Single definition in `useSongView.ts`, imported by the other two.

## React 19 Note

`React.FormEvent` without a type parameter is deprecated in React 19. Must use `React.FormEvent<HTMLFormElement>`. Caught by TypeScript diagnostic.

## What's Next

Phase 3: Karaoke sync + Transliteration — synced lyrics highlighting with YouTube playback time, transliteration toggle for non-Latin scripts.
