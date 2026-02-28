import { useEffect, useRef, useCallback } from "react";
import type { LyricLine } from "@lyrilearn/shared";
import type { LyricsTranslation } from "@/lib/api";
import { cn } from "@/lib/utils";

interface KaraokeViewProps {
  lyrics: LyricLine[];
  translations: Map<number, LyricsTranslation>;
  translatingIds: Set<number>;
  activeLineId: number | null;
  showTransliteration: boolean;
  transliterate?: (text: string) => string;
}

export function KaraokeView({
  lyrics,
  translations,
  translatingIds,
  activeLineId,
  showTransliteration,
  transliterate,
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
            <p className={cn("text-sm", isActive && "text-base font-medium")}>
              {line.text || "\u00A0"}
            </p>

            {showTransliteration && transliterate && line.text.trim() && (
              <p className="text-xs text-muted-foreground/70 italic mt-0.5">
                {transliterate(line.text)}
              </p>
            )}

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
