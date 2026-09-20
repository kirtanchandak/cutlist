import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import { getDownloadStatus } from "../../lib/downloader";

const execFileAsync = promisify(execFile);

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { videoId, startSeconds, endSeconds, title, aspectRatio } = body;

    if (!videoId || startSeconds == null || endSeconds == null) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Check if background download is complete
    const status = getDownloadStatus(videoId);
    if (status.status !== "ready" || !status.filepath) {
      return Response.json(
        { error: `Video is not ready yet. Status: ${status.status}, Progress: ${status.progress}%` },
        { status: 400 }
      );
    }

    const inputPath = status.filepath;
    const workDir = path.join(os.tmpdir(), "clipjev_clips");
    if (!fs.existsSync(workDir)) {
      fs.mkdirSync(workDir, { recursive: true });
    }

    const safeTitle = (title || "clip").replace(/[^a-zA-Z0-9]/g, "_");
    const outputPath = path.join(workDir, `${videoId}_${startSeconds}_${safeTitle}.mp4`);

    // Determine crop filter based on aspect ratio
    let vfFilter = "";
    if (aspectRatio === "9:16") {
      vfFilter = "crop=ih*9/16:ih"; // Center crop vertical
    } else if (aspectRatio === "1:1") {
      vfFilter = "crop=ih:ih";      // Center crop square
    }
    // 16:9 or undefined means no cropping

    const ffmpegPaths = ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg", "ffmpeg"];
    const ffmpegPath = ffmpegPaths.find((p) => {
      try {
        return fs.existsSync(p) || p === "ffmpeg";
      } catch {
        return false;
      }
    }) || "ffmpeg";

    const duration = endSeconds - startSeconds;

    const ffmpegArgs = [
      "-y",
      "-i", inputPath,
      "-ss", startSeconds.toString(),
      "-t", duration.toString(),
    ];

    if (vfFilter) {
      // Re-encode required when cropping
      ffmpegArgs.push(
        "-vf", vfFilter,
        "-c:v", "libx264",
        "-preset", "fast",
        "-c:a", "aac"
      );
    } else {
      // Stream copy if no crop
      ffmpegArgs.push("-c", "copy");
    }

    ffmpegArgs.push(outputPath);

    console.log(`[clip-video] Running ffmpeg: ${ffmpegPath} ${ffmpegArgs.join(" ")}`);

    try {
      await execFileAsync(ffmpegPath, ffmpegArgs);
    } catch (err: any) {
      console.error("[clip-video] ffmpeg error:", err.stderr || err.message);
      return Response.json({ error: "Failed to trim video" }, { status: 500 });
    }

    if (!fs.existsSync(outputPath)) {
      return Response.json({ error: "Trimmed video file not found" }, { status: 500 });
    }

    const fileBuffer = fs.readFileSync(outputPath);

    // Clean up trimmed clip
    fs.unlink(outputPath, (err) => {
      if (err) console.error(`[clip-video] Failed to cleanup ${outputPath}:`, err);
    });

    return new Response(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="${safeTitle}.mp4"`,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[clip-video] Error:", err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
