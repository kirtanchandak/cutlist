# ClipJev 🎬

ClipJev is an AI-powered web application that automatically analyzes YouTube videos, finds the most engaging moments, and prepares them as 9:16 vertical clips perfect for YouTube Shorts, TikTok, or Instagram Reels.

## ✨ Features

- **Automated YouTube Transcripts:** Uses [Supadata API](https://supadata.ai/) to reliably fetch YouTube transcripts, bypassing common datacenter blocking issues.
- **Intelligent Clip Selection:** Leverages the **JEV** model (`~typesafe/jev-latest`) to semantically read transcripts in chunks, score moments for virality/engagement, and extract perfect start/end timestamps.
- **Live Preview Simulator:** Simulates a 9:16 vertical crop directly in the browser using the YouTube iframe API, letting you preview the exact crop without waiting for server processing.
- **Background Export (Local):** When running locally or on a VPS (like Railway), ClipJev uses `yt-dlp` and `ffmpeg` to download the high-res video in the background and precisely crop it to 9:16.

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- [Supadata API Key](https://supadata.ai/) (Free tier gives 100 requests/month)
- *(Optional)* `ffmpeg` and `yt-dlp` installed on your system if you want to enable the local download/export feature.

### Installation

1. Clone the repository and install dependencies:
   ```bash
   git clone <your-repo-url>
   cd clipjev
   npm install
   ```

2. Set up your environment variables. Create a `.env.local` file in the root directory:
   ```bash
   # Required: Supadata API Key for reliable YouTube transcript fetching
   SUPADATA_API_KEY=your_supadata_api_key

   # Required: The URL to your JEV model instance
   JEV_URL=your_jev_api_url
   
   # Optional: Set to "true" to disable server-side ffmpeg/yt-dlp downloads 
   # (Required when deploying to serverless environments like Vercel)
   NEXT_PUBLIC_DISABLE_DOWNLOADS=true
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🏗️ Architecture

- **Framework:** Next.js 15 (App Router)
- **Styling:** Tailwind CSS + Radix UI Primitives
- **Icons:** Lucide React
- **Video Player:** Native YouTube Iframe API
- **AI Processing:** JEV Decision Model (via standard HTTP requests)

## ☁️ Deployment (Vercel)

ClipJev's frontend and AI processing can be easily deployed to Vercel. However, because Vercel's serverless functions have strict size limits and execution timeouts, **the background video downloading (`yt-dlp` + `ffmpeg`) is not supported on Vercel.**

To deploy to Vercel:
1. Push your code to GitHub.
2. Import the project in the Vercel dashboard.
3. Add your `SUPADATA_API_KEY` and `JEV_URL` environment variables.
4. **Crucial:** Add `NEXT_PUBLIC_DISABLE_DOWNLOADS=true` to your Vercel environment variables. This hides the export UI and prevents the serverless functions from trying to spawn `ffmpeg`.

## 📜 License

MIT License
