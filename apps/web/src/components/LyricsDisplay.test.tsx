import { describe, test, expect } from "bun:test";
import { render, within } from "@testing-library/react";
import type { LyricLine } from "@lyrilearn/shared";
import type { LyricsTranslation } from "@/lib/api";
import type { ViewMode } from "@/hooks/useSongView";
import { LyricsDisplay } from "./LyricsDisplay";

// ---------------------------------------------------------------------------
// LyricsDisplay — unit tests
// ---------------------------------------------------------------------------
// LyricsDisplay is a pure presentational component.  Given the same props it
// always renders the same markup, so all tests are fully synchronous.
//
// Each test scopes its queries to the `container` returned by `render` via
// `within(container)`.  This prevents stale DOM nodes from previous renders
// — which happy-dom accumulates in document.body — from causing spurious
// "Found multiple elements" errors.
//
// The component has three rendering paths:
//   1. Empty lyrics array  → "No lyrics available" message
//   2. viewMode="side-by-side" → two-column grid (SideBySideView)
//   3. viewMode="interleaved"  → stacked pairs (InterleavedView)
//
// In both non-empty paths there are three translation states per line:
//   a. In-flight (id is in translatingIds)  → "Translating..."
//   b. Resolved (translation exists in map)  → translation text
//   c. Unavailable (no translation, has text) → "Translation unavailable"
// ---------------------------------------------------------------------------

// ─── Factory helpers ──────────────────────────────────────────────────────────

/**
 * Builds a {@link LyricLine} with the minimum fields required by LyricsDisplay.
 */
const makeLine = (id: number, text: string): LyricLine => ({
  id,
  songId: 1,
  lineNumber: id,
  text,
});

/**
 * Builds a {@link LyricsTranslation} keyed by `lyricsId`.
 */
const makeTranslation = (
  lyricsId: number,
  text: string
): LyricsTranslation => ({
  lyricsId,
  translatedText: text,
  provider: "local",
  modelVariant: "test",
});

// ─── Shared rendering helper ──────────────────────────────────────────────────

interface RenderOptions {
  lyrics?: LyricLine[];
  translations?: Map<number, LyricsTranslation>;
  viewMode?: ViewMode;
  translatingIds?: Set<number>;
}

/**
 * Renders LyricsDisplay and returns a `within`-scoped query helper bound to
 * the render's own container.  This keeps each test isolated from DOM nodes
 * that accumulate in document.body across tests.
 */
