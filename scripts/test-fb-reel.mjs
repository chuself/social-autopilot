import { publishFacebookVideo } from "../src/publish/reels.js";
const r = await publishFacebookVideo({
  videoUrl: process.env.TEST_VIDEO_URL,
  caption: "Jaribio: reel ya Operra kwenye Facebook Reels.",
  dryRun: false,
});
console.log("result:", JSON.stringify(r));
