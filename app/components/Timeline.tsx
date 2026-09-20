"use client";

import clsx from "clsx";

interface TimelineProps {
  clips: { startSeconds: number; endSeconds: number }[];
  totalDuration: number;
  activeIndex: number | null;
  onClipClick: (index: number) => void;
}

export function Timeline({ clips, totalDuration, activeIndex, onClipClick }: TimelineProps) {
  if (totalDuration <= 0) return null;

  return (
    <div
      className="relative h-11 rounded-xl border border-[var(--ln)] bg-[var(--sf)] overflow-hidden"
      role="group"
      aria-label="Clip positions in the video"
    >
      {clips.map((clip, i) => {
        const left = (clip.startSeconds / totalDuration) * 100;
        const width = Math.max(((clip.endSeconds - clip.startSeconds) / totalDuration) * 100, 0.5);
        return (
          <button
            key={i}
            onClick={() => onClipClick(i)}
            className={clsx(
              "absolute top-1.5 bottom-1.5 min-w-1.5 rounded transition-all",
              activeIndex === i
                ? "bg-[var(--mk)] opacity-100 outline outline-2 outline-[var(--ink)] z-10"
                : "bg-[var(--mk)] opacity-45 hover:opacity-75"
            )}
            style={{ left: `${left}%`, width: `${width}%` }}
            aria-label={`Clip ${i + 1}`}
          />
        );
      })}
    </div>
  );
}
