/**
 * Content QA and completeness manifest.
 *
 *   npm run content:qa              # writes reports/content-qa.json and content/manifest.json
 *   npm run content:qa -- --strict  # exit 1 on any error (CI)
 *
 * A lesson is only "complete" when it is authored, passes every QA rule with no errors,
 * and all of its audio exists and has not failed audio QA. Planned-but-unwritten lessons
 * are listed as "planned" — never as complete. Linguistic (native-speaker) review is
 * tracked in the database (/admin/review); everything in the files is AI-drafted until
 * a reviewer signs it off there.
 */
import fs from "node:fs";
import path from "node:path";
import { loadContent } from "../../src/content/load";
import { checkCourseProgression, checkLesson, checkPassage, type Issue } from "../../src/content/qa";
import { CEFR_LEVELS, COURSE_LANGUAGES, type LessonDef } from "../../src/content/types";

const ROOT = path.resolve("content");
const AUDIO_DIR = path.resolve(process.env.AUDIO_OUT_DIR ?? "public/audio");
const strict = process.argv.includes("--strict");

/** Targets used to judge whether a level's library is complete. */
const TARGETS = { unitsPerCourse: 8, lessonsPerUnit: 3, readingsPerCourse: 6, listeningsPerCourse: 4, placementPerLevel: 6 };

type AudioEntry = { qaStatus?: string; error?: string };
const index: Record<string, AudioEntry> = fs.existsSync(path.join(ROOT, "audio-index.json"))
  ? JSON.parse(fs.readFileSync(path.join(ROOT, "audio-index.json"), "utf8"))
  : {};

function audioKeys(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => audioKeys(v, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if ((k === "key" || k === "slowKey") && typeof v === "string" && v.endsWith(".mp3")) out.add(v);
      else audioKeys(v, out);
    }
  }
  return out;
}

function audioStatus(keys: Set<string>) {
  const s = { required: keys.size, generated: 0, missing: 0, pass: 0, review: 0, fail: 0, unchecked: 0 };
  for (const k of keys) {
    const e = index[k];
    if (!e || e.error || !fs.existsSync(path.join(AUDIO_DIR, k))) {
      s.missing++;
      continue;
    }
    s.generated++;
    if (e.qaStatus === "PASS") s.pass++;
    else if (e.qaStatus === "REVIEW") s.review++;
    else if (e.qaStatus === "FAIL") s.fail++;
    else s.unchecked++;
  }
  return s;
}

const bundle = loadContent(ROOT);
const issues: Issue[] = bundle.errors.map((message) => ({ severity: "error" as const, where: "load", message }));
const taxonomy = new Set(bundle.taxonomy.map((t) => t.key));
const GENERATED_TAG = /^(vocab|pron)\./;

function lessonReport(l: LessonDef, language: string) {
  const found = checkLesson(l, language);
  for (const e of l.exercises) {
    for (const t of e.tags) {
      if (!GENERATED_TAG.test(t) && !taxonomy.has(t)) found.push({ severity: "warning", where: e.key, message: `tag “${t}” is not in content/taxonomy/${language}.yaml` });
    }
  }
  issues.push(...found);
  const audio = audioStatus(audioKeys([l.content, l.exercises, l.vocab]));
  const errors = found.filter((i) => i.severity === "error").length;
  const reasons: string[] = [];
  if (errors) reasons.push(`${errors} QA errors`);
  if (audio.missing) reasons.push(`${audio.missing} audio clips missing`);
  if (audio.fail) reasons.push(`${audio.fail} audio clips failed QA`);
  return {
    slug: l.slug,
    title: l.title,
    kind: l.kind,
    status: reasons.length ? "incomplete" : "complete",
    reasons,
    exercises: l.exercises.length,
    authoredExercises: l.exercises.filter((e) => !e.derived).length,
    vocabulary: l.vocab.length,
    warnings: found.length - errors,
    audio,
    review: "ai-drafted",
  };
}

const courses = [];
for (const lang of COURSE_LANGUAGES) {
  for (const level of CEFR_LEVELS) {
    const c = bundle.courses.find((x) => x.language === lang && x.level === level);
    const passages = bundle.passages.filter((p) => p.language === lang && p.level === level);
    const passageReports = passages.map((p) => {
      const found = checkPassage(p);
      issues.push(...found);
      const audio = audioStatus(audioKeys([p.audio, p.lineAudio]));
      const errors = found.filter((i) => i.severity === "error").length;
      return { slug: p.slug, kind: p.kind, title: p.title, words: p.wordCount, status: errors || audio.missing || audio.fail ? "incomplete" : "complete", errors, audio };
    });
    const library = {
      reading: passageReports.filter((p) => p.kind === "READING").length,
      listening: passageReports.filter((p) => p.kind === "LISTENING").length,
      target: { reading: TARGETS.readingsPerCourse, listening: TARGETS.listeningsPerCourse },
      passages: passageReports,
    };
    if (!c) {
      courses.push({ slug: `${lang}-${level.toLowerCase()}`, language: lang, level, status: "missing", units: [], library });
      continue;
    }
    const planned = c.syllabus.plannedUnits;
    const units = planned.map((pu) => {
      const u = c.units.find((x) => x.order === pu.order);
      if (!u) {
        return { order: pu.order, title: pu.title, status: "planned", lessons: pu.lessons.map((t) => ({ title: t, status: "planned" })) };
      }
      const lessons = u.lessons.map((l) => lessonReport(l, lang));
      const missingPlanned = pu.lessons.filter((t) => !u.lessons.some((l) => l.title === t && l.kind === "LESSON"));
      const allComplete = lessons.every((l) => l.status === "complete") && !missingPlanned.length;
      return {
        order: u.order,
        title: u.title,
        status: allComplete ? "complete" : "incomplete",
        lessons: [...lessons, ...missingPlanned.map((t) => ({ title: t, status: "planned" }))],
      };
    });
    const finalUnit = c.units.find((u) => u.order === 99);
    const assessment = finalUnit?.lessons[0] ? lessonReport(finalUnit.lessons[0], lang) : null;
    const lessonStatuses = units.flatMap((u) => u.lessons.map((l) => l.status));
    const complete =
      units.length >= TARGETS.unitsPerCourse &&
      units.every((u) => u.status === "complete") &&
      assessment?.status === "complete" &&
      library.reading >= TARGETS.readingsPerCourse &&
      library.listening >= TARGETS.listeningsPerCourse &&
      passageReports.every((p) => p.status === "complete");
    courses.push({
      slug: c.slug,
      language: lang,
      level,
      title: c.title,
      status: complete ? "complete" : lessonStatuses.some((s) => s !== "planned") ? "in-progress" : "planned",
      lessons: {
        planned: lessonStatuses.length,
        authored: lessonStatuses.filter((s) => s !== "planned").length,
        complete: lessonStatuses.filter((s) => s === "complete").length,
      },
      units,
      assessment,
      library,
    });
  }
}
issues.push(...checkCourseProgression(bundle.courses));

