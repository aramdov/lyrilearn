import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

interface WordSelectorProps {
  text: string;
  lineId: number;
  translation?: string;
  savedWordIds: Set<string>;
  onSaveWord: (word: string, startIdx: number, endIdx: number) => void;
  onSaveLine: () => void;
  className?: string;
}

interface Selection {
  startIdx: number;
  endIdx: number;
}

function tokenize(text: string): { token: string; isWord: boolean; index: number }[] {
  const parts = text.split(/(\s+)/);
  const tokens: { token: string; isWord: boolean; index: number }[] = [];
  let charIndex = 0;
  for (const part of parts) {
    if (part.length === 0) continue;
    const isWord = !/^\s+$/.test(part);
    tokens.push({ token: part, isWord, index: charIndex });
    charIndex += part.length;
  }
  return tokens;
}

function getWordId(lineId: number, startIdx: number, endIdx: number): string {
  return `${lineId}:${startIdx}:${endIdx}`;
}

export function WordSelector({
  text,
  lineId,
  translation,
  savedWordIds,
  onSaveWord,
  onSaveLine,
  className,
}: WordSelectorProps) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Dismiss pill on outside click
  useEffect(() => {
    if (!selection) return;

    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setSelection(null);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [selection]);

  const tokens = tokenize(text);
  const wordTokens = tokens.filter((t) => t.isWord);

  const handleWordClick = useCallback(
    (wordIndex: number) => {
      setSelection((prev) => {
        if (!prev) {
          return { startIdx: wordIndex, endIdx: wordIndex };
        }
        // Check adjacency: extend selection if the clicked word is adjacent
        if (wordIndex === prev.startIdx - 1) {
          return { startIdx: wordIndex, endIdx: prev.endIdx };
        }
        if (wordIndex === prev.endIdx + 1) {
          return { startIdx: prev.startIdx, endIdx: wordIndex };
        }
        // If already in selection, deselect (toggle)
        if (wordIndex >= prev.startIdx && wordIndex <= prev.endIdx) {
          return null;
        }
        // Non-adjacent: start new selection
        return { startIdx: wordIndex, endIdx: wordIndex };
      });
    },
    []
  );

  const handleConfirm = useCallback(() => {
    if (!selection) return;
    const selectedWords = wordTokens.slice(selection.startIdx, selection.endIdx + 1);
    const phrase = selectedWords.map((t) => t.token).join(" ");
    const charStart = selectedWords[0].index;
    const lastWord = selectedWords[selectedWords.length - 1];
    const charEnd = lastWord.index + lastWord.token.length;
    onSaveWord(phrase, charStart, charEnd);
    setSelection(null);
  }, [selection, wordTokens, onSaveWord]);

  const handleDismiss = useCallback(() => {
    setSelection(null);
  }, []);

  if (!text.trim()) {
    return (
      <span className={className}>{"\u00A0"}</span>
    );
  }

  let wordIdx = 0;

  return (
    <div ref={containerRef} className={cn("relative inline", className)}>
      <span className="inline-flex items-center gap-0">
        {/* Save-line button */}
        <button
          type="button"
          onClick={onSaveLine}
          className="inline-flex items-center justify-center w-4 h-4 mr-1 rounded text-xs text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors flex-shrink-0"
          aria-label="Save whole line"
        >
          +
        </button>
      </span>
      <span className="inline">
        {tokens.map((t, i) => {
          if (!t.isWord) {
            return <span key={`ws-${i}`}>{t.token}</span>;
          }

          const currentWordIdx = wordIdx;
          wordIdx++;

          const isSelected =
            selection !== null &&
            currentWordIdx >= selection.startIdx &&
            currentWordIdx <= selection.endIdx;

          // Check if this word is already saved (check all possible saved ranges that include it)
          const isSaved = savedWordIds.has(
            getWordId(lineId, t.index, t.index + t.token.length)
          );

          return (
            <span
              key={`w-${i}`}
              role="button"
              tabIndex={0}
              onClick={() =>
                handleWordClick(currentWordIdx)
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleWordClick(currentWordIdx);
                }
              }}
              className={cn(
                "cursor-pointer rounded-sm px-0.5 -mx-0.5 transition-colors",
                "hover:bg-primary/15",
                isSelected && "bg-primary/20 text-primary",
                isSaved && "underline decoration-primary/40"
              )}
            >
              {t.token}
            </span>
          );
        })}
      </span>

      {/* Floating pill */}
      {selection !== null && (
        <div
          ref={pillRef}
          className="absolute left-0 mt-1 z-10 flex items-center gap-1.5 rounded-full border bg-popover px-3 py-1 text-xs shadow-md"
        >
          <span className="text-muted-foreground max-w-[200px] truncate">
            {translation || "No translation"}
          </span>
          <button
            type="button"
            onClick={handleConfirm}
            className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-xs"
            aria-label="Save word"
          >
            &#x2713;
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-muted text-muted-foreground hover:bg-muted/80 transition-colors text-xs"
            aria-label="Dismiss"
          >
            &#x2715;
          </button>
        </div>
      )}
    </div>
  );
}
