import { useState } from "react";
import type { Song, LyricLine } from "@lyrilearn/shared";
import type { YouTubeResult } from "@/lib/api";
import { Button } from "@/components/ui/button";

interface SearchResultCardProps {
  song: Song;
  lyrics: LyricLine[];
  youtubeResults: YouTubeResult[];
  onSelect: (song: Song, lyrics: LyricLine[], videoId?: string) => void;
}

export function SearchResultCard({
  song,
  lyrics,
  youtubeResults,
  onSelect,
}: SearchResultCardProps) {
  const [selectedVideoId, setSelectedVideoId] = useState<string | undefined>(
    youtubeResults[0]?.videoId
  );

  return (
    <div className="p-4 border rounded-lg space-y-3">
      {/* Song info row */}
      <div className="flex items-center gap-4">
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
            {lyrics.length} lines
          </p>
        </div>
        <Button onClick={() => onSelect(song, lyrics, selectedVideoId)} variant="outline">
          View Lyrics
        </Button>
      </div>

      {/* Video picker */}
      {youtubeResults.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground font-medium">Choose a video:</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {youtubeResults.map((video) => (
              <button
                key={video.videoId}
                onClick={() => setSelectedVideoId(video.videoId)}
                className={`flex-shrink-0 rounded overflow-hidden border-2 transition-colors ${
                  selectedVideoId === video.videoId
                    ? "border-primary"
                    : "border-transparent hover:border-muted-foreground/30"
                }`}
              >
                {video.thumbnailUrl ? (
                  <img
                    src={video.thumbnailUrl}
                    alt={video.title}
                    className="w-[120px] h-[68px] object-cover"
                  />
                ) : (
                  <div className="w-[120px] h-[68px] bg-muted flex items-center justify-center text-xs text-muted-foreground">
                    No thumbnail
                  </div>
                )}
                <div className="w-[120px] px-1 py-0.5">
                  <p className="text-[10px] leading-tight line-clamp-2 text-left">{video.title}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No videos found</p>
      )}
    </div>
  );
}
