"use client";

import { useState } from "react";
import { track } from "@vercel/analytics";
import { Loader2 } from "lucide-react";
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

interface DownloadStatus {
  status: "idle" | "downloading" | "ready" | "error";
  progress: number;
}

import { supabase } from "../lib/supabase";

interface PhonePreviewProps {
  clip: Clip | null;
  videoId: string;
  dlStatus: DownloadStatus;
  totalDuration: number;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function PhonePreview({ clip, videoId, dlStatus, totalDuration }: PhonePreviewProps) {
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "1:1" | "16:9">("9:16");
  const [exporting, setExporting] = useState(false);
  const [exportDone, setExportDone] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const isTooLong = totalDuration > 600;

  async function handleExport() {
    if (!clip || (dlStatus.status !== "ready" && !isTooLong)) return;
    setExporting(true);
    setExportError(null);
    try {
      track("clip_export", { video_id: videoId, aspect_ratio: aspectRatio });
      supabase.from("clip_exports").insert([{ video_id: videoId, aspect_ratio: aspectRatio }]).then(({ error }) => {
        if (error) console.error(error);
      });
      const res = await fetch("/api/clip-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId,
          startSeconds: clip.startSeconds,
          endSeconds: clip.endSeconds,
          title: clip.title,
          aspectRatio,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Export failed");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${clip.title.replace(/[^a-z0-9\s]/gi, "").replace(/\s+/g, "_")}_${aspectRatio.replace(":", "x")}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportDone(true);
      setTimeout(() => setExportDone(false), 3000);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setExporting(false);
    }
  }

  if (!clip) {
    return (
      <div className="panel p-5">
        <div className="aspect-[9/16] rounded-2xl bg-gradient-to-b from-[var(--ln)] to-[var(--sf)] border-4 border-[var(--ln)] flex items-center justify-center">
          <span className="text-sm text-[var(--mu)]">Select a clip</span>
        </div>
      </div>
    );
  }

  const duration = clip.endSeconds - clip.startSeconds;
  const score = clip.viralityScore != null ? Math.round(clip.viralityScore * 100) : null;

  // Aspect ratio visual representation
  const previewAspect = aspectRatio === "9:16" ? "9/16" : aspectRatio === "1:1" ? "1/1" : "16/9";

  return (
    <div className="panel p-5">
      {/* Phone/Video mockup */}
      <div 
        className="relative mx-auto rounded-[22px] bg-black overflow-hidden flex flex-col justify-end p-5 border-[6px] border-[var(--ink)] transition-all duration-300 shadow-xl"
        style={{ aspectRatio: previewAspect, width: aspectRatio === "16:9" ? "100%" : "auto", maxWidth: aspectRatio === "9:16" ? 220 : aspectRatio === "1:1" ? 260 : "100%" }}
      >
        {/* YouTube Video Background */}
        {clip && (
          <div className="absolute inset-0 overflow-hidden select-none">
            <iframe
              key={`${clip.startSeconds}-${aspectRatio}`}
              src={`https://www.youtube.com/embed/${videoId}?autoplay=1&controls=0&modestbranding=1&start=${Math.floor(clip.startSeconds)}&end=${Math.floor(clip.endSeconds)}&loop=1&playlist=${videoId}&cc_load_policy=3&iv_load_policy=3&cc_lang_pref=xx`}
              allow="autoplay; encrypted-media"
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border-0"
              style={{
                height: aspectRatio === "16:9" ? "auto" : "100%",
                width: aspectRatio === "16:9" ? "100%" : "auto",
                aspectRatio: "16/9",
                minWidth: "100%",
                minHeight: "100%"
              }}
            />
          </div>
        )}

        {/* Progress bar */}
        <div className="absolute z-10 left-5 right-5 top-4 h-[3px] rounded-sm bg-white/30 pointer-events-none">
          <div className="h-full rounded-sm bg-white animate-pulse" style={{ width: '40%' }} />
        </div>
      </div>

      {/* Why JEV picked it */}
      <div className="mt-4 mb-4">
        <div className="flex items-center justify-between mb-1">
          <strong className="text-sm">Why Jev picked it:</strong>
          {clip && (
            <a 
              href={`https://youtube.com/watch?v=${videoId}&t=${Math.floor(clip.startSeconds)}s`} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-xs hover:text-[var(--ink)] hover:underline flex items-center gap-1 transition-colors text-[var(--ac)] dark:text-blue-400 font-medium"
            >
              Watch on YT ↗
            </a>
          )}
        </div>
        <p className="text-sm text-[var(--mu)] leading-relaxed">
          {clip.reason}
        </p>
      </div>

      {/* Aspect Ratio Toggle */}
      <div className="mb-4 bg-zinc-100 dark:bg-zinc-900 rounded-lg p-1 flex">
        {(["9:16", "1:1", "16:9"] as const).map((ratio) => (
          <button
            key={ratio}
            onClick={() => setAspectRatio(ratio)}
            className={clsx(
              "flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors",
              aspectRatio === ratio
                ? "bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-white"
                : "text-[var(--mu)] hover:text-[var(--ink)]"
            )}
          >
            {ratio}
          </button>
        ))}
      </div>

      {/* Download and Export UI */}
      {process.env.NEXT_PUBLIC_DISABLE_DOWNLOADS !== "true" && (
        <>
          {/* Background Download Status */}
          {!isTooLong && dlStatus.status === "downloading" && (
            <div className="mb-3 text-xs">
              <div className="flex justify-between text-[var(--mu)] mb-1">
                <span>Downloading high-res video...</span>
                <span>{Math.round(dlStatus.progress)}%</span>
              </div>
              <div className="h-1.5 w-full bg-[var(--ln)] rounded-full overflow-hidden">
                <div 
                  className="h-full bg-[var(--ac)] transition-all duration-300" 
                  style={{ width: `${dlStatus.progress}%` }} 
                />
              </div>
            </div>
          )}
          
          {!isTooLong && dlStatus.status === "ready" && (
            <div className="mb-3 text-xs flex justify-between items-center text-emerald-600 dark:text-emerald-500 font-medium bg-emerald-500/10 px-3 py-2 rounded-lg border border-emerald-500/20">
              <span>High-res video downloaded</span>
              <span>✓ Ready to export</span>
            </div>
          )}
          
          {!isTooLong && dlStatus.status === "error" && (
            <p className="text-xs text-red-500 mb-3">Background download failed.</p>
          )}

          {exportError && (
            <p className="text-xs text-red-500 mb-3">{exportError}</p>
          )}

          {/* Export clip */}
          {isTooLong && (
            <p className="text-xs text-amber-600 dark:text-amber-500 mb-3 text-center">
              Video is over 10 mins. Pre-downloading is disabled for long videos. You can still browse JEV clips above.
            </p>
          )}
          <button
            onClick={handleExport}
            disabled={isTooLong || exporting || dlStatus.status !== "ready"}
            className={clsx(
              "w-full rounded-lg py-2.5 text-sm font-semibold transition",
              isTooLong || dlStatus.status !== "ready"
                 ? "bg-[var(--ln)] text-[var(--mu)] cursor-not-allowed opacity-70"
                 : exporting
                 ? "bg-[var(--ln)] text-[var(--mu)] cursor-wait"
                 : exportDone
                 ? "bg-emerald-600 text-white"
                 : "bg-[var(--ink)] text-[var(--bg)] hover:bg-[var(--ac)] hover:text-[var(--acink)]"
            )}
          >
            {isTooLong ? (
              "Export disabled (> 10m)"
            ) : dlStatus.status !== "ready" ? (
              "Preparing video..."
            ) : exporting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                Exporting…
              </span>
            ) : exportDone ? (
              "Downloaded ✓"
            ) : (
              `Export clip · ${duration}s`
            )}
          </button>
        </>
      )}

      {/* Score badge */}
      {score != null && (
        <div className="mt-4 text-center text-xs text-[var(--mu)]">
          JEV score: <span className="font-semibold text-[var(--ink)]">{score}</span>
        </div>
      )}
    </div>
  );
}
