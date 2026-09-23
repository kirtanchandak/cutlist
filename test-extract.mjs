import { YouTubeTranscriptApi } from "extract-youtube";

async function test() {
  // Try a very popular video with known captions
  try {
    const api = new YouTubeTranscriptApi();
    const result = await api.listTranscripts("dQw4w9WgXcQ");
    const transcript = result.findTranscript(["en"]);
    const data = await transcript.fetch();
    console.log("SUCCESS! Got entries:", data.snippets.length);
    console.log("First:", data.snippets[0]);
  } catch(e) {
    console.error("Error:", e.message);
  }
}
test();
