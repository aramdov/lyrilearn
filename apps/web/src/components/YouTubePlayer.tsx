import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export interface YouTubePlayerHandle {
  getCurrentTime: () => number;
  getPlayerState: () => number;
}

interface YouTubePlayerProps {
  videoId: string | undefined;
}

let apiLoaded = false;
let apiReady = false;
const readyCallbacks: (() => void)[] = [];

function loadYouTubeAPI(): Promise<void> {
  if (apiReady) return Promise.resolve();
  return new Promise((resolve) => {
    readyCallbacks.push(resolve);
    if (!apiLoaded) {
      apiLoaded = true;
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
      window.onYouTubeIframeAPIReady = () => {
        apiReady = true;
        readyCallbacks.forEach((cb) => cb());
        readyCallbacks.length = 0;
      };
    }
  });
}

export const YouTubePlayer = forwardRef<YouTubePlayerHandle, YouTubePlayerProps>(
  function YouTubePlayer({ videoId }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<any>(null);

    useImperativeHandle(ref, () => ({
      getCurrentTime: () => playerRef.current?.getCurrentTime?.() ?? 0,
      getPlayerState: () => playerRef.current?.getPlayerState?.() ?? -1,
    }));

    useEffect(() => {
      if (!videoId) return;

      let cancelled = false;

      loadYouTubeAPI().then(() => {
        if (cancelled || !containerRef.current) return;

        if (playerRef.current) {
          playerRef.current.destroy();
          playerRef.current = null;
        }

        playerRef.current = new window.YT.Player(containerRef.current, {
          videoId,
          width: "100%",
          height: "100%",
          playerVars: {
            autoplay: 0,
            modestbranding: 1,
            rel: 0,
          },
        });
      });

      return () => {
        cancelled = true;
        if (playerRef.current) {
          playerRef.current.destroy();
          playerRef.current = null;
        }
      };
    }, [videoId]);

    if (!videoId) {
      return (
        <div className="w-full aspect-video bg-muted rounded-lg flex items-center justify-center text-muted-foreground">
          No video available
        </div>
      );
    }

    return (
      <div className="w-full aspect-video rounded-lg overflow-hidden">
        <div ref={containerRef} className="w-full h-full" />
      </div>
    );
  }
);
