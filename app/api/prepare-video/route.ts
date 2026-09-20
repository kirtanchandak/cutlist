import { startDownload, getDownloadStatus } from "../../lib/downloader";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { videoId } = await request.json();
    if (!videoId) {
      return Response.json({ error: "videoId is required" }, { status: 400 });
    }

    startDownload(videoId);
    return Response.json(getDownloadStatus(videoId));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
