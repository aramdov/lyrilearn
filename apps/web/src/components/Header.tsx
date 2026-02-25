import { SearchBar } from "./SearchBar";

interface HeaderProps {
  onSearch: (query: string) => void;
  isSearching: boolean;
}

export function Header({ onSearch, isSearching }: HeaderProps) {
  return (
    <header className="border-b bg-background sticky top-0 z-10">
      <div className="container mx-auto px-4 py-3 flex items-center gap-4">
        <h1 className="text-xl font-bold shrink-0">LyriLearn</h1>
        <SearchBar onSearch={onSearch} isLoading={isSearching} />
      </div>
    </header>
  );
}
