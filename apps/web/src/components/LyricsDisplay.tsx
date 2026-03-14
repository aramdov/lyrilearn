import type { LyricLine } from "@lyrilearn/shared";
import type { LyricsTranslation } from "@/lib/api";
import type { ViewMode } from "@/hooks/useSongView";
import { KaraokeView } from "./KaraokeView";
import { WordSelector } from "./WordSelector";

interface LyricsDisplayProps {
  lyrics: LyricLine[];
  translations: Map<number, LyricsTranslation>;
  viewMode: ViewMode;
  translatingIds: Set<number>;
  activeLineId?: number | null;
  showTransliteration?: boolean;
  transliterate?: (text: string) => string;
  translationError?: string | null;
  flashcardMode?: boolean;
  savedCardIds?: Set<string>;
  onSaveWord?: (lineId: number, word: string, startIdx: number, endIdx: number) => void;
  onSaveLine?: (lineId: number) => void;
  compareTranslations?: Map<number, LyricsTranslation>;
  comparingIds?: Set<number>;
  compareMode?: boolean;
  primaryLabel?: string;
  compareLabel?: string;
}

export function LyricsDisplay({
  lyrics,
  translations,
  viewMode,
  translatingIds,
  activeLineId = null,
  showTransliteration = false,
  transliterate,
  translationError = null,
  flashcardMode = false,
  savedCardIds,
  onSaveWord,
  onSaveLine,
  compareTranslations,
  comparingIds,
  compareMode = false,
  primaryLabel,
  compareLabel,
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
        flashcardMode={flashcardMode}
        savedCardIds={savedCardIds}
        onSaveWord={onSaveWord}
        onSaveLine={onSaveLine}
        compareTranslations={compareTranslations}
        comparingIds={comparingIds}
        compareMode={compareMode}
        primaryLabel={primaryLabel}
        compareLabel={compareLabel}
      />
    );
  }

  if (viewMode === "side-by-side") {
    return <SideBySideView lyrics={lyrics} translations={translations} translatingIds={translatingIds} showTransliteration={showTransliteration} transliterate={transliterate} translationError={translationError} flashcardMode={flashcardMode} savedCardIds={savedCardIds} onSaveWord={onSaveWord} onSaveLine={onSaveLine} compareTranslations={compareTranslations} comparingIds={comparingIds} compareMode={compareMode} primaryLabel={primaryLabel} compareLabel={compareLabel} />;
  }
  return <InterleavedView lyrics={lyrics} translations={translations} translatingIds={translatingIds} showTransliteration={showTransliteration} transliterate={transliterate} translationError={translationError} flashcardMode={flashcardMode} savedCardIds={savedCardIds} onSaveWord={onSaveWord} onSaveLine={onSaveLine} compareTranslations={compareTranslations} comparingIds={comparingIds} compareMode={compareMode} primaryLabel={primaryLabel} compareLabel={compareLabel} />;
}

// ─── Side by Side ───────────────────────────────────────────

