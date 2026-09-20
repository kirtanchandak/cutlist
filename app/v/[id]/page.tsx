"use client";

import { useState, useEffect, use } from "react";
import clsx from "clsx";
import { ClipList } from "../../components/ClipList";
import { TranscriptView } from "../../components/TranscriptView";
import { PhonePreview } from "../../components/PhonePreview";
import { Timeline } from "../../components/Timeline";
import { WaitlistForm } from "../../components/WaitlistForm";

interface Clip {
  title: string;
  startSeconds: number;
  endSeconds: number;
  reason: string;
  hook: string;
  viralityScore?: number;
  contentType?: string;
}

interface TranscriptLine {
  seconds: number;
  text: string;
}

type Section = 2 | 3 | "error";

const STEPS = [
  "Fetching the transcript",
  "Jev is reading it in sections",
  "Marking the strongest moments",
];

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface DownloadStatus {
  status: "idle" | "downloading" | "ready" | "error";
  progress: number;
}

export default function WorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: videoId } = use(params);
  
  const [section, setSection] = useState<Section>(2);
  const [clips, setClips] = useState<Clip[]>([]);
  const [transcriptLines, setTranscriptLines] = useState<TranscriptLine[]>([]);
  const [totalDuration, setTotalDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [activeClipIndex, setActiveClipIndex] = useState<number | null>(null);
  const [loadingStep, setLoadingStep] = useState(0);
  const [isDark, setIsDark] = useState(true);
  
  // Background download status
  const [dlStatus, setDlStatus] = useState<DownloadStatus>({ status: "idle", progress: 0 });
  const [totalCost, setTotalCost] = useState<number | null>(null);

  const activeClip = activeClipIndex !== null ? clips[activeClipIndex] ?? null : null;

  // Theme toggle
  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? "dark" : "light";
  }, [isDark]);

  // Download polling
  useEffect(() => {
    if (section !== 3 || !videoId || dlStatus.status === "ready" || dlStatus.status === "error") {
      return;
    }

    let interval: ReturnType<typeof setInterval>;

    const poll = async () => {
      try {
        const res = await fetch(`/api/video-status?videoId=${videoId}`);
        const data = await res.json();
        setDlStatus(data);
        if (data.status === "ready" || data.status === "error") {
          clearInterval(interval);
        }
      } catch (err) {
        console.error("Polling error", err);
      }
    };

    poll(); // Initial check
    interval = setInterval(poll, 1500);

    return () => clearInterval(interval);
  }, [section, videoId, dlStatus.status]);

  // Main processing logic
  useEffect(() => {
    let isCancelled = false;

    async function processVideo() {
      try {
        setSection(2);
        setLoadingStep(0);
        
        // Step 1: Fetch transcript
        await new Promise((r) => setTimeout(r, 400));
        const tRes = await fetch("/api/transcript", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoUrl: videoId }), // extractVideoId treats this correctly
        });
        const tData = await tRes.json();
        if (!tRes.ok) throw new Error(tData.error || "Failed to fetch transcript");
        if (isCancelled) return;

        setTranscriptLines(tData.lines || []);
        setTotalDuration(tData.totalDuration || 0);

        // Step 2: JEV analysis
        setLoadingStep(1);
        await new Promise((r) => setTimeout(r, 200));
        const cRes = await fetch("/api/clips", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript: tData.transcript, videoId: tData.videoId }),
        });
        const cData = await cRes.json();
        if (isCancelled) return;

        // Step 3: Done
        setLoadingStep(2);
        await new Promise((r) => setTimeout(r, 400));

        if (!cRes.ok) throw new Error(cData.error || "JEV failed to find clips");
        if (isCancelled) return;

        setClips(cData.clips);
        setTotalCost(cData.totalCost);
        setActiveClipIndex(0);
        setSection(3);
        
        // Trigger background download only if <= 10 mins
        if (tData.totalDuration <= 600) {
          fetch("/api/prepare-video", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ videoId: tData.videoId }),
          }).catch(err => console.error("Failed to start download", err));
        }

      } catch (err) {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : "Something went wrong");
          setSection("error");
        }
      }
    }

    processVideo();

    return () => {
      isCancelled = true;
    };
  }, [videoId]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex justify-between items-center px-7 py-5">
        <a href="/" className="text-xl font-extrabold tracking-tight hover:opacity-80 transition-opacity">
          <span
            className="inline-block w-3.5 h-3.5 border-2 border-[var(--ink)] mr-2 -rotate-[8deg]"
            style={{ background: "var(--mk)" }}
          />
          ClipJev
        </a>
        <button
          onClick={() => setIsDark(!isDark)}
          className="ghost text-sm"
          style={{
            background: "none",
            border: "1px solid var(--ln)",
            borderRadius: 8,
            padding: "6px 12px",
            color: "var(--mu)",
            cursor: "pointer",
          }}
        >
          Theme
        </button>
      </header>

      <main className="max-w-[1240px] mx-auto px-7 pb-16 flex-1 w-full">
        {/* ─── SECTION 2: Analyzing ─── */}
        {section === 2 && (
          <section className="pt-[12vh] max-w-[560px]">
            <h2 className="text-[34px] tracking-[-0.03em] font-extrabold mb-6">
              Looking for your best moments
            </h2>
            <div>
              {STEPS.map((stepText, i) => (
                <div
                  key={i}
                  className={clsx(
                    "flex gap-3 items-center py-3 border-b border-[var(--ln)]",
                    i < loadingStep ? "text-[var(--ink)]" : i === loadingStep ? "text-[var(--ink)]" : "text-[var(--mu)]"
                  )}
                >
                  <span
                    className={clsx(
                      "w-5 h-5 rounded-full border-2 flex-none",
                      i < loadingStep
                        ? "bg-[var(--ac)] border-[var(--ac)]"
                        : i === loadingStep
                        ? "border-[var(--ac)] border-t-transparent animate-spin"
                        : "border-[var(--ln)]"
                    )}
                  />
                  <span className="text-base">{stepText}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ─── ERROR STATE ─── */}
        {section === "error" && (
          <section className="pt-[12vh] max-w-[560px]">
            <h2 className="text-[34px] tracking-[-0.03em] font-extrabold mb-4 text-red-500">
              Analysis failed
            </h2>
            <p className="text-lg text-[var(--mu)] mb-8">
              {error}
            </p>
            <a 
              href="/"
              className="px-7 py-3 font-semibold text-base transition-colors rounded-xl inline-block"
              style={{ background: "var(--ink)", color: "var(--bg)" }}
            >
              Try another video
            </a>
          </section>
        )}

        {/* ─── SECTION 3: Workspace ─── */}
        {section === 3 && clips.length > 0 && (
          <section>
            {/* Title bar */}
            <div className="flex justify-between items-baseline gap-4 flex-wrap my-2 mb-5">
              <h2 className="text-[28px] tracking-[-0.03em] font-extrabold m-0">
                Best clips found
              </h2>
              <span className="font-mono text-xs text-[var(--mu)]">
                {formatDuration(totalDuration)} · {clips.length} clip{clips.length !== 1 ? "s" : ""} found
                {totalCost != null && ` · JEV cost: $${totalCost.toFixed(4)}`}
              </span>
            </div>

            {/* Timeline */}
            <div className="mb-5">
              <Timeline
                clips={clips}
                totalDuration={totalDuration}
                activeIndex={activeClipIndex}
                onClipClick={setActiveClipIndex}
              />
            </div>

            {/* Three columns */}
            <div className="grid gap-5 items-start grid-cols-1 lg:grid-cols-[330px_minmax(0,1fr)_270px]">
              {/* Left: Clip list */}
              <ClipList
                clips={clips}
                activeIndex={activeClipIndex}
                onClipClick={setActiveClipIndex}
              />

              {/* Center: Transcript */}
              <TranscriptView
                lines={transcriptLines}
                activeClip={
                  activeClip
                    ? { startSeconds: activeClip.startSeconds, endSeconds: activeClip.endSeconds }
                    : null
                }
              />

              {/* Right: Phone preview */}
              <div className="sticky top-6">
                <PhonePreview
                  clip={activeClip}
                  videoId={videoId}
                  dlStatus={dlStatus}
                  totalDuration={totalDuration}
                />
              </div>
            </div>
          </section>
        )}
      </main>

      <WaitlistForm />
    </div>
  );
}
