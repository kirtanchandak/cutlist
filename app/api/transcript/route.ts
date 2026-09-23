import { YouTubeTranscriptApi } from "youtube-transcript-nodejs";
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

    const api = new YouTubeTranscriptApi();
    const transcriptList = await api.list(videoId);
    // Find the best English transcript (manual or auto-generated)
    const transcriptData = transcriptList.findTranscript(['en']);
    if (!transcriptData) {
      throw new Error("No English transcript found");
    }
    const transcriptEntries = await transcriptData.fetch();

    if (!transcriptEntries || transcriptEntries.length === 0) {
      return Response.json(
        { error: "No transcript available for this video" },
        { status: 404 }
      );
    }

    // Build structured lines for the UI
    const lines = transcriptEntries.map((entry: any) => {
      const seconds = Math.floor(entry.start);
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
    const lastEntry = (transcriptEntries as any)[transcriptEntries.length - 1];
    const totalDuration = lastEntry
      ? Math.floor(lastEntry.start) + Math.ceil(lastEntry.duration ?? 5)
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
