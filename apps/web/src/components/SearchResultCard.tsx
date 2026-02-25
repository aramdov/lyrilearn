import type { Song, LyricLine } from "@lyrilearn/shared";
import { Button } from "@/components/ui/button";

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
