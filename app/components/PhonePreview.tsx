"use client";

import { useState } from "react";
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

interface PhonePreviewProps {
  clip: Clip | null;
  videoId: string;
  dlStatus: DownloadStatus;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function PhonePreview({ clip, videoId, dlStatus }: PhonePreviewProps) {
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "1:1" | "16:9">("9:16");
  const [exporting, setExporting] = useState(false);
  const [exportDone, setExportDone] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function handleExport() {
    if (!clip || dlStatus.status !== "ready") return;
    setExporting(true);
    setExportError(null);
    try {
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

  // Build caption with highlight
  const words = clip.hook.split(" ");
  const captionHtml =
    words.slice(0, 5).join(" ") +
    ' <mark style="background:var(--mk);color:var(--mkink);padding:0 3px;border-radius:3px">' +
    words.slice(5, 8).join(" ") +
    "</mark> " +
    words.slice(8).join(" ");

  const duration = clip.endSeconds - clip.startSeconds;
  const score = clip.viralityScore != null ? Math.round(clip.viralityScore * 100) : null;

  // Aspect ratio visual representation
  const previewAspect = aspectRatio === "9:16" ? "9/16" : aspectRatio === "1:1" ? "1/1" : "16/9";

  return (
    <div className="panel p-5">
      {/* Phone/Video mockup */}
      <div 
        className="relative mx-auto rounded-[22px] bg-gradient-to-br from-[#20306e] to-[#0d1330] overflow-hidden flex flex-col justify-end p-5 border-[6px] border-[var(--ink)] transition-all duration-300"
        style={{ aspectRatio: previewAspect, width: aspectRatio === "16:9" ? "100%" : "auto", maxWidth: aspectRatio === "9:16" ? 220 : aspectRatio === "1:1" ? 260 : "100%" }}
      >
        {/* Progress bar */}
        <div className="absolute left-5 right-5 top-4 h-[3px] rounded-sm bg-white/20">
          <div className="h-full w-[34%] rounded-sm bg-white" />
        </div>

        {/* Caption */}
        <div
          className={clsx(
            "font-extrabold leading-tight text-white tracking-tight",
            aspectRatio === "9:16" ? "text-xl" : "text-sm"
          )}
          style={{ textShadow: "0 2px 8px rgba(0,0,0,.5)" }}
          dangerouslySetInnerHTML={{ __html: captionHtml }}
        />
      </div>

      {/* Why JEV picked it */}
      <p className="text-sm text-[var(--mu)] mt-4 mb-4 leading-relaxed">
        <strong>Why Jev picked it:</strong> {clip.reason}
      </p>

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

      {/* Background Download Status */}
      {dlStatus.status === "downloading" && (
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
      
      {dlStatus.status === "error" && (
        <p className="text-xs text-red-500 mb-3">Background download failed.</p>
      )}

      {exportError && (
        <p className="text-xs text-red-500 mb-3">{exportError}</p>
      )}

      {/* Export clip */}
      <button
        onClick={handleExport}
        disabled={exporting || dlStatus.status !== "ready"}
        className={clsx(
          "w-full rounded-lg py-2.5 text-sm font-semibold transition",
          dlStatus.status !== "ready"
             ? "bg-[var(--ln)] text-[var(--mu)] cursor-not-allowed opacity-70"
             : exporting
             ? "bg-[var(--ln)] text-[var(--mu)] cursor-wait"
             : exportDone
             ? "bg-emerald-600 text-white"
             : "bg-[var(--ink)] text-[var(--bg)] hover:bg-[var(--ac)] hover:text-[var(--acink)]"
        )}
      >
        {dlStatus.status !== "ready" ? (
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

      {/* Score badge */}
      {score != null && (
        <div className="mt-3 text-center text-xs text-[var(--mu)]">
          JEV score: <span className="font-semibold text-[var(--ink)]">{score}</span>
        </div>
      )}
    </div>
  );
}
