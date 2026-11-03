/**
 * Writes derived build artefacts used by the audio pipeline:
 *   content/dist/audio-manifest.json   every clip the curriculum needs
 */
import fs from "node:fs";
import path from "node:path";
import { loadContent } from "../../src/content/load";

const bundle = loadContent();
if (bundle.errors.length) {
  for (const e of bundle.errors) console.error("ERROR", e);
  process.exit(1);
}
const dist = path.resolve("content/dist");
fs.mkdirSync(dist, { recursive: true });
fs.writeFileSync(path.join(dist, "audio-manifest.json"), JSON.stringify(bundle.audio, null, 1));
console.log(`audio-manifest.json: ${bundle.audio.length} clips`);
