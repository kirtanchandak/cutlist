const { Innertube } = require("youtubei.js");

async function test() {
  const yt = await Innertube.create();
  const info = await yt.getInfo("yslXlV2BP_Y");
  
  if (info.captions && info.captions.caption_tracks.length > 0) {
      const enTrack = info.captions.caption_tracks.find(t => t.language_code === 'en') || info.captions.caption_tracks[0];
      console.log("Track:", enTrack.base_url);
      const res = await fetch(enTrack.base_url);
      const text = await res.text();
      console.log("Raw text:", text.slice(0, 500));
  }
}

test().catch(console.error);
