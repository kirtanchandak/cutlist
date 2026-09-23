const { Innertube } = require("youtubei.js");

async function test() {
  const yt = await Innertube.create();
  const info = await yt.getInfo("yslXlV2BP_Y");
  
  if (info.captions && info.captions.caption_tracks.length > 0) {
      console.log("Captions available:", info.captions.caption_tracks.length);
      const url = info.captions.caption_tracks[0].base_url;
      console.log("Caption URL:", url);
      const res = await fetch(url);
      const text = await res.text();
      console.log(text.slice(0, 200));
  } else {
      console.log("No captions in info");
  }
}

test().catch(console.error);