function renderDisplay({
  lyrics = [],
  translations = new Map(),
  viewMode = "side-by-side",
  translatingIds = new Set<number>(),
}: RenderOptions = {}) {
  const { container, rerender, unmount } = render(
    <LyricsDisplay
      lyrics={lyrics}
      translations={translations}
      viewMode={viewMode}
      translatingIds={translatingIds}
    />
  );

  return {
    q: within(container as HTMLElement),
    container,
    rerender,
    unmount,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("LyricsDisplay", () => {
  // ── Empty state ─────────────────────────────────────────────────────────────

  test("shows 'No lyrics available for this song' when the lyrics array is empty", () => {
    const { q } = renderDisplay({ lyrics: [] });

    expect(
      q.getByText("No lyrics available for this song")
    ).toBeDefined();
  });

  // ── Side-by-side view ───────────────────────────────────────────────────────

  describe("viewMode='side-by-side'", () => {
    const LYRICS = [
      makeLine(1, "Is this the real life?"),
      makeLine(2, "Is this just fantasy?"),
    ];

    test("renders original text for every line", () => {
      const { q } = renderDisplay({ lyrics: LYRICS, viewMode: "side-by-side" });

      expect(q.getByText("Is this the real life?")).toBeDefined();
      expect(q.getByText("Is this just fantasy?")).toBeDefined();
    });

    test("renders translated text when a translation exists in the map", () => {
      const translations = new Map([
        [1, makeTranslation(1, "Это реальная жизнь?")],
        [2, makeTranslation(2, "Или это просто фантазия?")],
      ]);

      const { q } = renderDisplay({
        lyrics: LYRICS,
        translations,
        viewMode: "side-by-side",
      });

      expect(q.getByText("Это реальная жизнь?")).toBeDefined();
      expect(q.getByText("Или это просто фантазия?")).toBeDefined();
    });

    test("shows 'Translating...' for a line whose id is in translatingIds", () => {
      // Line 1 is in flight; line 2 already has a translation.
      const translations = new Map([
        [2, makeTranslation(2, "Или это просто фантазия?")],
      ]);
      const translatingIds = new Set([1]);

      const { q } = renderDisplay({
        lyrics: LYRICS,
        translations,
        translatingIds,
        viewMode: "side-by-side",
      });

      expect(q.getByText("Translating...")).toBeDefined();
      // The resolved translation must still appear.
      expect(q.getByText("Или это просто фантазия?")).toBeDefined();
    });

    test("shows 'Translation unavailable' for every line with text but no translation", () => {
      // No translations provided, no ids are translating → unavailable state.
      const { q } = renderDisplay({ lyrics: LYRICS, viewMode: "side-by-side" });

      const unavailableNodes = q.getAllByText("Translation unavailable");
      // One node per lyric line that has non-empty text.
      expect(unavailableNodes.length).toBe(LYRICS.length);
    });

    test("does NOT show 'Translation unavailable' for blank/instrumental lines", () => {
      // Empty-text lines render a non-breaking space in the translation slot —
      // they must NOT produce a "Translation unavailable" node.
      const lyricsWithBlank = [
        makeLine(1, "Is this the real life?"),
        makeLine(2, ""), // blank — often used for instrumental breaks
      ];

      const { q } = renderDisplay({
        lyrics: lyricsWithBlank,
        viewMode: "side-by-side",
      });

      const unavailableNodes = q.queryAllByText("Translation unavailable");
      // Only the non-blank line (id=1) should show the unavailable label.
      expect(unavailableNodes.length).toBe(1);
    });
  });

  // ── Interleaved view ─────────────────────────────────────────────────────────

  describe("viewMode='interleaved'", () => {
    const LYRICS = [
      makeLine(1, "Caught in a landslide"),
      makeLine(2, "No escape from reality"),
    ];

    test("renders original text for every line", () => {
      const { q } = renderDisplay({
        lyrics: LYRICS,
        viewMode: "interleaved",
      });

      expect(q.getByText("Caught in a landslide")).toBeDefined();
      expect(q.getByText("No escape from reality")).toBeDefined();
    });

    test("renders translated text when a translation exists in the map", () => {
      const translations = new Map([
        [1, makeTranslation(1, "Попав в оползень")],
        [2, makeTranslation(2, "Нет выхода из реальности")],
      ]);

      const { q } = renderDisplay({
        lyrics: LYRICS,
        translations,
        viewMode: "interleaved",
      });

      expect(q.getByText("Попав в оползень")).toBeDefined();
      expect(q.getByText("Нет выхода из реальности")).toBeDefined();
    });

    test("shows 'Translating...' for every line whose id is in translatingIds", () => {
      const translatingIds = new Set([1, 2]);

      const { q } = renderDisplay({
        lyrics: LYRICS,
        translatingIds,
        viewMode: "interleaved",
      });

      const nodes = q.getAllByText("Translating...");
      expect(nodes.length).toBe(2);
    });

    test("shows 'Translation unavailable' for lines with text and no translation", () => {
      const { q } = renderDisplay({
        lyrics: LYRICS,
        viewMode: "interleaved",
      });

      const unavailableNodes = q.getAllByText("Translation unavailable");
      expect(unavailableNodes.length).toBe(LYRICS.length);
    });

    test("does NOT render a translation row for a blank line", () => {
      // The component only renders the translation sub-row when
      // line.text.trim() is truthy.
      const lyricsWithBlank = [
        makeLine(1, "Open your eyes"),
        makeLine(2, ""), // blank line — no sub-row expected
      ];

      const { q } = renderDisplay({
        lyrics: lyricsWithBlank,
        viewMode: "interleaved",
      });

      // Only one "Translation unavailable" node — for the non-blank line.
      const unavailableNodes = q.queryAllByText("Translation unavailable");
      expect(unavailableNodes.length).toBe(1);
    });
  });

  // ── Karaoke view ───────────────────────────────────────────────────────────

  describe("viewMode='karaoke'", () => {
    const LYRICS = [
      makeLine(1, "Follow the light"),
      makeLine(2, "Into the night"),
    ];

    test("renders original text for every line", () => {
      const { q } = renderDisplay({ lyrics: LYRICS, viewMode: "karaoke" });
      expect(q.getByText("Follow the light")).toBeDefined();
      expect(q.getByText("Into the night")).toBeDefined();
    });

    test("renders translated text when a translation exists", () => {
      const translations = new Map([
        [1, makeTranslation(1, "Sigue la luz")],
        [2, makeTranslation(2, "Hacia la noche")],
      ]);
      const { q } = renderDisplay({ lyrics: LYRICS, translations, viewMode: "karaoke" });
      expect(q.getByText("Sigue la luz")).toBeDefined();
      expect(q.getByText("Hacia la noche")).toBeDefined();
    });

    test("shows 'Translating...' for lines in translatingIds", () => {
      const { q } = renderDisplay({
        lyrics: LYRICS,
        translatingIds: new Set([1]),
        viewMode: "karaoke",
      });
      expect(q.getByText("Translating...")).toBeDefined();
    });
  });

  // ── View mode switching ──────────────────────────────────────────────────────

  describe("view mode switching", () => {
    const LYRICS = [makeLine(1, "Open your eyes")];
    const TRANSLATIONS = new Map([
      [1, makeTranslation(1, "Открой глаза")],
    ]);

    test("renders translation text in side-by-side mode", () => {
      const { q } = renderDisplay({
        lyrics: LYRICS,
        translations: TRANSLATIONS,
        viewMode: "side-by-side",
      });

      expect(q.getByText("Открой глаза")).toBeDefined();
    });

    test("renders translation text in interleaved mode", () => {
      const { q } = renderDisplay({
        lyrics: LYRICS,
        translations: TRANSLATIONS,
        viewMode: "interleaved",
      });

      expect(q.getByText("Открой глаза")).toBeDefined();
    });

    test("re-renders correctly when viewMode changes from side-by-side to interleaved", () => {
      const { container, rerender } = render(
        <LyricsDisplay
          lyrics={LYRICS}
          translations={TRANSLATIONS}
          viewMode="side-by-side"
          translatingIds={new Set()}
        />
      );

      const q = within(container as HTMLElement);

      // Translation should be visible in side-by-side.
      expect(q.getByText("Открой глаза")).toBeDefined();

      rerender(
        <LyricsDisplay
          lyrics={LYRICS}
          translations={TRANSLATIONS}
          viewMode="interleaved"
          translatingIds={new Set()}
        />
      );

      // Translation should remain visible after the mode switch.
      expect(q.getByText("Открой глаза")).toBeDefined();
      // Original text must still be present.
      expect(q.getByText("Open your eyes")).toBeDefined();
    });

    test("renders translation text in karaoke mode", () => {
      const { q } = renderDisplay({
        lyrics: LYRICS,
        translations: TRANSLATIONS,
        viewMode: "karaoke",
      });
      expect(q.getByText("Открой глаза")).toBeDefined();
    });

    test("re-renders correctly when viewMode changes from interleaved to side-by-side", () => {
      const { container, rerender } = render(
        <LyricsDisplay
          lyrics={LYRICS}
          translations={TRANSLATIONS}
          viewMode="interleaved"
          translatingIds={new Set()}
        />
      );

      const q = within(container as HTMLElement);

      expect(q.getByText("Открой глаза")).toBeDefined();

      rerender(
        <LyricsDisplay
          lyrics={LYRICS}
          translations={TRANSLATIONS}
          viewMode="side-by-side"
          translatingIds={new Set()}
        />
      );

      expect(q.getByText("Открой глаза")).toBeDefined();
      expect(q.getByText("Open your eyes")).toBeDefined();
    });
  });
});
