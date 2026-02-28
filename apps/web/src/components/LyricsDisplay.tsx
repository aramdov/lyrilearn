import type { LyricLine } from "@lyrilearn/shared";
import type { LyricsTranslation } from "@/lib/api";
import type { ViewMode } from "@/hooks/useSongView";
import { KaraokeView } from "./KaraokeView";

interface LyricsDisplayProps {
  lyrics: LyricLine[];
  translations: Map<number, LyricsTranslation>;
  viewMode: ViewMode;
  translatingIds: Set<number>;
  activeLineId?: number | null;
  showTransliteration?: boolean;
  transliterate?: (text: string) => string;
}

export function LyricsDisplay({
  lyrics,
  translations,
  viewMode,
  translatingIds,
  activeLineId = null,
  showTransliteration = false,
  transliterate,
}: LyricsDisplayProps) {
  if (lyrics.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-10">
        No lyrics available for this song
      </div>
    );
  }

  if (viewMode === "karaoke") {
    return (
      <KaraokeView
        lyrics={lyrics}
        translations={translations}
        translatingIds={translatingIds}
        activeLineId={activeLineId}
        showTransliteration={showTransliteration}
        transliterate={transliterate}
      />
    );
  }

  if (viewMode === "side-by-side") {
    return <SideBySideView lyrics={lyrics} translations={translations} translatingIds={translatingIds} />;
  }
  return <InterleavedView lyrics={lyrics} translations={translations} translatingIds={translatingIds} />;
}

// ─── Side by Side ───────────────────────────────────────────

function SideBySideView({
  lyrics,
  translations,
  translatingIds,
}: Omit<LyricsDisplayProps, "viewMode">) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-1 py-4">
      {lyrics.map((line) => {
        const translation = translations.get(line.id);
        const isTranslating = translatingIds.has(line.id);

        return (
          <div key={line.id} className="contents">
            {/* Original */}
            <div className="py-1.5 border-b border-border/50">
              <span className="text-sm">{line.text || "\u00A0"}</span>
            </div>
            {/* Translation */}
            <div className="py-1.5 border-b border-border/50">
              {isTranslating ? (
                <span className="text-sm text-muted-foreground animate-pulse">
                  Translating...
                </span>
              ) : translation ? (
                <span className="text-sm text-muted-foreground">
                  {translation.translatedText}
                </span>
              ) : line.text.trim() ? (
                <span className="text-sm text-muted-foreground/50">
                  Translation unavailable
                </span>
              ) : (
                <span>{"\u00A0"}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Interleaved ────────────────────────────────────────────

function InterleavedView({
  lyrics,
  translations,
  translatingIds,
}: Omit<LyricsDisplayProps, "viewMode">) {
  return (
    <div className="space-y-3 py-4">
      {lyrics.map((line) => {
        const translation = translations.get(line.id);
        const isTranslating = translatingIds.has(line.id);

        return (
          <div key={line.id}>
            <p className="text-sm">{line.text || "\u00A0"}</p>
            {line.text.trim() && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {isTranslating
                  ? "Translating..."
                  : translation
                    ? translation.translatedText
                    : "Translation unavailable"}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
