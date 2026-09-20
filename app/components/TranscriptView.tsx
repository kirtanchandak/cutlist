"use client";

import { useEffect, useRef } from "react";
import clsx from "clsx";

interface TranscriptLine {
  seconds: number;
  text: string;
}

interface TranscriptViewProps {
  lines: TranscriptLine[];
  activeClip: { startSeconds: number; endSeconds: number } | null;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function TranscriptView({ lines, activeClip }: TranscriptViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);

  // Scroll to first active line when clip changes
  useEffect(() => {
    if (activeLineRef.current) {
      activeLineRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [activeClip]);

  function isLineInClip(line: TranscriptLine): boolean {
    if (!activeClip) return false;
    return line.seconds >= activeClip.startSeconds && line.seconds < activeClip.endSeconds;
  }

  // Find the index of the first highlighted line to attach the ref
  const firstActiveIdx = activeClip
    ? lines.findIndex((l) => l.seconds >= activeClip.startSeconds && l.seconds < activeClip.endSeconds)
    : -1;

  return (
    <div
      ref={containerRef}
      className="panel overflow-y-auto px-2 py-2.5"
      style={{ maxHeight: 540 }}
      aria-label="Transcript"
    >
      {lines.map((line, i) => {
        const active = isLineInClip(line);
        return (
          <div
            key={i}
            ref={i === firstActiveIdx ? activeLineRef : undefined}
            className={clsx(
              "grid gap-2 rounded-lg px-3 py-2",
              "grid-cols-[52px_1fr]"
            )}
          >
            <span className="font-mono text-xs text-[var(--mu)] pt-0.5">
              {formatTime(line.seconds)}
            </span>
            <span
              className={clsx(
                "text-sm leading-relaxed",
                active
                  ? "[&]:bg-[var(--mk)] [&]:text-[var(--mkink)] [box-decoration-break:clone] [-webkit-box-decoration-break:clone] px-1 rounded"
                  : "text-[var(--ink)]"
              )}
            >
              {line.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}
