import { OpenRouter } from "@openrouter/sdk";

// Long videos mean hundreds of Jev calls. Give the function room to finish.
export const maxDuration = 300;

const JEV_MODEL = "~typesafe/jev-latest";

const CFG = {
  windowLengths: [30, 45, 60], // target clip lengths in seconds
  snapTolerance: 10, // how far an end may move to land on a pause
  minClipSeconds: 20,
  maxClipSeconds: 75,
  strideSeconds: 12, // gap between window starts (auto-widens on long videos)
  maxWindows: 900, // cap on Jev calls per video
  minWords: 35, // skip windows that are mostly silence or music
  contextSeconds: 30,
  contextChars: 600,
  concurrency: 8,
  budgetMs: 270_000, // stop scoring before the function timeout
  maxClips: 6,
  minScore: 0.55, // composite floor: weak videos return fewer clips
  minWorthy: 0.3, // hard gate against sponsor reads, intros, dead air
  overlapLimit: 0.25,
  mergeGapSeconds: 2,
} as const;

const WEIGHTS = { hook: 0.35, standalone: 0.25, payoff: 0.25, worthy: 0.15 };
const SCORE_LEVELS = 5; // each score question has 5 labels -> 0..4

interface Entry {
  seconds: number;
  text: string;
}

interface Segment {
  text: string;
  before: string;
  after: string;
  startSeconds: number;
  endSeconds: number;
}

interface SegmentDecision {
  segment: Segment;
  worthy: number; // noul 0–1
  contentType: string;
  hook: number; // 0–1
  standalone: number; // 0–1
  payoff: number; // 0–1
  composite: number; // weighted 0–1, this is what ranks
  cost: number;
}

export interface Clip {
  title: string;
  startSeconds: number;
  endSeconds: number;
  reason: string;
  hook: string; // opening text excerpt
  viralityScore: number; // composite 0–1 (name kept so the UI does not change)
  scores: { hook: number; standalone: number; payoff: number };
  contentType: string;
}

const TYPE_LABELS: Record<string, string> = {
  hook: "Strong hook",
  story: "Compelling story",
  insight: "Valuable insight",
  hot_take: "Hot take",
  emotional: "Emotionally resonant",
  other: "Notable moment",
};

/* ---------- Parsing and segmentation ---------- */

/** Parse "[M:SS] text" or "[H:MM:SS] text" lines. */
function parseTranscript(transcript: string): Entry[] {
  const entries: Entry[] = [];
  for (const line of transcript.split("\n")) {
    const m = line.trim().match(/^\[(?:(\d+):)?(\d+):(\d+)\]\s+(.*)$/);
    if (!m) continue;
    const [, h, mins, secs, text] = m;
    entries.push({
      seconds: Number(h ?? 0) * 3600 + Number(mins) * 60 + Number(secs),
      text: (text ?? "").trim(),
    });
  }
  return entries;
}

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

/**
 * Indices where a natural break happens before entry i: the previous line ended
 * a sentence, or the timestamp gap is longer than the speech would need.
 * Auto-captions often lack punctuation, so fall back to every entry.
 */
