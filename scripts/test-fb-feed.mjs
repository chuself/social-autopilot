/** Post one real feed photo post to prove the two-step path works. */
import { publish } from "../src/publish/facebook.js";
const r = await publish({
  imageUrl: process.env.TEST_IMAGE_URL,
  caption: "Jaribio la mfumo — post hii inaonekana kwenye ukurasa wa Operra.Tech.",
  dryRun: false,
});
console.log("result:", JSON.stringify(r));
