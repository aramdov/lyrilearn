import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { FlashcardEntry, ReviewSession } from "@lyrilearn/shared";

// ─── Schema ──────────────────────────────────────────────────

interface LyriLearnDB extends DBSchema {
  flashcards: {
    key: string;
    value: FlashcardEntry;
    indexes: {
      "by-song": number;
      "by-created": number;
    };
  };
  reviewSessions: {
    key: string;
    value: ReviewSession;
    indexes: {
      "by-date": number;
    };
  };
}

// ─── Database singleton ──────────────────────────────────────

let dbPromise: Promise<IDBPDatabase<LyriLearnDB>> | null = null;

function getDB(): Promise<IDBPDatabase<LyriLearnDB>> {
  if (!dbPromise) {
    dbPromise = openDB<LyriLearnDB>("lyrilearn", 1, {
      upgrade(db) {
        const flashcardStore = db.createObjectStore("flashcards", {
          keyPath: "id",
        });
        flashcardStore.createIndex("by-song", "songId");
        flashcardStore.createIndex("by-created", "createdAt");

        const reviewStore = db.createObjectStore("reviewSessions", {
          keyPath: "id",
        });
        reviewStore.createIndex("by-date", "date");
      },
    });
  }
  return dbPromise;
}

// ─── Pure helpers ────────────────────────────────────────────

export function makeCardId(
  songId: number,
  sourceLang: string,
  type: "word" | "line",
  source: string
): string {
  return `${songId}-${sourceLang}-${type}-${source}`;
}

// ─── Flashcard CRUD ──────────────────────────────────────────

export async function saveCard(card: FlashcardEntry): Promise<void> {
  const db = await getDB();
  await db.put("flashcards", card);
}

export async function getCards(): Promise<FlashcardEntry[]> {
  const db = await getDB();
  return db.getAllFromIndex("flashcards", "by-created");
}

export async function getCardsBySong(
  songId: number
): Promise<FlashcardEntry[]> {
  const db = await getDB();
  return db.getAllFromIndex("flashcards", "by-song", songId);
}

export async function deleteCard(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("flashcards", id);
}

export async function getCardCount(): Promise<number> {
  const db = await getDB();
  return db.count("flashcards");
}

export async function getSavedCardIds(songId: number): Promise<Set<string>> {
  const db = await getDB();
  const cards = await db.getAllFromIndex("flashcards", "by-song", songId);
  return new Set(cards.map((c) => c.id));
}

export async function getSongDecks(): Promise<
  {
    songId: number;
    songTitle: string;
    artist: string;
    artworkUrl?: string;
    cardCount: number;
  }[]
> {
  const db = await getDB();
  const allCards = await db.getAll("flashcards");

  const deckMap = new Map<
    number,
    {
      songId: number;
      songTitle: string;
      artist: string;
      artworkUrl?: string;
      cardCount: number;
    }
  >();

  for (const card of allCards) {
    const existing = deckMap.get(card.songId);
    if (existing) {
      existing.cardCount++;
    } else {
      deckMap.set(card.songId, {
        songId: card.songId,
        songTitle: card.songTitle,
        artist: card.artist,
        cardCount: 1,
      });
    }
  }

  return Array.from(deckMap.values());
}

// ─── Review sessions ────────────────────────────────────────

export async function saveReviewSession(
  session: ReviewSession
): Promise<void> {
  const db = await getDB();
  await db.put("reviewSessions", session);
}

export async function getReviewSessions(): Promise<ReviewSession[]> {
  const db = await getDB();
  const sessions = await db.getAllFromIndex("reviewSessions", "by-date");
  return sessions.reverse();
}
