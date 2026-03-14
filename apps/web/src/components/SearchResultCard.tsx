import { useState } from "react";
import type { Song, LyricLine } from "@lyrilearn/shared";
import type { YouTubeResult, LyricsSource } from "@/lib/api";
import { Button } from "@/components/ui/button";

interface SearchResultCardProps {
  song: Song;
  lyrics: LyricLine[];
  youtubeResults: YouTubeResult[];
  lyricsSource?: LyricsSource;
  onSelect: (song: Song, lyrics: LyricLine[], videoId?: string) => void;
}

export function SearchResultCard({
  song,
  lyrics,
  youtubeResults,
  lyricsSource,
  onSelect,
}: SearchResultCardProps) {
  const videos = youtubeResults ?? [];
  const [selectedVideoId, setSelectedVideoId] = useState<string | undefined>(
    videos[0]?.videoId
  );

  const sourceLabel =
    lyricsSource === "lrclib-synced"
      ? "LRCLIB (synced)"
      : lyricsSource === "lrclib-plain"
        ? "LRCLIB (plain)"
        : lyricsSource === "none"
          ? "No lyrics"
          : null;

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Top: Song info */}
      <div className="flex items-center gap-4 p-4 bg-muted/30">
        {song.artworkUrl ? (
          <img
            src={song.artworkUrl}
            alt={`${song.title} artwork`}
            className="w-20 h-20 rounded-md object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-20 h-20 rounded-md bg-muted flex items-center justify-center text-muted-foreground text-xs flex-shrink-0">
            No art
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-lg truncate">{song.title}</p>
          <p className="text-sm text-muted-foreground truncate">{song.artist}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-muted-foreground">{lyrics.length} lines</span>
            {sourceLabel && (
              <span className="text-xs text-muted-foreground/70 border border-border/50 rounded px-1.5 py-0.5">
                {sourceLabel}
              </span>
            )}
          </div>
          {lyricsSource === "none" && (
            <p className="text-xs text-muted-foreground/50 mt-1">
              No lyrics found — may be available on other services
            </p>
          )}
        </div>
        <Button
          onClick={() => onSelect(song, lyrics, selectedVideoId)}
          size="lg"
          className="flex-shrink-0"
        >
          View Lyrics
        </Button>
      </div>

      {/* Bottom: Video picker */}
      {videos.length > 0 ? (
        <div className="p-4 space-y-2">
          <p className="text-xs text-muted-foreground font-medium">Choose a video:</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {videos.map((video) => (
              <button
                key={video.videoId}
                onClick={() => setSelectedVideoId(video.videoId)}
                className={`rounded-lg overflow-hidden border-2 transition-colors ${
                  selectedVideoId === video.videoId
                    ? "border-primary"
                    : "border-transparent hover:border-muted-foreground/30"
                }`}
              >
                {video.thumbnailUrl ? (
                  <img
                    src={video.thumbnailUrl}
                    alt={video.title}
                    className="w-full aspect-video object-cover"
                  />
                ) : (
                  <div className="w-full aspect-video bg-muted flex items-center justify-center text-xs text-muted-foreground">
                    No thumbnail
                  </div>
                )}
                <div className="px-2 py-1.5">
                  <p className="text-xs leading-tight line-clamp-2 text-left">{video.title}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="px-4 py-3">
          <p className="text-xs text-muted-foreground">No videos found</p>
        </div>
      )}
    </div>
  );
}
