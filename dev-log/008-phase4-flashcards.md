# 008 — Phase 4: Flashcards

**Date:** 2026-03-01
**Commits:** `34d9300` → `cafcdba` (7 commits)

## What Was Built

Vocabulary flashcard collection from song lyrics and full-screen review deck. Entirely client-side — IndexedDB for persistence, no backend changes.

### New Files

| File | Role |
|------|------|
| `src/lib/db.ts` | IndexedDB wrapper via `idb` — flashcard CRUD, deck grouping, review session storage |
| `src/lib/db.test.ts` | Tests for `makeCardId` pure function (6 tests) |
| `src/components/WordSelector.tsx` | Tokenizes lyric line into tappable word spans with floating translation pill |
| `src/components/FlashcardReview.tsx` | Full-screen review: cross-fade flip, swipe gestures, keyboard, progress bar, session summary |
| `src/components/FlashcardDeck.tsx` | Deck selection screen — per-song decks + "All Songs" |

### Modified Files

| File | Change |
|------|--------|
| `packages/shared/types.ts` | Added `ReviewSession` interface |
| `apps/web/package.json` | Added `idb` dependency |
| `LyricsToolbar.tsx` | "+ Cards" toggle for flashcard selection mode |
| `LyricsDisplay.tsx` | Renders `WordSelector` in selection mode (side-by-side + interleaved) |
| `KaraokeView.tsx` | Renders `WordSelector` in selection mode |
| `Header.tsx` | "Flashcards" button with card count badge |
| `App.tsx` | `appView` state, flashcard mode state, save handlers, selection mode banner, toast |

## Design Decisions

**Mode-based selection, not always-on.** Lyrics render as plain text by default. Toggle "+ Cards" in toolbar to enter selection mode where words become tappable. Keeps reading/karaoke experience distraction-free.

**Both words and lines.** Tap individual words for vocabulary flashcards, tap "+" to save full lines for phrase/context flashcards. `FlashcardEntry.type` distinguishes them.

**Cross-fade flip, not 3D rotate.** Opacity/visibility swap at 200ms — same pattern as armenian-letters-v2. Better browser compatibility, simpler code.

**Save inline, review separately.** Word selection happens in the song view (contextual). Review happens in a dedicated full-screen deck (focused). Clean separation of collecting vs reviewing.

**Deduplication via deterministic IDs.** Card ID is `{songId}-{sourceLang}-{type}-{source}`. IndexedDB `put` with same key is a no-op. Users can freely re-tap words without duplicates.

**Single-word translation on save.** When saving a word, we fire a single-word translation API call. Falls back to the full-line translation if the word-level call fails. No redundant full-line translations.

## Data Flow

```
WordSelector → onSaveWord(lineId, word, start, end)
    ↓
App.tsx handleSaveWord
    ↓ api.translate(word) for single-word translation
    ↓ saveCard(card) to IndexedDB
    ↓ update savedCardIds + flashcardCount
    ↓ show toast

Header "Flashcards" button
    ↓ setAppView("flashcards")
FlashcardDeck → getSongDecks() + getCards()
    ↓ user picks a deck
FlashcardReview → shuffle, flip, swipe, answer
    ↓ saveReviewSession() on completion
```

## IndexedDB Schema

- **Database:** `lyrilearn`, version 1
- **`flashcards` store:** keyPath `id`, indexes: `by-song` (songId), `by-created` (createdAt)
- **`reviewSessions` store:** keyPath `id`, indexes: `by-date` (date)

## What's Next

- SM-2 spaced repetition scheduling (v2 enhancement)
- Dictionary lookup for richer word definitions
- Google Cloud Translation API setup
- UI/UX polish pass
