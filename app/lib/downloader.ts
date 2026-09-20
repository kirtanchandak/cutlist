import { spawn } from "child_process";
import os from "os";
import path from "path";
import fs from "fs";

export interface DownloadStatus {
  videoId: string;
  status: "idle" | "downloading" | "ready" | "error";
  progress: number;
  filepath?: string;
  error?: string;
}

// In-memory store for active downloads (singleton across hot reloads in dev)
const globalStore = global as unknown as {
  __DOWNLOADS: Map<string, DownloadStatus>;
};
if (!globalStore.__DOWNLOADS) {
  globalStore.__DOWNLOADS = new Map();
}
const downloads = globalStore.__DOWNLOADS;

const TMP_DIR = path.join(os.tmpdir(), "clipjev_full");
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

export function getDownloadStatus(videoId: string): DownloadStatus {
  const existing = downloads.get(videoId);
  if (existing) return existing;
  return { videoId, status: "idle", progress: 0 };
}

export function startDownload(videoId: string): void {
  const existing = downloads.get(videoId);
  if (existing && (existing.status === "downloading" || existing.status === "ready")) {
    return; // Already downloading or done
  }

  const filepath = path.join(TMP_DIR, `${videoId}.mp4`);
  
  // If file exists and is somehow complete from a previous run, mark ready
  if (fs.existsSync(filepath) && fs.statSync(filepath).size > 1024 * 1024) {
    downloads.set(videoId, { videoId, status: "ready", progress: 100, filepath });
    return;
  }

  const state: DownloadStatus = { videoId, status: "downloading", progress: 0, filepath };
  downloads.set(videoId, state);

  const url = `https://www.youtube.com/watch?v=${videoId}`;

  // Find yt-dlp binary
  const ytDlpPaths = [
    "/opt/homebrew/bin/yt-dlp",
    "/usr/local/bin/yt-dlp",
    "/usr/bin/yt-dlp",
    "yt-dlp",
  ];
  const ytDlpPath = ytDlpPaths.find((p) => {
    try {
      return fs.existsSync(p) || p === "yt-dlp";
    } catch {
      return false;
    }
  }) || "yt-dlp";

  const proc = spawn(ytDlpPath, [
    url,
    "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]",
    "--newline", // Crucial for parsing progress line by line
    "-o", filepath,
    "--force-overwrites"
  ]);

  proc.stdout.on("data", (data) => {
    const lines = data.toString().split("\n");
    for (const line of lines) {
      // Look for: [download]  23.4% of ~45.00MiB at  2.13MiB/s
      const match = line.match(/\[download\]\s+([\d\.]+)%/);
      if (match && match[1]) {
        const p = parseFloat(match[1]);
        if (!isNaN(p)) {
          state.progress = p;
        }
      }
    }
  });

  proc.stderr.on("data", (data) => {
    console.warn(`[yt-dlp stderr ${videoId}]:`, data.toString());
  });

  proc.on("close", (code) => {
    if (code === 0) {
      state.status = "ready";
      state.progress = 100;
    } else {
      state.status = "error";
      state.error = `yt-dlp exited with code ${code}`;
    }
  });
}
