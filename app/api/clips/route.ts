import { OpenRouter } from "@openrouter/sdk";

const JEV_MODEL = "~typesafe/jev-latest";

// A parsed segment of the transcript
interface Segment {
  text: string;
  startSeconds: number;
  endSeconds: number;
}

// What JEV tells us about each segment
interface SegmentDecision {
  segment: Segment;
  isClipWorthy: number;   // noul 0–1
  contentType: string;    // choice: hook | story | insight | hot_take | emotional | other
  virality: number;       // score 0–1 (normalised)
  confidence: number;
  cost: number;
}

// Final clip we return to the UI
export interface Clip {
  title: string;
  startSeconds: number;
  endSeconds: number;
  reason: string;
  hook: string;
  viralityScore: number;
  contentType: string;
}

/**
 * Parse "[M:SS] text" lines into timed segments of ~30–60 seconds each.
 */
function segmentTranscript(transcript: string): Segment[] {
  const lines = transcript.split("\n").filter(Boolean);

  // Parse every timestamped line
  const entries: { seconds: number; text: string }[] = [];
  for (const line of lines) {
    const match = line.match(/^\[(\d+):(\d+)\]\s+(.*)$/);
    if (match) {
      const [, mins, secs, text] = match;
      entries.push({ seconds: Number(mins) * 60 + Number(secs), text: text ?? "" });
    }
  }

  if (entries.length === 0) return [];

  // Group into windows of ~40 seconds, minimum 15s
  const TARGET_WINDOW = 40;
  const MIN_WINDOW = 15;
  const segments: Segment[] = [];
  let windowStart = 0;

  while (windowStart < entries.length) {
    const startEntry = entries[windowStart]!;
    const startSec = startEntry.seconds;
    let windowEnd = windowStart;

    // Grow window until we hit ~TARGET_WINDOW seconds or end of entries
    while (
      windowEnd < entries.length - 1 &&
      (entries[windowEnd + 1]!.seconds - startSec) < TARGET_WINDOW
    ) {
      windowEnd++;
    }

    const endEntry = entries[windowEnd]!;
    // Estimate real end = last entry time + a few seconds
    const endSec = endEntry.seconds + 5;
    const duration = endSec - startSec;

    if (duration >= MIN_WINDOW) {
      const text = entries.slice(windowStart, windowEnd + 1).map((e) => e.text).join(" ");
      segments.push({ text, startSeconds: startSec, endSeconds: endSec });
    }

    // Advance to next window with 10s overlap for context
    const overlapTarget = startSec + TARGET_WINDOW - 10;
    let next = windowStart + 1;
    while (next < entries.length - 1 && entries[next]!.seconds < overlapTarget) {
      next++;
    }
    windowStart = next;
  }

  return segments;
}

/**
 * Ask JEV about one segment via the Decisions API.
 */
async function evaluateSegment(
  client: OpenRouter,
  segment: Segment,
  videoId: string
): Promise<SegmentDecision | null> {
  try {
    const decision = await client.alpha.decisions.create({
      decisionsRequest: {
        model: JEV_MODEL,
        state: {
          transcript_segment: segment.text,
          start_time_seconds: segment.startSeconds,
          end_time_seconds: segment.endSeconds,
          video_id: videoId,
        },
        questions: {
          is_clip_worthy: {
            type: "noul",
            instructions: "Is this transcript segment a strong candidate for a short-form viral clip (Reels, TikTok, YouTube Shorts)?",
            criteria: {
              true: "The segment has a clear hook, tells a compelling story, shares a hot take, delivers a surprising insight, or contains an emotional moment that would make viewers stop scrolling.",
              false: "The segment is filler, transitions, introductions, sponsor reads, or dry content with no clear hook.",
            },
          },
          content_type: {
            type: "choice",
            instructions: "What best describes the nature of this clip?",
            criteria: {
              hook: "Opens with a strong question or surprising statement that grabs attention immediately.",
              story: "A personal anecdote or narrative with a clear arc.",
              insight: "A non-obvious idea, tip, or perspective that delivers genuine value.",
              hot_take: "A controversial or counterintuitive opinion that sparks debate.",
              emotional: "Funny, heartwarming, shocking, or otherwise emotionally resonant.",
              other: "None of the above.",
            },
          },
          virality: {
            type: "score",
            instructions: "How likely is this clip to go viral on short-form video platforms?",
            criteria: ["Would not perform", "Might get some views", "Strong performer", "Likely to go viral"],
          },
        },
      },
    });

    const { is_clip_worthy, content_type, virality } = decision.answers;

    if (
      is_clip_worthy.type !== "noul" ||
      content_type.type !== "choice" ||
      virality.type !== "score"
    ) {
      return null;
    }

    // score is 0–3 (4 criteria labels), normalise to 0–1
    const maxScore = 3;
    const viralityNorm = Math.min(virality.score / maxScore, 1);
    
    // JEV costs $0.042 per 1M input tokens, 0 for output. 
    // Fallback to manual calc if SDK cost is undefined.
    const fallbackCost = (decision.usage.inputTokens / 1_000_000) * 0.042;

    return {
      segment,
      isClipWorthy: is_clip_worthy.noul,
      contentType: content_type.choice,
      virality: viralityNorm,
      confidence: content_type.confidence ?? 0,
      cost: decision.usage.cost ?? fallbackCost,
    };
  } catch (err) {
    console.warn("[clips] JEV decision failed for segment:", err);
    return null;
  }
}

