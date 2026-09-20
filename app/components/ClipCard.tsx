"use client";

import clsx from "clsx";

interface Clip {
  title: string;
  startSeconds: number;
  endSeconds: number;
  reason: string;
  hook: string;
  viralityScore?: number;
  contentType?: string;
}

interface ClipCardProps {
  clip: Clip;
  index: number;
  isActive: boolean;
  onClick: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ClipCard({ clip, index, isActive, onClick }: ClipCardProps) {
  const duration = clip.endSeconds - clip.startSeconds;
  const score = clip.viralityScore != null ? Math.round(clip.viralityScore * 100) : null;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className={clsx(
        "clip block w-full text-left border-b border-[var(--ln)] last:border-b-0 px-5 py-4 transition-colors",
        isActive && "bg-[var(--bg)] shadow-[inset_4px_0_0_var(--ac)]"
      )}
    >
      {/* Timestamp row */}
      <div className="flex justify-between items-center font-mono text-xs text-[var(--mu)] mb-1.5">
        <span>
          {formatTime(clip.startSeconds)}–{formatTime(clip.endSeconds)} · {duration}s
        </span>
        {score != null && (
          <span className="font-medium text-[var(--ink)]">{score}</span>
        )}
      </div>

      {/* Title */}
      <h3 className="text-lg font-semibold leading-snug tracking-tight text-[var(--ink)] mb-1">
        {clip.title}
      </h3>

      {/* Reason */}
      <p className="text-sm text-[var(--mu)] leading-relaxed line-clamp-2">
        {clip.reason}
      </p>
    </button>
  );
}
