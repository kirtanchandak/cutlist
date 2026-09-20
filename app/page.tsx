"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { extractVideoId } from "./lib/utils";
import { WaitlistForm } from "./components/WaitlistForm";
import { supabase } from "./lib/supabase";

export default function Home() {
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [isDark, setIsDark] = useState(true);
  
  // Theme toggle
  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? "dark" : "light";
  }, [isDark]);

  // Analytics: Track page visit
  useEffect(() => {
    supabase.from("page_visits").insert([{ path: "/" }]).then(({ error }) => {
      if (error) console.error(error);
    });
  }, []);

  const router = useRouter();

  const handleSubmit = useCallback(() => {
    const trimmed = url.trim();
    if (!trimmed) return;

    const id = extractVideoId(trimmed);
    if (!id) {
      setError("Could not extract a valid YouTube video ID from the URL");
      return;
    }

    router.push(`/v/${id}`);
  }, [url, router]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex justify-between items-center px-7 py-5">
        <div className="text-xl font-extrabold tracking-tight">
          <span
            className="inline-block w-3.5 h-3.5 border-2 border-[var(--ink)] mr-2 -rotate-[8deg]"
            style={{ background: "var(--mk)" }}
          />
          ClipJev
        </div>
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
        {/* ─── SECTION 1: Landing ─── */}
        <section className="pt-[9vh] max-w-[820px]">
          <h1 className="text-[clamp(38px,6.2vw,72px)] leading-none tracking-[-0.04em] font-extrabold mb-5">
            Paste a video. Get the parts worth posting.
          </h1>
          <p className="text-lg text-[var(--mu)] max-w-[52ch] mb-8">
            ClipJev reads the transcript, picks the moments that hold attention,
            and cuts them for Reels and YouTube Shorts.
          </p>

          {/* URL input */}
          <div
            className="flex overflow-hidden rounded-xl"
            style={{ border: "2px solid var(--ink)", background: "var(--sf)" }}
          >
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder="youtube.com/watch?v=..."
              aria-label="YouTube link"
              autoFocus
              className="flex-1 min-w-0 border-0 bg-transparent px-5 py-[18px] text-base text-[var(--ink)] placeholder:text-[var(--mu)] outline-none"
              style={{ font: "inherit" }}
            />
            <button
              onClick={handleSubmit}
              className="border-0 px-7 font-semibold text-base transition-colors"
              style={{
                background: "var(--ink)",
                color: "var(--bg)",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--ac)";
                e.currentTarget.style.color = "var(--acink)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--ink)";
                e.currentTarget.style.color = "var(--bg)";
              }}
            >
              Find clips
            </button>
          </div>

          <p className="mt-3.5 text-sm text-[var(--mu)]">
            Works with any public YouTube video that has captions.
          </p>

          {error && (
            <p className="mt-4 text-sm text-red-400 bg-red-950/20 rounded-lg px-4 py-3 border border-red-900/40">
              {error}
            </p>
          )}
        </section>
      </main>

      {/* Footer Waitlist */}
      <WaitlistForm />
    </div>
  );
}
