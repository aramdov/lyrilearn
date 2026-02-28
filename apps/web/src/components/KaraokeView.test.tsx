import { describe, test, expect } from "bun:test";
import { render, within } from "@testing-library/react";
import type { LyricLine } from "@lyrilearn/shared";
import type { LyricsTranslation } from "@/lib/api";
import { KaraokeView } from "./KaraokeView";

const LYRICS: LyricLine[] = [
  { id: 1, songId: 1, lineNumber: 1, text: "First line", startTime: 0, endTime: 5 },
  { id: 2, songId: 1, lineNumber: 2, text: "Second line", startTime: 5, endTime: 10 },
  { id: 3, songId: 1, lineNumber: 3, text: "", startTime: 10, endTime: 12 },
  { id: 4, songId: 1, lineNumber: 4, text: "Fourth line", startTime: 12, endTime: 17 },
];

const TRANSLATIONS = new Map<number, LyricsTranslation>([
  [1, { lyricsId: 1, translatedText: "Primera línea", provider: "local", modelVariant: "test" }],
  [2, { lyricsId: 2, translatedText: "Segunda línea", provider: "local", modelVariant: "test" }],
  [4, { lyricsId: 4, translatedText: "Cuarta línea", provider: "local", modelVariant: "test" }],
]);

function renderKaraoke(props: Partial<Parameters<typeof KaraokeView>[0]> = {}) {
  const { container } = render(
    <KaraokeView
      lyrics={LYRICS}
      translations={TRANSLATIONS}
      translatingIds={new Set()}
      activeLineId={null}
      showTransliteration={false}
      {...props}
    />
  );
  return within(container as HTMLElement);
}

describe("KaraokeView", () => {
  test("renders all lyric lines", () => {
    const q = renderKaraoke();
    expect(q.getByText("First line")).toBeDefined();
    expect(q.getByText("Second line")).toBeDefined();
    expect(q.getByText("Fourth line")).toBeDefined();
  });

  test("renders translations alongside lyrics", () => {
    const q = renderKaraoke();
    expect(q.getByText("Primera línea")).toBeDefined();
    expect(q.getByText("Segunda línea")).toBeDefined();
  });

  test("highlights the active line with a data attribute", () => {
    const { container } = render(
      <KaraokeView
        lyrics={LYRICS}
        translations={TRANSLATIONS}
        translatingIds={new Set()}
        activeLineId={2}
        showTransliteration={false}
      />
    );
    const activeLine = container.querySelector("[data-active='true']");
    expect(activeLine).not.toBeNull();
    expect(activeLine!.textContent).toContain("Second line");
  });

  test("no line is highlighted when activeLineId is null", () => {
    const { container } = render(
      <KaraokeView
        lyrics={LYRICS}
        translations={TRANSLATIONS}
        translatingIds={new Set()}
        activeLineId={null}
        showTransliteration={false}
      />
    );
    const activeLine = container.querySelector("[data-active='true']");
    expect(activeLine).toBeNull();
  });

  test("shows 'Translating...' for lines in translatingIds", () => {
    const q = renderKaraoke({ translatingIds: new Set([4]) });
    expect(q.getByText("Translating...")).toBeDefined();
  });
});