function findBreaks(entries: Entry[]): number[] {
  const idx = [0];
  for (let i = 1; i < entries.length; i++) {
    const prev = entries[i - 1]!;
    const endsSentence = /[.!?]["')\]]?\s*$/.test(prev.text);
    const gap = entries[i]!.seconds - prev.seconds;
    const expected = wordCount(prev.text) / 2.8;
    if (endsSentence || gap > expected + 1.5) idx.push(i);
  }
  const sparse = idx.length < Math.max(3, entries.length * 0.05);
  return sparse ? entries.map((_, i) => i) : idx;
}

/**
 * Windows of several lengths that start and end on breaks, with context
 * before and after. Stride widens on long videos to respect maxWindows.
 */
function buildSegments(entries: Entry[]): Segment[] {
  if (entries.length === 0) return [];

  const first = entries[0]!.seconds;
  const lastEnd = entries[entries.length - 1]!.seconds + 5;
  const timeAt = (i: number) => (i >= entries.length ? lastEnd : entries[i]!.seconds);
  const ctx = (from: number, to: number) =>
    entries
      .filter((e) => e.seconds >= from && e.seconds < to)
      .map((e) => e.text)
      .join(" ");

  const starts = findBreaks(entries);
  const ends = [...starts.filter((i) => i > 0), entries.length];
  const stride = Math.max(
    CFG.strideSeconds,
    Math.ceil(((lastEnd - first) * CFG.windowLengths.length) / CFG.maxWindows)
  );

  const segments: Segment[] = [];
  const seen = new Set<string>();
  let nextStart = first;
  let ep = 0;

  for (const b of starts) {
    const t0 = timeAt(b);
    if (t0 < nextStart) continue;
    nextStart = t0 + stride;
    while (ep < ends.length && ends[ep]! <= b) ep++;

    for (const len of CFG.windowLengths) {
      let best = -1;
      let bestDiff = Infinity;
      for (let j = ep; j < ends.length; j++) {
        const dur = timeAt(ends[j]!) - t0;
        if (dur > len + CFG.snapTolerance) break;
        const diff = Math.abs(dur - len);
        if (diff <= CFG.snapTolerance && diff < bestDiff) {
          best = ends[j]!;
          bestDiff = diff;
        }
      }
      if (best < 0) continue;

      const key = `${b}-${best}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const endSec = timeAt(best);
      const dur = endSec - t0;
      if (dur < CFG.minClipSeconds || dur > CFG.maxClipSeconds) continue;

      const text = entries.slice(b, best).map((e) => e.text).join(" ");
      if (wordCount(text) < CFG.minWords) continue;

      segments.push({
        text,
        startSeconds: t0,
        endSeconds: endSec,
        before: ctx(t0 - CFG.contextSeconds, t0).slice(-CFG.contextChars),
        after: ctx(endSec, endSec + CFG.contextSeconds).slice(0, CFG.contextChars),
      });
    }
  }
  return segments;
}

/* ---------- Jev ---------- */

const CTX_NOTE =
  " Judge only transcript_segment. context_before and context_after are for reference.";

function scoreQuestion(instructions: string, labels: string[]) {
  return { type: "score" as const, instructions: instructions + CTX_NOTE, criteria: labels };
}

async function evaluateSegment(
  client: OpenRouter,
  segment: Segment,
  videoId: string,
  videoTitle: string
): Promise<SegmentDecision | null> {
  try {
    const decision = await client.alpha.decisions.create({
      decisionsRequest: {
        model: JEV_MODEL,
        state: {
          video_title: videoTitle,
          video_id: videoId,
          transcript_segment: segment.text,
          start_time_seconds: segment.startSeconds,
          end_time_seconds: segment.endSeconds,
          context_before: segment.before,
          context_after: segment.after,
        },
        questions: {
          is_clip_worthy: {
            type: "noul",
            instructions:
              "Is this passage real content a viewer could follow, as opposed to filler?" + CTX_NOTE,
            criteria: {
              true: "Substantive: a claim, story, explanation, argument, or moment.",
              false: "Intro or outro, sponsor read, housekeeping, transitions, or dead air.",
            },
          },
          content_type: {
            type: "choice",
            instructions: "What best describes the nature of this passage?" + CTX_NOTE,
            criteria: {
              hook: "Opens with a strong question or surprising statement that grabs attention immediately.",
              story: "A personal anecdote or narrative with a clear arc.",
              insight: "A non-obvious idea, tip, or perspective that delivers genuine value.",
              hot_take: "A controversial or counterintuitive opinion that sparks debate.",
              emotional: "Funny, heartwarming, shocking, or otherwise emotionally resonant.",
              other: "None of the above.",
            },
          },
          hook_strength: scoreQuestion(
            "How well do the first one or two sentences make a stranger keep watching?",
            [
              "Starts mid-thought or with filler",
              "Weak or generic opening",
              "Decent opening that raises some interest",
              "Strong opening question, claim, or surprise",
              "Arresting: a bold claim, surprising fact, or sharp question right away",
            ]
          ),
          standalone: scoreQuestion(
            "Would a viewer with no prior context understand and follow this passage?",
            [
              "Impossible to follow without earlier context",
              "Mostly confusing",
              "Understandable with some effort",
              "Clear",
              "Fully self-contained and clear",
            ]
          ),
          payoff: scoreQuestion(
            "Does the passage land a complete idea, punchline, or takeaway by its end?",
            [
              "Cuts off mid-thought",
              "Trails off with no point",
              "Reaches a partial point",
              "Lands a clear point",
              "Ends on a strong, memorable takeaway or punchline",
            ]
          ),
        },
      },
    });

    const { is_clip_worthy, content_type, hook_strength, standalone, payoff } = decision.answers;

    if (
      is_clip_worthy.type !== "noul" ||
      content_type.type !== "choice" ||
      hook_strength.type !== "score" ||
      standalone.type !== "score" ||
      payoff.type !== "score"
    ) {
      return null;
    }

    const norm = (n: number) => Math.min(Math.max(n / (SCORE_LEVELS - 1), 0), 1);
    const worthy = is_clip_worthy.noul;
    const hook = norm(hook_strength.score);
    const stand = norm(standalone.score);
    const pay = norm(payoff.score);

    // JEV costs $0.042 per 1M input tokens, 0 for output.
    const fallbackCost = (decision.usage.inputTokens / 1_000_000) * 0.042;

    return {
      segment,
      worthy,
      contentType: content_type.choice,
      hook,
      standalone: stand,
      payoff: pay,
      composite:
        WEIGHTS.hook * hook +
        WEIGHTS.standalone * stand +
        WEIGHTS.payoff * pay +
        WEIGHTS.worthy * worthy,
      cost: decision.usage.cost ?? fallbackCost,
    };
  } catch (err) {
    console.warn("[clips] JEV decision failed for segment:", err);
    return null;
  }
}

/** Worker pool that stops taking new work at the deadline. */
async function scoreAll(
  items: Segment[],
  fn: (s: Segment) => Promise<SegmentDecision | null>
): Promise<{ decisions: SegmentDecision[]; truncated: boolean }> {
  // Interleave so a timeout leaves coverage spread across the video, not just the start.
  const order = [0, 1, 2, 3].flatMap((k) => items.filter((_, i) => i % 4 === k));
  const deadline = Date.now() + CFG.budgetMs;
  const decisions: SegmentDecision[] = [];
  let next = 0;
  let truncated = false;

  const worker = async () => {
    while (true) {
      if (next >= order.length) return;
      if (Date.now() > deadline) {
        truncated = true;
        return;
      }
      const seg = order[next++]!;
      const d = await fn(seg);
      if (d) decisions.push(d);
    }
  };

  await Promise.all(Array.from({ length: CFG.concurrency }, worker));
  return { decisions, truncated };
}

/* ---------- Selection ---------- */

interface Picked {
  start: number;
  end: number;
  parts: SegmentDecision[];
}

function buildClipMetadata(
  best: SegmentDecision,
  text: string,
  start: number
): Pick<Clip, "title" | "reason" | "hook"> {
  const label = TYPE_LABELS[best.contentType] ?? "Notable moment";
  const n = (x: number) => Math.round(x * (SCORE_LEVELS - 1));
  const max = SCORE_LEVELS - 1;

  const firstSentence = text.split(/[.!?]/)[0]?.trim() ?? "";
  const title =
    firstSentence.length > 10 && firstSentence.length <= 60
      ? firstSentence
      : `${label} (${formatTime(start)})`;

  const reason = `${label} — hook ${n(best.hook)}/${max}, standalone ${n(best.standalone)}/${max}, payoff ${n(best.payoff)}/${max}.`;
  const hook = text.slice(0, 120).trim() + (text.length > 120 ? "…" : "");
  return { title, reason, hook };
}

/**
 * Rank by composite, drop anything under the floor, suppress overlaps,
 * and merge windows that touch into one longer clip.
 */
function selectClips(
  decisions: SegmentDecision[],
  textOf: (from: number, to: number) => string
): Clip[] {
  const ranked = decisions
    .filter((d) => d.composite >= CFG.minScore && d.worthy >= CFG.minWorthy)
    .sort((a, b) => b.composite - a.composite);

  const picked: Picked[] = [];
  for (const d of ranked) {
    const s = d.segment.startSeconds;
    const e = d.segment.endSeconds;
    let handled = false;

    for (const p of picked) {
      const overlap = Math.max(0, Math.min(e, p.end) - Math.max(s, p.start));
      const minDur = Math.min(e - s, p.end - p.start);
      if (overlap / minDur > CFG.overlapLimit) {
        handled = true; // too similar to something already picked
        break;
      }
      const gap = Math.max(s, p.start) - Math.min(e, p.end);
      const union = Math.max(e, p.end) - Math.min(s, p.start);
      if (overlap === 0 && gap <= CFG.mergeGapSeconds && union <= CFG.maxClipSeconds) {
        p.start = Math.min(s, p.start);
        p.end = Math.max(e, p.end);
        p.parts.push(d);
        handled = true;
        break;
      }
    }

    if (!handled && picked.length < CFG.maxClips) {
      picked.push({ start: s, end: e, parts: [d] });
    }
  }

  return picked
    .map((p): Clip => {
      const best = p.parts.reduce((a, b) => (b.composite > a.composite ? b : a));
      const meta = buildClipMetadata(best, textOf(p.start, p.end), p.start);
      const r = (x: number) => Math.round(x * 100) / 100;
      return {
        ...meta,
        startSeconds: p.start,
        endSeconds: p.end,
        viralityScore: r(best.composite),
        scores: { hook: r(best.hook), standalone: r(best.standalone), payoff: r(best.payoff) },
        contentType: best.contentType,
      };
    })
    .sort((a, b) => a.startSeconds - b.startSeconds);
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/* ---------- Route ---------- */

export async function POST(request: Request) {
  try {
    const { transcript, videoId, videoTitle } = await request.json();

    if (!transcript || !videoId) {
      return Response.json({ error: "transcript and videoId are required" }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "OPENROUTER_API_KEY is not configured" }, { status: 500 });
    }

    const client = new OpenRouter({ apiKey, serverURL: "https://openrouter.ai" });

    // 1. Parse and build break-aligned windows with context
    const entries = parseTranscript(transcript);
    const segments = buildSegments(entries);
    if (segments.length === 0) {
      return Response.json({ error: "Could not parse transcript into segments" }, { status: 400 });
    }

    // 2. Score every window with Jev (worker pool, time-boxed)
    const { decisions, truncated } = await scoreAll(segments, (seg) =>
      evaluateSegment(client, seg, videoId, videoTitle ?? "")
    );
    if (decisions.length === 0) {
      return Response.json({ error: "JEV could not evaluate any segments" }, { status: 502 });
    }

    if (process.env.CLIPS_DEBUG) {
      for (const d of [...decisions].sort((a, b) => b.composite - a.composite).slice(0, 25)) {
        console.log(
          `[clips] ${formatTime(d.segment.startSeconds)}-${formatTime(d.segment.endSeconds)}`,
          `score=${d.composite.toFixed(2)} hook=${d.hook.toFixed(2)}`,
          `stand=${d.standalone.toFixed(2)} pay=${d.payoff.toFixed(2)}`,
          `worthy=${d.worthy.toFixed(2)} type=${d.contentType}`
        );
      }
    }

    // 3. Floor, overlap suppression, merge adjacent, top N
    const textOf = (from: number, to: number) =>
      entries
        .filter((e) => e.seconds >= from && e.seconds < to)
        .map((e) => e.text)
        .join(" ");
    const clips = selectClips(decisions, textOf);

    const totalCost = decisions.reduce((acc, d) => acc + d.cost, 0);

    return Response.json({
      clips,
      videoId,
      totalCost,
      windowsScored: decisions.length,
      windowsTotal: segments.length,
      truncated,
      ...(clips.length === 0 && { message: "No strong clips found in this video." }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[clips] Error:", err);
    return Response.json({ error: message }, { status: 500 });
  }
}