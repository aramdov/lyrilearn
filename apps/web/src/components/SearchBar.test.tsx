import { describe, test, expect, mock } from "bun:test";
import { render, within, fireEvent } from "@testing-library/react";
import { SearchBar } from "./SearchBar";

// ---------------------------------------------------------------------------
// SearchBar — unit tests
// ---------------------------------------------------------------------------
// The component renders a controlled <form> with a shadcn Input and Button.
// All queries are scoped to the `container` returned by `render` via
// `within(container)`, which isolates each test from DOM nodes that accumulate
// in happy-dom's shared document.body across test files in the same run.
// ---------------------------------------------------------------------------

/**
 * Renders SearchBar and returns a within-scoped query object bound to the
 * component's own container element.
 */
function renderSearchBar(props: {
  onSearch: (query: string) => void;
  isLoading: boolean;
}) {
  const { container } = render(<SearchBar {...props} />);
  return { q: within(container as HTMLElement), container };
}

describe("SearchBar", () => {
  // ── Rendering ─────────────────────────────────────────────────────────────

  test("renders input with placeholder text and a search button", () => {
    const { q } = renderSearchBar({
      onSearch: mock(() => {}),
      isLoading: false,
    });

    expect(q.getByPlaceholderText("Search for a song...")).toBeDefined();
    expect(q.getByRole("button", { name: "Search" })).toBeDefined();
  });

  // ── Happy-path submission ─────────────────────────────────────────────────

  test("calls onSearch with the trimmed query when the form is submitted", () => {
    const onSearch = mock((_query: string) => {});
    const { q } = renderSearchBar({ onSearch, isLoading: false });

    const input = q.getByPlaceholderText("Search for a song...");
    fireEvent.change(input, { target: { value: "  Bohemian Rhapsody  " } });

    fireEvent.submit(input.closest("form")!);

    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith("Bohemian Rhapsody");
  });

  // ── Empty / whitespace-only query ─────────────────────────────────────────

  test("does NOT call onSearch when the query is empty", () => {
    const onSearch = mock(() => {});
    const { q } = renderSearchBar({ onSearch, isLoading: false });

    // Input left at initial empty value — submit immediately.
    const input = q.getByPlaceholderText("Search for a song...");
    fireEvent.submit(input.closest("form")!);

    expect(onSearch).toHaveBeenCalledTimes(0);
  });

  test("does NOT call onSearch when the query contains only whitespace", () => {
    const onSearch = mock(() => {});
    const { q } = renderSearchBar({ onSearch, isLoading: false });

    const input = q.getByPlaceholderText("Search for a song...");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.submit(input.closest("form")!);

    expect(onSearch).toHaveBeenCalledTimes(0);
  });

  // ── Loading state ─────────────────────────────────────────────────────────

  test("shows 'Searching...' on the button and disables the input while isLoading is true", () => {
    const { q } = renderSearchBar({
      onSearch: mock(() => {}),
      isLoading: true,
    });

    // Button label changes to "Searching..."
    expect(q.getByRole("button", { name: "Searching..." })).toBeDefined();

    // Input must be disabled
    const input = q.getByPlaceholderText(
      "Search for a song..."
    ) as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });

  test("button is disabled while isLoading is true even when there is text", () => {
    const { q } = renderSearchBar({
      onSearch: mock(() => {}),
      isLoading: true,
    });

    const input = q.getByPlaceholderText("Search for a song...");
    fireEvent.change(input, { target: { value: "some song" } });

    const button = q.getByRole("button", {
      name: "Searching...",
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  // ── Button disabled when query is empty ───────────────────────────────────

  test("button is disabled when the query is empty and isLoading is false", () => {
    const { q } = renderSearchBar({
      onSearch: mock(() => {}),
      isLoading: false,
    });

    // No typing — query is still ""
    const button = q.getByRole("button", { name: "Search" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  test("button becomes enabled after the user types a non-empty query", () => {
    const { q } = renderSearchBar({
      onSearch: mock(() => {}),
      isLoading: false,
    });

    const input = q.getByPlaceholderText("Search for a song...");
    fireEvent.change(input, { target: { value: "Stairway to Heaven" } });

    const button = q.getByRole("button", { name: "Search" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });
});
