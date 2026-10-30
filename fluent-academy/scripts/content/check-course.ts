/**
 * Validates one course (or one language's placement test) in isolation — used while
 * authoring, so work in progress elsewhere in /content doesn't get in the way.
 *
 *   npx tsx scripts/content/check-course.ts fr A1          # course, units, readings
 *   npx tsx scripts/content/check-course.ts da --placement  # placement test + scenarios for a language
 *
 * Exit code 1 when there are errors. Warnings are printed but don't fail.
 */
import { loadContent } from "../../src/content/load";
import { checkCourseProgression, checkLesson, checkPassage, LESSON_REQUIREMENTS, type Issue } from "../../src/content/qa";
import { CEFR_LEVELS, COURSE_LANGUAGES, type CefrCode, type CourseLanguage } from "../../src/content/types";

const [language, levelArg] = process.argv.slice(2) as [CourseLanguage, string | undefined];
if (!COURSE_LANGUAGES.includes(language)) {
  console.error(`Usage: check-course.ts <${COURSE_LANGUAGES.join("|")}> <A1|A2|B1|B2>|--placement`);
  process.exit(2);
}
const placementOnly = levelArg === "--placement";
const level = placementOnly ? undefined : (levelArg?.toUpperCase() as CefrCode | undefined);
if (!placementOnly && (!level || !CEFR_LEVELS.includes(level))) {
  console.error("Give a level (A1, A2, B1, B2) or --placement.");
  process.exit(2);
}

const bundle = loadContent(undefined, { language, level });
const issues: Issue[] = bundle.errors.map((message) => ({ severity: "error" as const, where: "parse", message }));
const tags = new Set(bundle.taxonomy.map((t) => t.key));
const GENERATED = /^(vocab|pron)\./;

if (placementOnly) {
  const items = bundle.placement.filter((p) => p.language === language);
  const byLevel = Object.fromEntries(CEFR_LEVELS.map((lv) => [lv, items.filter((i) => i.level === lv).length]));
  console.log(`Placement ${language}: ${items.length} items`, byLevel);
  for (const lv of CEFR_LEVELS) if ((byLevel[lv] ?? 0) < 6) issues.push({ severity: "error", where: "placement", message: `${lv} has ${byLevel[lv] ?? 0} items (min 6)` });
  const scen = bundle.scenarios.filter((s) => s.perLanguage[language]);
  console.log(`Scenarios with a ${language} version: ${scen.length}/${bundle.scenarios.length}`);
  for (const s of bundle.scenarios) if (!s.perLanguage[language]) issues.push({ severity: "warning", where: s.slug, message: `no ${language} version` });
} else {
  const course = bundle.courses.find((c) => c.language === language && c.level === level);
  if (!course) issues.push({ severity: "error", where: "course", message: `content/courses/${language}/${level!.toLowerCase()}/course.yaml not found` });
  else {
    const planned = course.syllabus.plannedUnits;
    console.log(`${course.slug}: ${course.title}`);
    for (const pu of planned) {
      const u = course.units.find((x) => x.order === pu.order);
      if (!u) {
        console.log(`  unit ${pu.order} ${pu.title}: NOT WRITTEN`);
        continue;
      }
      const lessons = u.lessons.filter((l) => l.kind === "LESSON");
      const missing = pu.lessons.filter((t) => !lessons.some((l) => l.title === t));
      if (missing.length) issues.push({ severity: "error", where: u.slug, message: `planned lessons missing or retitled: ${missing.join("; ")}` });
      if (!u.lessons.some((l) => l.kind === "UNIT_REVIEW")) issues.push({ severity: "error", where: u.slug, message: "no unit review (add a review: block)" });
      const counts = u.lessons.map((l) => `${l.kind === "LESSON" ? "L" : "R"}${l.exercises.length}`).join(" ");
      console.log(`  unit ${u.order} ${u.title}: ${lessons.length} lessons [exercises ${counts}] vocab ${lessons.reduce((n, l) => n + l.vocab.length, 0)}`);
      for (const l of u.lessons) {
        issues.push(...checkLesson(l, language));
        for (const e of l.exercises) for (const t of e.tags) if (!GENERATED.test(t) && !tags.has(t)) issues.push({ severity: "error", where: e.key, message: `unknown tag “${t}” — use a key from content/taxonomy/${language}.yaml` });
      }
    }
    const final = course.units.find((u) => u.order === 99)?.lessons[0];
    if (final) {
      console.log(`  level assessment: ${final.exercises.length} items`);
      issues.push(...checkLesson(final, language));
    }
    issues.push(...checkCourseProgression([course]));
  }
  const passages = bundle.passages.filter((p) => p.language === language && p.level === level);
  const reading = passages.filter((p) => p.kind === "READING").length;
  const listening = passages.filter((p) => p.kind === "LISTENING").length;
  console.log(`  library: ${reading} reading, ${listening} listening (target 6 + 4)`);
  for (const p of passages) issues.push(...checkPassage(p));
}

const errors = issues.filter((i) => i.severity === "error");
const warnings = issues.filter((i) => i.severity === "warning");
for (const w of warnings) console.log(`  warning ${w.where}: ${w.message}`);
for (const e of errors) console.log(`  ERROR ${e.where}: ${e.message}`);
console.log(`${errors.length} errors, ${warnings.length} warnings · requirements per lesson: ${JSON.stringify(LESSON_REQUIREMENTS)}`);
process.exit(errors.length ? 1 : 0);