const placement = Object.fromEntries(
  COURSE_LANGUAGES.map((lang) => {
    const items = bundle.placement.filter((p) => p.language === lang);
    const byLevel = Object.fromEntries(CEFR_LEVELS.map((lv) => [lv, items.filter((i) => i.level === lv).length]));
    return [lang, { items: items.length, byLevel, complete: CEFR_LEVELS.every((lv) => byLevel[lv]! >= TARGETS.placementPerLevel) }];
  }),
);

const allAudio = audioStatus(new Set(bundle.audio.map((a) => a.key)));
const lessonsAll = courses.flatMap((c) => ("units" in c ? c.units.flatMap((u) => u.lessons) : []));
const errors = issues.filter((i) => i.severity === "error");
const warnings = issues.filter((i) => i.severity === "warning");

const manifest = {
  generatedAt: new Date().toISOString(),
  note: "Completeness is computed from the files in /content and the generated audio. 'complete' means authored, passing automatic QA and with all audio present — not linguistically verified. All content is AI-drafted until a native-speaker review is recorded in /admin.",
  targets: TARGETS,
  totals: {
    courses: { target: COURSE_LANGUAGES.length * CEFR_LEVELS.length, present: bundle.courses.length, complete: courses.filter((c) => c.status === "complete").length },
    units: {
      planned: courses.reduce((n, c) => n + c.units.length, 0),
      authored: courses.reduce((n, c) => n + c.units.filter((u) => u.status !== "planned").length, 0),
      complete: courses.reduce((n, c) => n + c.units.filter((u) => u.status === "complete").length, 0),
    },
    lessons: {
      planned: lessonsAll.length,
      authored: lessonsAll.filter((l) => l.status !== "planned").length,
      complete: lessonsAll.filter((l) => l.status === "complete").length,
    },
    exercises: bundle.courses.reduce((n, c) => n + c.units.reduce((m, u) => m + u.lessons.reduce((k, l) => k + l.exercises.length, 0), 0), 0),
    vocabulary: bundle.courses.reduce((n, c) => n + c.units.reduce((m, u) => m + u.lessons.reduce((k, l) => k + l.vocab.length, 0), 0), 0),
    passages: { reading: bundle.passages.filter((p) => p.kind === "READING").length, listening: bundle.passages.filter((p) => p.kind === "LISTENING").length },
    scenarios: bundle.scenarios.length,
    placementItems: bundle.placement.length,
    taxonomyTags: bundle.taxonomy.length,
    audio: allAudio,
    qa: { errors: errors.length, warnings: warnings.length },
  },
  placement,
  courses,
};

fs.mkdirSync("reports", { recursive: true });
fs.writeFileSync(path.join(ROOT, "manifest.json"), JSON.stringify(manifest, null, 1) + "\n");
fs.writeFileSync("reports/content-qa.json", JSON.stringify({ generatedAt: manifest.generatedAt, errors, warnings }, null, 1) + "\n");

const t = manifest.totals;
console.log(`Courses   ${t.courses.present}/${t.courses.target} present · ${t.courses.complete} complete`);
console.log(`Units     ${t.units.authored}/${t.units.planned} authored · ${t.units.complete} complete`);
console.log(`Lessons   ${t.lessons.authored}/${t.lessons.planned} authored · ${t.lessons.complete} complete`);
console.log(`Content   ${t.exercises} exercises · ${t.vocabulary} vocabulary items · ${t.passages.reading} readings · ${t.passages.listening} listenings · ${t.scenarios} scenarios · ${t.placementItems} placement items`);
console.log(`Audio     ${t.audio.generated}/${t.audio.required} generated · ${t.audio.pass} pass · ${t.audio.review} review · ${t.audio.fail} fail · ${t.audio.unchecked} unchecked · ${t.audio.missing} missing`);
console.log(`QA        ${errors.length} errors · ${warnings.length} warnings  (reports/content-qa.json)`);
for (const e of errors.slice(0, 40)) console.log(`  ERROR ${e.where}: ${e.message}`);
if (strict && errors.length) process.exit(1);
