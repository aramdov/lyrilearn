import { describe, test, expect, mock } from "bun:test";
import { render, within, fireEvent } from "@testing-library/react";
import type { Song, LyricLine } from "@lyrilearn/shared";
import type { YouTubeResult } from "@/lib/api";
import { SearchResultCard } from "./SearchResultCard";

// ---------------------------------------------------------------------------
// SearchResultCard — unit tests
// ---------------------------------------------------------------------------

// ─── Fixtures ────────────────────────────────────────────────────────────────

const makeLine = (id: number, text: string): LyricLine => ({
  id,
  songId: 1,
  lineNumber: id,
  text,
});

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

const YOUTUBE_RESULTS: YouTubeResult[] = [
  { videoId: "dQw4w9WgXcQ", title: "Official Video", channelTitle: "QueenVEVO", thumbnailUrl: "https://example.com/thumb1.jpg" },
  { videoId: "abc123", title: "Live Performance", channelTitle: "Queen", thumbnailUrl: "https://example.com/thumb2.jpg" },
];

// ─── Helper ───────────────────────────────────────────────────────────────────

function renderCard(props: {
  song: Song;
  lyrics: LyricLine[];
  youtubeResults?: YouTubeResult[];
  onSelect: (song: Song, lyrics: LyricLine[], videoId?: string) => void;
}) {
  const { container } = render(
    <SearchResultCard
      youtubeResults={props.youtubeResults ?? []}
      {...props}
    />
  );
  return { q: within(container as HTMLElement), container };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("SearchResultCard", () => {
  // ── Basic rendering ────────────────────────────────────────────────────────

  test("renders the song title and artist", () => {
    const { q } = renderCard({
      song: makeSong(),
      lyrics: LYRICS,
      youtubeResults: YOUTUBE_RESULTS,
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
      youtubeResults: YOUTUBE_RESULTS,
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
      youtubeResults: YOUTUBE_RESULTS,
      onSelect: mock(() => {}),
    });

    expect(q.getByText("No art")).toBeDefined();
    // Song artwork img should not be present (video thumbnails may still exist)
    expect(q.queryByAltText("Bohemian Rhapsody artwork")).toBeNull();
  });

  // ── Line count ────────────────────────────────────────────────────────────

  test("displays the correct line count", () => {
    const { q } = renderCard({
      song: makeSong(),
      lyrics: LYRICS,
      youtubeResults: YOUTUBE_RESULTS,
      onSelect: mock(() => {}),
    });

    expect(q.getByText(/3 lines/)).toBeDefined();
  });

  // ── Video picker ──────────────────────────────────────────────────────────

  test("renders video thumbnails when youtubeResults are provided", () => {
    const { q } = renderCard({
      song: makeSong(),
      lyrics: LYRICS,
      youtubeResults: YOUTUBE_RESULTS,
      onSelect: mock(() => {}),
    });

    expect(q.getByText("Official Video")).toBeDefined();
    expect(q.getByText("Live Performance")).toBeDefined();
  });

  test("shows 'No videos found' when youtubeResults is empty", () => {
    const { q } = renderCard({
      song: makeSong(),
      lyrics: LYRICS,
      youtubeResults: [],
      onSelect: mock(() => {}),
    });

    expect(q.getByText("No videos found")).toBeDefined();
  });

  // ── onSelect callback ─────────────────────────────────────────────────────

  test("calls onSelect with first video selected by default", () => {
    const onSelect = mock(
      (_song: Song, _lyrics: LyricLine[], _videoId?: string) => {}
    );
    const song = makeSong();

    const { q } = renderCard({ song, lyrics: LYRICS, youtubeResults: YOUTUBE_RESULTS, onSelect });

    fireEvent.click(q.getByRole("button", { name: "View Lyrics" }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(song, LYRICS, "dQw4w9WgXcQ");
  });

  test("calls onSelect with user-selected video after clicking a thumbnail", () => {
    const onSelect = mock(
      (_song: Song, _lyrics: LyricLine[], _videoId?: string) => {}
    );
    const song = makeSong();

    const { q } = renderCard({ song, lyrics: LYRICS, youtubeResults: YOUTUBE_RESULTS, onSelect });

    // Click the second video thumbnail
    fireEvent.click(q.getByText("Live Performance"));
    fireEvent.click(q.getByRole("button", { name: "View Lyrics" }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(song, LYRICS, "abc123");
  });

  test("calls onSelect with undefined videoId when no videos available", () => {
    const onSelect = mock(
      (_song: Song, _lyrics: LyricLine[], _videoId?: string) => {}
    );
    const song = makeSong();

    const { q } = renderCard({ song, lyrics: LYRICS, youtubeResults: [], onSelect });

    fireEvent.click(q.getByRole("button", { name: "View Lyrics" }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(song, LYRICS, undefined);
  });
});
