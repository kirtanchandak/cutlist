export function extractVideoId(url: string): string | null {
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
