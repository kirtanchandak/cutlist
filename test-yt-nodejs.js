const { YouTubeTranscriptApi } = require("youtube-transcript-nodejs");

async function test() {
  try {
    const api = new YouTubeTranscriptApi();
    const transcriptList = await api.list("yslXlV2BP_Y");
    console.log("List:", transcriptList);
    const transcript = transcriptList.findTranscript(['en']);
    const data = await transcript.fetch();
    console.log("Data length:", data.length);
    console.log(data.slice(0, 2));
  } catch(e) {
    console.error("Error:", e.message);
  }
}
test();
