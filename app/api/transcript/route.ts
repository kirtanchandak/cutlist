import { extractVideoId } from "../../lib/utils";

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

    const apiKey = process.env.SUPADATA_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "Transcript service not configured (missing SUPADATA_API_KEY)" },
        { status: 500 }
      );
    }

    // Fetch transcript via Supadata API (works on Vercel datacenter IPs)
    // Retry with backoff on rate limits (429)
    let supadataRes: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      supadataRes = await fetch(
        `https://api.supadata.ai/v1/transcript?url=https://www.youtube.com/watch?v=${videoId}&lang=en`,
        {
          headers: { "x-api-key": apiKey },
        }
      );
      if (supadataRes.status === 429 && attempt < 2) {
        // Rate limited — wait 2s, 4s before retrying
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      break;
    }

    if (!supadataRes || !supadataRes.ok) {
      const errBody = supadataRes ? await supadataRes.text() : "No response";
      console.error("[transcript] Supadata error:", supadataRes?.status, errBody);
      if (supadataRes?.status === 404) {
        return Response.json(
          { error: "No captions found for this video. Make sure the video has subtitles enabled." },
          { status: 404 }
        );
      }
      if (supadataRes?.status === 429) {
        return Response.json(
          { error: "Rate limited. Please wait a moment and try again." },
          { status: 429 }
        );
      }
      return Response.json(
        { error: "Failed to fetch transcript. Please try again." },
        { status: 502 }
      );
    }

    const data = await supadataRes.json();

    // Supadata returns { content: [{ text, offset, duration }] }
    const entries = data.content;
    if (!entries || entries.length === 0) {
      return Response.json(
        { error: "No transcript available for this video" },
        { status: 404 }
      );
    }

    // Build structured lines for the UI (offset is in ms, convert to seconds)
    const lines = entries.map((entry: any) => {
      const seconds = Math.floor(entry.offset / 1000);
      return { seconds, text: entry.text };
    });

    // Build plain text transcript with timestamps (for JEV)
    const transcript = lines
      .map((line: { seconds: number; text: string }) => {
        const mins = Math.floor(line.seconds / 60);
        const secs = line.seconds % 60;
        return `[${mins}:${secs.toString().padStart(2, "0")}] ${line.text}`;
      })
      .join("\n");

    // Estimate total video duration from last entry (ms → seconds)
    const lastEntry = entries[entries.length - 1];
    const totalDuration = lastEntry
      ? Math.floor(lastEntry.offset / 1000) + Math.ceil((lastEntry.duration ?? 5000) / 1000)
      : 0;

    return Response.json({ transcript, lines, videoId, totalDuration });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[transcript] Error:", err);
    return Response.json({ error: message }, { status: 500 });
  }
}