/**
 * Build a human-readable reason + hook from the decision data.
 */
function buildClipMetadata(decision: SegmentDecision): Pick<Clip, "title" | "reason" | "hook"> {
  const typeLabels: Record<string, string> = {
    hook: "Strong hook",
    story: "Compelling story",
    insight: "Valuable insight",
    hot_take: "Hot take",
    emotional: "Emotionally resonant",
    other: "Notable moment",
  };

  const typeLabel = typeLabels[decision.contentType] ?? "Notable moment";
  const viralPct = Math.round(decision.virality * 100);
  const clipPct = Math.round(decision.isClipWorthy * 100);

  // Derive a title from the first sentence of the segment
  const firstSentence = decision.segment.text.split(/[.!?]/)[0]?.trim() ?? "";
  const title =
    firstSentence.length > 10 && firstSentence.length <= 60
      ? firstSentence
      : `${typeLabel} (${formatTime(decision.segment.startSeconds)})`;

  const reason = `${typeLabel} — JEV rated this ${clipPct}% clip-worthy with a ${viralPct}% virality score.`;
  const hook = decision.segment.text.slice(0, 120).trim() + (decision.segment.text.length > 120 ? "…" : "");

  return { title, reason, hook };
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export async function POST(request: Request) {
  try {
    const { transcript, videoId } = await request.json();

    if (!transcript || !videoId) {
      return Response.json({ error: "transcript and videoId are required" }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "OPENROUTER_API_KEY is not configured" }, { status: 500 });
    }

    const client = new OpenRouter({ apiKey, serverURL: "https://openrouter.ai" });

    // 1. Segment the transcript into timed windows
    const segments = segmentTranscript(transcript);
    if (segments.length === 0) {
      return Response.json({ error: "Could not parse transcript into segments" }, { status: 400 });
    }

    // 2. Evaluate all segments with JEV in parallel (cap concurrency to avoid rate limits)
    const CONCURRENCY = 5;
    const decisions: SegmentDecision[] = [];

    for (let i = 0; i < segments.length; i += CONCURRENCY) {
      const batch = segments.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map((seg) => evaluateSegment(client, seg, videoId))
      );
      for (const r of results) {
        if (r !== null) decisions.push(r);
      }
    }

    if (decisions.length === 0) {
      return Response.json({ error: "JEV could not evaluate any segments" }, { status: 502 });
    }

    // Debug: log what JEV actually returned for every segment
    console.log("[clips] JEV decisions for", decisions.length, "segments:");
    for (const d of decisions) {
      console.log(
        `  [${formatTime(d.segment.startSeconds)}-${formatTime(d.segment.endSeconds)}]`,
        `noul=${d.isClipWorthy.toFixed(2)}`,
        `type=${d.contentType}`,
        `virality=${d.virality.toFixed(2)}`
      );
    }

    // 3. Sort by composite score: 60% virality + 40% clip-worthiness
    //    No hard filter — always return the best segments JEV found
    const ranked = [...decisions].sort((a, b) => {
      const scoreA = 0.6 * a.virality + 0.4 * a.isClipWorthy;
      const scoreB = 0.6 * b.virality + 0.4 * b.isClipWorthy;
      return scoreB - scoreA;
    });

    // 4. Take top 6, deduplicate overlapping timestamps
    const topClips: Clip[] = [];
    for (const decision of ranked) {
      if (topClips.length >= 6) break;

      // Skip if this segment overlaps >50% with an already-selected clip
      const overlaps = topClips.some((c) => {
        const overlapStart = Math.max(c.startSeconds, decision.segment.startSeconds);
        const overlapEnd = Math.min(c.endSeconds, decision.segment.endSeconds);
        const overlapDuration = Math.max(0, overlapEnd - overlapStart);
        const minDuration = Math.min(
          c.endSeconds - c.startSeconds,
          decision.segment.endSeconds - decision.segment.startSeconds
        );
        return minDuration > 0 && overlapDuration / minDuration > 0.5;
      });

      if (!overlaps) {
        const { title, reason, hook } = buildClipMetadata(decision);
        topClips.push({
          title,
          startSeconds: decision.segment.startSeconds,
          endSeconds: decision.segment.endSeconds,
          reason,
          hook,
          viralityScore: decision.virality,
          contentType: decision.contentType,
        });
      }
    }

    if (topClips.length === 0) {
      return Response.json(
        { error: "No segments were produced from the transcript. The video may be too short or have no parseable captions." },
        { status: 404 }
      );
    }

    // Sort final clips chronologically for display
    topClips.sort((a, b) => a.startSeconds - b.startSeconds);

    // Calculate total cost
    const totalCost = decisions.reduce((acc, d) => acc + d.cost, 0);

    return Response.json({ clips: topClips, videoId, totalCost });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[clips] Error:", err);
    return Response.json({ error: message }, { status: 500 });
  }
}
