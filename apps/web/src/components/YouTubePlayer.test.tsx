import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { render } from "@testing-library/react";
import { createRef } from "react";
import { YouTubePlayer } from "./YouTubePlayer";
import type { YouTubePlayerHandle } from "./YouTubePlayer";

const originalAppendChild = document.head.appendChild.bind(document.head);

describe("YouTubePlayer", () => {
  beforeEach(() => {
    document.head.appendChild = ((node: Node) => {
      if (node instanceof HTMLScriptElement) {
        return node;
      }
      return originalAppendChild(node);
    }) as typeof document.head.appendChild;
  });

  afterEach(() => {
    document.head.appendChild = originalAppendChild;
  });

  test("renders 'No video available' when videoId is undefined", () => {
    const { container } = render(<YouTubePlayer videoId={undefined} />);
    expect(container.textContent).toContain("No video available");
  });

  test("renders a container div when videoId is provided", () => {
    const { container } = render(<YouTubePlayer videoId="dQw4w9WgXcQ" />);
    expect(container.textContent).not.toContain("No video available");
  });

  test("accepts a ref without crashing", () => {
    const ref = createRef<YouTubePlayerHandle>();
    const { container } = render(
      <YouTubePlayer ref={ref} videoId={undefined} />
    );
    expect(container).toBeDefined();
  });

  test("ref methods return safe defaults when no player is loaded", () => {
    const ref = createRef<YouTubePlayerHandle>();
    render(<YouTubePlayer ref={ref} videoId={undefined} />);
    expect(ref.current?.getCurrentTime()).toBe(0);
    expect(ref.current?.getPlayerState()).toBe(-1);
  });
});
