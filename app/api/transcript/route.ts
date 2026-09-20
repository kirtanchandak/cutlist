import { YoutubeTranscript } from "youtube-transcript";

function extractVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    // youtu.be/VIDEO_ID
    if (parsed.hostname === "youtu.be") {
      return parsed.pathname.slice(1).split("?")[0] || null;
    }
    // youtube.com/watch?v=VIDEO_ID
    const v = parsed.searchParams.get("v");
    if (v) return v;
    // youtube.com/shorts/VIDEO_ID
    const shortsMatch = parsed.pathname.match(/^\/shorts\/([^/?]+)/);
    if (shortsMatch) return shortsMatch[1] ?? null;
    // youtube.com/embed/VIDEO_ID
    const embedMatch = parsed.pathname.match(/^\/embed\/([^/?]+)/);
    if (embedMatch) return embedMatch[1] ?? null;
  } catch {
    // Not a valid URL — try treating the input as a raw video ID
    if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const { videoUrl } = await request.json();

    if (!videoUrl || typeof videoUrl !== "string") {
      return Response.json(
        { error: "videoUrl is required" },
        { status: 400 }
      );
    }

    const videoId = extractVideoId(videoUrl.trim());
    if (!videoId) {
      return Response.json(
        { error: "Could not extract a valid YouTube video ID from the URL" },
        { status: 400 }
      );
    }

    const transcriptEntries = await YoutubeTranscript.fetchTranscript(videoId);

    if (!transcriptEntries || transcriptEntries.length === 0) {
      return Response.json(
        { error: "No transcript available for this video" },
        { status: 404 }
      );
    }

    // Build structured lines for the UI
    const lines = transcriptEntries.map((entry) => {
      const seconds = Math.floor(entry.offset / 1000);
      return { seconds, text: entry.text };
    });

    // Build plain text transcript with timestamps (for JEV)
    const transcript = lines
      .map((line) => {
        const mins = Math.floor(line.seconds / 60);
        const secs = line.seconds % 60;
        return `[${mins}:${secs.toString().padStart(2, "0")}] ${line.text}`;
      })
      .join("\n");

    // Estimate total video duration from last entry
    const lastEntry = transcriptEntries[transcriptEntries.length - 1];
    const totalDuration = lastEntry
      ? Math.floor(lastEntry.offset / 1000) + Math.ceil((lastEntry.duration ?? 5000) / 1000)
      : 0;

    return Response.json({ transcript, lines, videoId, totalDuration });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("Could not find")) {
      return Response.json(
        { error: "No captions found for this video. Make sure the video has subtitles enabled." },
        { status: 404 }
      );
    }
    console.error("[transcript] Error:", err);
    return Response.json({ error: message }, { status: 500 });
  }
}
