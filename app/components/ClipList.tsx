"use client";

import { ClipCard } from "./ClipCard";

interface Clip {
  title: string;
  startSeconds: number;
  endSeconds: number;
  reason: string;
  hook: string;
  viralityScore?: number;
  contentType?: string;
}

interface ClipListProps {
  clips: Clip[];
  activeIndex: number | null;
  onClipClick: (index: number) => void;
}

export function ClipList({ clips, activeIndex, onClipClick }: ClipListProps) {
  return (
    <div className="panel" role="group" aria-label="Suggested clips">
      {clips.map((clip, i) => (
        <ClipCard
          key={`${clip.startSeconds}-${clip.endSeconds}`}
          clip={clip}
          index={i}
          isActive={activeIndex === i}
          onClick={() => onClipClick(i)}
        />
      ))}
    </div>
  );
}