function SideBySideView({
  lyrics,
  translations,
  translatingIds,
  showTransliteration,
  transliterate,
  translationError,
  flashcardMode,
  savedCardIds,
  onSaveWord,
  onSaveLine,
  compareTranslations,
  comparingIds,
  compareMode,
  primaryLabel,
  compareLabel,
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
              {flashcardMode ? (
                <WordSelector
                  text={line.text}
                  lineId={line.id}
                  translation={translation?.translatedText}
                  savedWordIds={savedCardIds ?? new Set()}
                  onSaveWord={(word, start, end) => onSaveWord?.(line.id, word, start, end)}
                  onSaveLine={() => onSaveLine?.(line.id)}
                  className="text-sm"
                />
              ) : (
                <span className="text-sm">{line.text || "\u00A0"}</span>
              )}
            </div>
            {/* Transliteration */}
            {showTransliteration && transliterate && line.text.trim() && (
              <p className="text-xs text-muted-foreground/70 italic col-span-2 -mt-1 mb-1">
                {transliterate(line.text)}
              </p>
            )}
            {/* Translation */}
            <div className="py-1.5 border-b border-border/50">
              {isTranslating ? (
                <span className="text-sm text-muted-foreground animate-pulse">
                  Translating...
                </span>
              ) : translation ? (
                <span className="text-sm text-muted-foreground">
                  {compareMode && primaryLabel && (
                    <span className="text-[10px] text-muted-foreground/50 mr-1">[{primaryLabel}]</span>
                  )}
                  {translation.translatedText}
                </span>
              ) : line.text.trim() ? (
                <span className="text-sm text-muted-foreground/50">
                  {translationError ? "Translation failed" : "Translation unavailable"}
                </span>
              ) : (
                <span>{"\u00A0"}</span>
              )}
              {compareMode && line.text.trim() && (() => {
                const cmp = compareTranslations?.get(line.id);
                const isComparing = comparingIds?.has(line.id);
                const isSame = cmp && translation && cmp.translatedText === translation.translatedText;
                return (
                  <div className="mt-0.5">
                    {isComparing ? (
                      <span className="text-sm text-muted-foreground/40 animate-pulse">Translating...</span>
                    ) : isSame ? (
                      <span className="text-sm text-muted-foreground/30 italic">
                        <span className="text-[10px] mr-1">[{compareLabel}]</span>(same)
                      </span>
                    ) : cmp ? (
                      <span className="text-sm text-muted-foreground/60">
                        <span className="text-[10px] text-muted-foreground/40 mr-1">[{compareLabel}]</span>
                        {cmp.translatedText}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground/30">
                        <span className="text-[10px] mr-1">[{compareLabel}]</span>—
                      </span>
                    )}
                  </div>
                );
              })()}
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
  showTransliteration,
  transliterate,
  translationError,
  flashcardMode,
  savedCardIds,
  onSaveWord,
  onSaveLine,
  compareTranslations,
  comparingIds,
  compareMode,
  primaryLabel,
  compareLabel,
}: Omit<LyricsDisplayProps, "viewMode">) {
  return (
    <div className="space-y-3 py-4">
      {lyrics.map((line) => {
        const translation = translations.get(line.id);
        const isTranslating = translatingIds.has(line.id);

        return (
          <div key={line.id}>
            {flashcardMode ? (
              <WordSelector
                text={line.text}
                lineId={line.id}
                translation={translations.get(line.id)?.translatedText}
                savedWordIds={savedCardIds ?? new Set()}
                onSaveWord={(word, start, end) => onSaveWord?.(line.id, word, start, end)}
                onSaveLine={() => onSaveLine?.(line.id)}
                className="text-sm"
              />
            ) : (
              <p className="text-sm">{line.text || "\u00A0"}</p>
            )}
            {showTransliteration && transliterate && line.text.trim() && (
              <p className="text-xs text-muted-foreground/70 italic mt-0.5">
                {transliterate(line.text)}
              </p>
            )}
            {line.text.trim() && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {compareMode && primaryLabel && (
                  <span className="text-[10px] text-muted-foreground/50 mr-1">[{primaryLabel}]</span>
                )}
                {isTranslating
                  ? "Translating..."
                  : translation
                    ? translation.translatedText
                    : translationError
                      ? "Translation failed"
                      : "Translation unavailable"}
              </p>
            )}
            {compareMode && line.text.trim() && (() => {
              const cmp = compareTranslations?.get(line.id);
              const isComparing = comparingIds?.has(line.id);
              const isSame = cmp && translation && cmp.translatedText === translation.translatedText;
              return (
                <p className="text-xs mt-0.5">
                  {isComparing ? (
                    <span className="text-muted-foreground/40 animate-pulse">Translating...</span>
                  ) : isSame ? (
                    <span className="text-muted-foreground/30 italic">
                      <span className="text-[10px] mr-1">[{compareLabel}]</span>(same)
                    </span>
                  ) : cmp ? (
                    <span className="text-muted-foreground/60">
                      <span className="text-[10px] text-muted-foreground/40 mr-1">[{compareLabel}]</span>
                      {cmp.translatedText}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/30">
                      <span className="text-[10px] mr-1">[{compareLabel}]</span>—
                    </span>
                  )}
                </p>
              );
            })()}
          </div>
        );
      })}
    </div>
  );
}
