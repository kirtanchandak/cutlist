const { Innertube } = require("youtubei.js");

async function test() {
  const yt = await Innertube.create();
  const info = await yt.getInfo("yslXlV2BP_Y");
  const transcriptData = await info.getTranscript();
  
  if (transcriptData && transcriptData.transcript) {
     console.log(transcriptData.transcript.content.body.initial_segments.slice(0, 3));
  } else {
     console.log("No transcript found");
  }
}

test().catch(console.error);
