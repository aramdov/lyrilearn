import { useEffect, useRef, useCallback } from "react";
import type { LyricLine } from "@lyrilearn/shared";
import type { LyricsTranslation } from "@/lib/api";
import { cn } from "@/lib/utils";
import { WordSelector } from "./WordSelector";

interface KaraokeViewProps {
  lyrics: LyricLine[];
  translations: Map<number, LyricsTranslation>;
  translatingIds: Set<number>;
  activeLineId: number | null;
  showTransliteration: boolean;
  transliterate?: (text: string) => string;
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

export function KaraokeView({
  lyrics,
  translations,
  translatingIds,
  activeLineId,
  showTransliteration,
  transliterate,
  flashcardMode = false,
  savedCardIds,
  onSaveWord,
  onSaveLine,
  compareTranslations,
  comparingIds,
  compareMode = false,
  primaryLabel,
  compareLabel,
}: KaraokeViewProps) {
  const lineRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const setLineRef = useCallback(
    (id: number, el: HTMLDivElement | null) => {
      if (el) lineRefs.current.set(id, el);
      else lineRefs.current.delete(id);
    },
    []
  );

  useEffect(() => {
    if (activeLineId == null) return;
    const el = lineRefs.current.get(activeLineId);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeLineId]);

  return (
    <div className="space-y-2 py-4">
      {lyrics.map((line) => {
        const isActive = line.id === activeLineId;
        const translation = translations.get(line.id);
        const isTranslating = translatingIds.has(line.id);

        return (
          <div
            key={line.id}
            ref={(el) => setLineRef(line.id, el)}
            data-active={isActive}
            className={cn(
              "rounded-md px-3 py-2 transition-colors duration-200",
              isActive
                ? "bg-primary/10 border-l-2 border-primary"
                : "border-l-2 border-transparent"
            )}
          >
            {flashcardMode ? (
              <WordSelector
                text={line.text}
                lineId={line.id}
                translation={translation?.translatedText}
                savedWordIds={savedCardIds ?? new Set()}
                onSaveWord={(word, start, end) => onSaveWord?.(line.id, word, start, end)}
                onSaveLine={() => onSaveLine?.(line.id)}
                className={cn("text-sm", isActive && "text-base font-medium")}
              />
            ) : (
              <p className={cn("text-sm", isActive && "text-base font-medium")}>
                {line.text || "\u00A0"}
              </p>
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
