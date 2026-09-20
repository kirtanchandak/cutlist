import { getDownloadStatus } from "../../lib/downloader";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get("videoId");

  if (!videoId) {
    return Response.json({ error: "videoId is required" }, { status: 400 });
  }

  const status = getDownloadStatus(videoId);
  return Response.json(status);
}
