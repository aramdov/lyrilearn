import { useState, useEffect, useCallback } from "react";
import type { FlashcardEntry } from "@lyrilearn/shared";
import { Button } from "@/components/ui/button";
import { getCards, getCardsBySong, getSongDecks } from "@/lib/db";
import { FlashcardReview } from "./FlashcardReview";

// ─── Types ──────────────────────────────────────────────────

interface FlashcardDeckProps {
  onBack: () => void;
}

interface SongDeck {
  songId: number;
  songTitle: string;
  artist: string;
  artworkUrl?: string;
  cardCount: number;
}

interface ActiveReview {
  cards: FlashcardEntry[];
  deckTitle: string;
  deckType: "all" | "song";
  songId?: number;
}

// ─── Component ──────────────────────────────────────────────

export function FlashcardDeck({ onBack }: FlashcardDeckProps) {
  const [decks, setDecks] = useState<SongDeck[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeReview, setActiveReview] = useState<ActiveReview | null>(null);

  const loadDecks = useCallback(async () => {
    setLoading(true);
    const [songDecks, allCards] = await Promise.all([
      getSongDecks(),
      getCards(),
    ]);
    setDecks(songDecks);
    setTotalCount(allCards.length);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadDecks();
  }, [loadDecks]);

  // ─── Start review for a specific song deck ─────────────────

  async function startSongReview(deck: SongDeck) {
    const cards = await getCardsBySong(deck.songId);
    setActiveReview({
      cards,
      deckTitle: deck.songTitle,
      deckType: "song",
      songId: deck.songId,
    });
  }

  // ─── Start review for all songs ─────────────────────────────

  async function startAllReview() {
    const cards = await getCards();
    setActiveReview({
      cards,
      deckTitle: "All Songs",
      deckType: "all",
    });
  }

  // ─── Exit review and reload decks ───────────────────────────

  function handleExitReview() {
    setActiveReview(null);
    loadDecks();
  }

  // ─── Render active review ───────────────────────────────────

  if (activeReview) {
    return (
      <FlashcardReview
        cards={activeReview.cards}
        deckTitle={activeReview.deckTitle}
        deckType={activeReview.deckType}
        songId={activeReview.songId}
        onExit={handleExitReview}
      />
    );
  }

  // ─── Loading state ──────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Loading decks...</p>
      </div>
    );
  }

  // ─── Empty state ────────────────────────────────────────────

  if (totalCount === 0) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h2 className="mb-2 text-xl font-semibold">No flashcards yet</h2>
        <p className="mb-6 text-muted-foreground">
          Search for a song and tap words or lines to save them as flashcards.
        </p>
        <Button onClick={onBack}>Back to Search</Button>
      </div>
    );
  }

  // ─── Deck list ──────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Flashcards</h2>
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back
        </Button>
      </div>

      <div className="space-y-3">
        {/* "All Songs" deck — only shown when more than 1 song has cards */}
        {decks.length > 1 && (
          <button
            onClick={startAllReview}
            className="w-full rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent"
          >
            <p className="font-medium">All Songs</p>
            <p className="text-sm text-muted-foreground">
              {totalCount} cards &middot; shuffled mix
            </p>
          </button>
        )}

        {/* Per-song decks */}
        {decks.map((deck) => (
          <button
            key={deck.songId}
            onClick={() => startSongReview(deck)}
            className="w-full rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent"
          >
            <p className="font-medium">{deck.songTitle}</p>
            <p className="text-sm text-muted-foreground">
              {deck.artist} &middot; {deck.cardCount}{" "}
              {deck.cardCount === 1 ? "card" : "cards"}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
