"use client";

import { useEffect, useRef, useCallback } from "react";

declare global {
  interface Window {
    YT: typeof YT;
    onYouTubeIframeAPIReady: () => void;
  }
}

interface VideoPlayerProps {
  videoId: string;
  activeClip: { startSeconds: number; endSeconds: number } | null;
  onReady?: () => void;
}

export function VideoPlayer({ videoId, activeClip, onReady }: VideoPlayerProps) {
  const playerRef = useRef<YT.Player | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const apiReadyRef = useRef(false);

  const initPlayer = useCallback(() => {
    if (!containerRef.current || playerRef.current) return;

    playerRef.current = new window.YT.Player("yt-player-iframe", {
      videoId,
      playerVars: {
        autoplay: 0,
        controls: 1,
        modestbranding: 1,
        rel: 0,
        playsinline: 1,
      },
      events: {
        onReady: () => onReady?.(),
      },
    });
  }, [videoId, onReady]);

  // Load the YouTube IFrame API
  useEffect(() => {
    if (window.YT && window.YT.Player) {
      apiReadyRef.current = true;
      initPlayer();
      return;
    }

    window.onYouTubeIframeAPIReady = () => {
      apiReadyRef.current = true;
      initPlayer();
    };

    if (!document.getElementById("yt-iframe-api")) {
      const script = document.createElement("script");
      script.id = "yt-iframe-api";
      script.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(script);
    }
  }, [initPlayer]);

  // Seek to active clip & auto-pause at end
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !activeClip) return;

    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    try {
      player.seekTo(activeClip.startSeconds, true);
      player.playVideo();
    } catch {
      // Player might not be ready yet
    }

    // Poll to pause at end time
    intervalRef.current = setInterval(() => {
      try {
        const current = player.getCurrentTime();
        if (current >= activeClip.endSeconds) {
          player.pauseVideo();
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
      } catch {
        // Player might not be ready
      }
    }, 250);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [activeClip]);

  return (
    <div ref={containerRef} className="flex flex-col gap-3">
      {/* Player embed */}
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-zinc-900 border border-zinc-800">
        <div id="yt-player-iframe" className="absolute inset-0 h-full w-full" />
      </div>

      {/* Clip region indicator */}
      {activeClip && (
        <div className="flex items-center gap-3 rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2.5">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-violet-600">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="white">
              <polygon points="2,1 8,5 2,9" />
            </svg>
          </div>
          <span className="text-xs text-zinc-400">
            Playing{" "}
            <span className="font-mono text-zinc-300">
              {formatTime(activeClip.startSeconds)}
            </span>
            {" → "}
            <span className="font-mono text-zinc-300">
              {formatTime(activeClip.endSeconds)}
            </span>
          </span>
          <span className="ml-auto text-xs text-zinc-600">
            {activeClip.endSeconds - activeClip.startSeconds}s clip
          </span>
        </div>
      )}
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
