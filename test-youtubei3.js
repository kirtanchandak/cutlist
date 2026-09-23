const { Innertube } = require("youtubei.js");

async function test() {
  const yt = await Innertube.create();
  const info = await yt.getInfo("yslXlV2BP_Y");
  
  if (info.captions && info.captions.caption_tracks.length > 0) {
      const enTrack = info.captions.caption_tracks.find(t => t.language_code === 'en') || info.captions.caption_tracks[0];
      const url = enTrack.base_url + "&fmt=json3";
      console.log("URL:", url);
      const res = await fetch(url);
      const json = await res.json();
      console.log("Events:", json.events.length);
      console.log(json.events[0]);
      console.log(json.events[1]);
  }
}

test().catch(console.error);
