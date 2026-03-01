import { useState, useEffect, useRef, useCallback } from "react";
import type { FlashcardEntry, ReviewSession } from "@lyrilearn/shared";
import { Button } from "@/components/ui/button";
import { saveReviewSession } from "@/lib/db";

// ─── Props ──────────────────────────────────────────────────

interface FlashcardReviewProps {
  cards: FlashcardEntry[];
  deckTitle: string;
  deckType: "all" | "song";
  songId?: number;
  onExit: () => void;
}

// ─── Fisher-Yates shuffle ───────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Component ──────────────────────────────────────────────

export function FlashcardReview({
  cards: inputCards,
  deckTitle,
  deckType,
  songId,
  onExit,
}: FlashcardReviewProps) {
  const [cards, setCards] = useState(() => shuffle(inputCards));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [results, setResults] = useState<{
    knewIt: FlashcardEntry[];
    needPractice: FlashcardEntry[];
  }>({ knewIt: [], needPractice: [] });
  const [showSummary, setShowSummary] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState<
    "left" | "right" | null
  >(null);

  // Swipe refs
  const cardRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const currentX = useRef(0);
  const isDragging = useRef(false);

  // ── Answer handler ──────────────────────────────────────────

  const handleAnswer = useCallback(
    (knewIt: boolean) => {
      if (!isFlipped) return;

      const current = cards[currentIndex];
      setResults((prev) => ({
        knewIt: knewIt ? [...prev.knewIt, current] : prev.knewIt,
        needPractice: !knewIt ? [...prev.needPractice, current] : prev.needPractice,
      }));

      // Animate exit
      setSwipeDirection(knewIt ? "right" : "left");

      setTimeout(() => {
        setSwipeDirection(null);
        setIsFlipped(false);

        if (currentIndex < cards.length - 1) {
          setCurrentIndex((i) => i + 1);
        } else {
          setShowSummary(true);
        }
      }, 300);
    },
    [currentIndex, cards, isFlipped],
  );

  // ── Save session when summary appears ───────────────────────

  useEffect(() => {
    if (!showSummary) return;

    const session: ReviewSession = {
      id: `review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      date: Date.now(),
      deckType,
      songId,
      songTitle: deckType === "song" ? deckTitle : undefined,
      cardCount: cards.length,
      knewIt: results.knewIt.length,
      needPractice: results.needPractice.length,
    };

    saveReviewSession(session).catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSummary]);

  // ── Keyboard ────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (showSummary) return;

      if ((e.key === " " || e.key === "Enter") && !isFlipped) {
        e.preventDefault();
        setIsFlipped(true);
      } else if (e.key === "ArrowRight" && isFlipped) {
        e.preventDefault();
        handleAnswer(true);
      } else if (e.key === "ArrowLeft" && isFlipped) {
        e.preventDefault();
        handleAnswer(false);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleAnswer, isFlipped, showSummary]);

  // ── Pointer / swipe handlers ────────────────────────────────

  const onPointerDown = (e: React.PointerEvent) => {
    isDragging.current = true;
    startX.current = e.clientX;
    currentX.current = e.clientX;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    currentX.current = e.clientX;
    const diff = currentX.current - startX.current;

    if (cardRef.current) {
      cardRef.current.style.transform = `translateX(${diff}px) rotate(${diff * 0.05}deg)`;
      cardRef.current.style.transition = "none";
    }
  };

  const onPointerUp = () => {
    if (!isDragging.current) return;
    isDragging.current = false;

    const diff = currentX.current - startX.current;

    if (cardRef.current) {
      cardRef.current.style.transition = "transform 0.3s ease-out";
      cardRef.current.style.transform = "";
    }

    if (Math.abs(diff) > 100 && isFlipped) {
      handleAnswer(diff > 0);
    }
  };

  // ── Retry missed ────────────────────────────────────────────

  const retryMissed = () => {
    setCards(shuffle(results.needPractice));
    setCurrentIndex(0);
    setIsFlipped(false);
    setResults({ knewIt: [], needPractice: [] });
    setShowSummary(false);
  };

  // ── Summary screen ──────────────────────────────────────────

  if (showSummary) {
    const total = cards.length;
    const knewCount = results.knewIt.length;
    const missedCount = results.needPractice.length;
    const pct = total > 0 ? Math.round((knewCount / total) * 100) : 0;

    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background p-6">
        <div className="max-w-sm w-full text-center space-y-6">
          <div
            className="font-bold text-primary"
            style={{ fontSize: "clamp(4rem, 15vw, 8rem)" }}
          >
            {pct}%
          </div>

          <p className="text-muted-foreground text-lg">
            {knewCount} knew it &middot; {missedCount} need practice
          </p>

          <div className="flex flex-col gap-3 pt-4">
            {missedCount > 0 && (
              <Button onClick={retryMissed} size="lg" className="w-full">
                Retry Missed ({missedCount})
              </Button>
            )}
            <Button onClick={onExit} variant="outline" size="lg" className="w-full">
              Done
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main review UI ──────────────────────────────────────────

  const card = cards[currentIndex];
  const progress = ((currentIndex + 1) / cards.length) * 100;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <Button variant="ghost" size="sm" onClick={onExit}>
          Exit
        </Button>
        <span className="text-sm font-medium truncate max-w-[50%]">
          {deckTitle}
        </span>
        <span className="text-sm text-muted-foreground">
          {currentIndex + 1} / {cards.length}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-muted mx-4 rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Card area */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-6">
        <div
          ref={cardRef}
          className="relative w-full max-w-md aspect-[3/4] select-none"
          style={{
            touchAction: "none",
            transform:
              swipeDirection === "right"
                ? "translateX(100%) rotate(12deg)"
                : swipeDirection === "left"
                  ? "translateX(-100%) rotate(-12deg)"
                  : undefined,
            opacity: swipeDirection ? 0 : 1,
            transition: "transform 0.3s ease-out, opacity 0.3s ease-out",
          }}
          onClick={() => {
            if (!isFlipped && !isDragging.current) setIsFlipped(true);
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {/* Front */}
          <div
            className="absolute inset-0 rounded-2xl border bg-white shadow-lg flex flex-col items-center justify-center p-6 cursor-pointer"
            style={{
              opacity: isFlipped ? 0 : 1,
              visibility: isFlipped ? "hidden" : "visible",
              transition: "opacity 0.2s ease-out",
            }}
          >
            <div
              className="font-bold text-center break-words w-full"
              style={{ fontSize: "clamp(1.5rem, 8vw, 3rem)" }}
            >
              {card.source}
            </div>

            {card.type === "word" && card.context && (
              <p className="mt-4 text-sm text-muted-foreground text-center line-clamp-2">
                {card.context}
              </p>
            )}

            <span className="absolute bottom-4 text-xs text-muted-foreground">
              Tap to flip
            </span>
          </div>

          {/* Back */}
          <div
            className="absolute inset-0 rounded-2xl bg-primary text-primary-foreground shadow-lg flex flex-col items-center justify-center p-6 cursor-pointer"
            style={{
              opacity: isFlipped ? 1 : 0,
              visibility: isFlipped ? "visible" : "hidden",
              transition: "opacity 0.2s ease-out",
            }}
          >
            <div
              className="font-bold text-center break-words w-full"
              style={{ fontSize: "clamp(1.25rem, 6vw, 2.5rem)" }}
            >
              {card.target}
            </div>

            {card.transliteration && (
              <p className="mt-3 italic text-center opacity-70 text-base">
                {card.transliteration}
              </p>
            )}

            <div className="absolute bottom-4 text-xs opacity-60 text-center">
              {card.songTitle} &mdash; {card.artist}
            </div>
          </div>
        </div>

        {/* Answer buttons — visible only when flipped */}
        <div
          className="flex items-center gap-6 mt-8 transition-opacity duration-200"
          style={{ opacity: isFlipped ? 1 : 0, pointerEvents: isFlipped ? "auto" : "none" }}
        >
          <button
            onClick={() => handleAnswer(false)}
            className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold bg-destructive/15 text-destructive hover:scale-110 active:scale-95 transition-transform"
            title="Need practice (ArrowLeft)"
          >
            &#x2717;
          </button>

          <span className="text-xs text-muted-foreground hidden sm:block">
            ← practice | knew it →
          </span>

          <button
            onClick={() => handleAnswer(true)}
            className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold bg-green-100 text-green-700 hover:scale-110 active:scale-95 transition-transform"
            title="Knew it (ArrowRight)"
          >
            &#x2713;
          </button>
        </div>

        {/* Keyboard hint */}
        <p className="mt-4 text-xs text-muted-foreground hidden sm:block">
          Space to flip &middot; Arrow keys to answer
        </p>
      </div>
    </div>
  );
}
