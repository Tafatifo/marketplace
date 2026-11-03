/**
 * Quick content sanity check: parses /content and prints counts and errors.
 *   npx tsx scripts/content/check.ts
 */
import { loadContent } from "../../src/content/load";

const bundle = loadContent();
let lessons = 0;
let exercises = 0;
let vocab = 0;
for (const c of bundle.courses) {
  for (const u of c.units) {
    for (const l of u.lessons) {
      lessons++;
      exercises += l.exercises.length;
      vocab += l.vocab.length;
    }
  }
}
console.log(
  JSON.stringify(
    {
      courses: bundle.courses.length,
      lessons,
      exercises,
      vocab,
      passages: bundle.passages.length,
      scenarios: bundle.scenarios.length,
      placement: bundle.placement.length,
      taxonomy: bundle.taxonomy.length,
      audioClips: bundle.audio.length,
      errors: bundle.errors.length,
    },
    null,
    2,
  ),
);
for (const e of bundle.errors) console.log("ERROR", e);
if (process.argv.includes("--dump")) {
  const slug = process.argv[process.argv.indexOf("--dump") + 1];
  for (const c of bundle.courses)
    for (const u of c.units)
      for (const l of u.lessons) if (l.slug === slug) console.log(JSON.stringify(l, null, 2));
}
process.exit(bundle.errors.length ? 1 : 0);
