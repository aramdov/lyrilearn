import { SearchBar } from "./SearchBar";

interface HeaderProps {
  onSearch: (query: string) => void;
  isSearching: boolean;
  onGoHome?: () => void;
  onFlashcards?: () => void;
  flashcardCount?: number;
}

export function Header({ onSearch, isSearching, onGoHome, onFlashcards, flashcardCount }: HeaderProps) {
  return (
    <header className="border-b bg-background sticky top-0 z-10">
      <div className="container mx-auto px-4 py-3 flex items-center gap-4">
        <button
          onClick={onGoHome}
          className="text-xl font-bold shrink-0 hover:opacity-70 transition-opacity"
        >
          LyriLearn
        </button>
        <SearchBar onSearch={onSearch} isLoading={isSearching} />
        {onFlashcards && (
          <button
            onClick={onFlashcards}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0 relative"
          >
            Flashcards
            {(flashcardCount ?? 0) > 0 && (
              <span className="absolute -top-1.5 -right-3 bg-primary text-primary-foreground text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                {flashcardCount! > 99 ? "99+" : flashcardCount}
              </span>
            )}
          </button>
        )}
      </div>
    </header>
  );
}
