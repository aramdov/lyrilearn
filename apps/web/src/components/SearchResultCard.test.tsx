import { describe, test, expect, mock } from "bun:test";
import { render, within, fireEvent } from "@testing-library/react";
import type { Song, LyricLine } from "@lyrilearn/shared";
import { SearchResultCard } from "./SearchResultCard";

// ---------------------------------------------------------------------------
// SearchResultCard — unit tests
// ---------------------------------------------------------------------------
// The card renders song metadata, an optional artwork image, a line count, an
// optional "Video available" badge, and a "View Lyrics" button that fires
// onSelect with all three arguments.
//
// All queries are scoped to `within(container)` so that DOM nodes from prior
// renders that accumulate in happy-dom's shared body do not interfere.
// ---------------------------------------------------------------------------

// ─── Fixtures ────────────────────────────────────────────────────────────────

/**
 * Build a minimal {@link LyricLine} for use in test data.
 */
const makeLine = (id: number, text: string): LyricLine => ({
  id,
  songId: 1,
  lineNumber: id,
  text,
});

/**
 * A {@link Song} fixture with an artworkUrl present by default.
 * Pass `artworkUrl: undefined` in the override object to simulate missing art.
 */
const makeSong = (overrides: Partial<Song> = {}): Song => ({
  id: 1,
  title: "Bohemian Rhapsody",
  artist: "Queen",
  sourceLang: "en",
  createdAt: "2024-01-01T00:00:00Z",
  artworkUrl: "https://example.com/artwork.jpg",
  ...overrides,
});

const LYRICS: LyricLine[] = [
  makeLine(1, "Is this the real life?"),
  makeLine(2, "Is this just fantasy?"),
  makeLine(3, "Caught in a landslide"),
];

// ─── Helper ───────────────────────────────────────────────────────────────────

function renderCard(props: {
  song: Song;
  lyrics: LyricLine[];
  videoId?: string;
  onSelect: (song: Song, lyrics: LyricLine[], videoId?: string) => void;
}) {
  const { container } = render(<SearchResultCard {...props} />);
  return { q: within(container as HTMLElement), container };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("SearchResultCard", () => {
  // ── Basic rendering ────────────────────────────────────────────────────────

  test("renders the song title and artist", () => {
    const { q } = renderCard({
      song: makeSong(),
      lyrics: LYRICS,
      onSelect: mock(() => {}),
    });

    expect(q.getByText("Bohemian Rhapsody")).toBeDefined();
    expect(q.getByText("Queen")).toBeDefined();
  });

  // ── Artwork ───────────────────────────────────────────────────────────────

  test("renders an <img> with alt text when artworkUrl is present", () => {
    const { q } = renderCard({
      song: makeSong({ artworkUrl: "https://example.com/artwork.jpg" }),
      lyrics: LYRICS,
      onSelect: mock(() => {}),
    });

    const img = q.getByAltText("Bohemian Rhapsody artwork") as HTMLImageElement;
    expect(img).toBeDefined();
    expect(img.src).toBe("https://example.com/artwork.jpg");
  });

  test("shows 'No art' placeholder when artworkUrl is absent", () => {
    const { q } = renderCard({
      song: makeSong({ artworkUrl: undefined }),
      lyrics: LYRICS,
      onSelect: mock(() => {}),
    });

    expect(q.getByText("No art")).toBeDefined();
    // No <img> should be present
    expect(q.queryByRole("img")).toBeNull();
  });

  // ── Line count ────────────────────────────────────────────────────────────

  test("displays the correct line count", () => {
    const { q } = renderCard({
      song: makeSong(),
      lyrics: LYRICS,
      onSelect: mock(() => {}),
    });

    // The component renders "{n} lines"
    expect(q.getByText(/3 lines/)).toBeDefined();
  });

  test("line count is 0 when lyrics array is empty", () => {
    const { q } = renderCard({
      song: makeSong(),
      lyrics: [],
      onSelect: mock(() => {}),
    });

    expect(q.getByText(/0 lines/)).toBeDefined();
  });

  // ── Video availability label ──────────────────────────────────────────────

  test("shows '· Video available' when a videoId is provided", () => {
    const { q } = renderCard({
      song: makeSong(),
      lyrics: LYRICS,
      videoId: "dQw4w9WgXcQ",
      onSelect: mock(() => {}),
    });

    // The rendered string is "{n} lines · Video available"
    expect(q.getByText(/Video available/)).toBeDefined();
  });

  test("does NOT show 'Video available' when videoId is absent", () => {
    const { q } = renderCard({
      song: makeSong(),
      lyrics: LYRICS,
      // videoId intentionally omitted
      onSelect: mock(() => {}),
    });

    expect(q.queryByText(/Video available/)).toBeNull();
  });

  // ── onSelect callback ─────────────────────────────────────────────────────

  test("calls onSelect with song, lyrics, and videoId when 'View Lyrics' is clicked", () => {
    const onSelect = mock(
      (_song: Song, _lyrics: LyricLine[], _videoId?: string) => {}
    );
    const song = makeSong();
    const videoId = "dQw4w9WgXcQ";

    const { q } = renderCard({ song, lyrics: LYRICS, videoId, onSelect });

    fireEvent.click(q.getByRole("button", { name: "View Lyrics" }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(song, LYRICS, videoId);
  });

  test("calls onSelect with undefined videoId when no videoId is provided", () => {
    const onSelect = mock(
      (_song: Song, _lyrics: LyricLine[], _videoId?: string) => {}
    );
    const song = makeSong();

    const { q } = renderCard({ song, lyrics: LYRICS, onSelect });

    fireEvent.click(q.getByRole("button", { name: "View Lyrics" }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(song, LYRICS, undefined);
  });
});
