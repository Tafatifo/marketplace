import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import {
  AudioCollector,
  buildCourse,
  buildPassage,
  buildPlacement,
  buildScenario,
  buildTaxonomy,
  type RawCourse,
  type RawPassage,
  type RawScenario,
  type RawUnit,
} from "./parse";
import { CEFR_LEVELS, COURSE_LANGUAGES, type CefrCode, type ContentBundle, type CourseLanguage } from "./types";

export const CONTENT_DIR = path.resolve(process.cwd(), "content");

function readYaml<T>(file: string, errors: string[]): T | null {
  try {
    const doc = YAML.parse(fs.readFileSync(file, "utf8"), { prettyErrors: true, uniqueKeys: true });
    return doc as T;
  } catch (err) {
    errors.push(`${path.relative(CONTENT_DIR, file)}: YAML error — ${(err as Error).message.split("\n")[0]}`);
    return null;
  }
}

const exists = (p: string) => fs.existsSync(p);

/**
 * Loads and normalises the whole curriculum from /content.
 *   content/courses/<lang>/<level>/course.yaml   syllabus, planned units, assessment items
 *   content/courses/<lang>/<level>/uNN.yaml      authored units
 *   content/readings/<lang>/<level>.yaml         reading & listening library
 *   content/scenarios/*.yaml                     AI coach scenarios
 *   content/placement/<lang>.yaml                placement test items
 *   content/taxonomy/<lang>.yaml                 grammar/skill taxonomy for mistake tracking
 */
export function loadContent(root = CONTENT_DIR, only?: { language: CourseLanguage; level?: CefrCode }): ContentBundle {
  const errors: string[] = [];
  const audio = new AudioCollector();
  const bundle: ContentBundle = { courses: [], passages: [], scenarios: [], placement: [], taxonomy: [], audio: [], errors };

  const wanted = (lang: string, level?: string) => !only || (only.language === lang && (!only.level || !level || only.level === level));

  for (const lang of COURSE_LANGUAGES) {
    for (const level of CEFR_LEVELS) {
      if (!wanted(lang, level)) continue;
      const dir = path.join(root, "courses", lang, level.toLowerCase());
      const coursePath = path.join(dir, "course.yaml");
      if (!exists(coursePath)) continue;
      const raw = readYaml<RawCourse>(coursePath, errors);
      if (!raw) continue;
      if (raw.language !== lang || raw.level !== level) {
        errors.push(`${coursePath}: language/level fields do not match the folder`);
        continue;
      }
      const units: RawUnit[] = [];
      for (const file of fs.readdirSync(dir).filter((f) => /^u\d{2}\.yaml$/.test(f)).sort()) {
        const u = readYaml<RawUnit>(path.join(dir, file), errors);
        if (u) units.push(u);
      }
      bundle.courses.push(buildCourse(raw, units, audio, errors));
    }
  }

  for (const lang of COURSE_LANGUAGES) {
    for (const level of CEFR_LEVELS) {
      if (!wanted(lang, level)) continue;
      const file = path.join(root, "readings", lang, `${level.toLowerCase()}.yaml`);
      if (!exists(file)) continue;
      const list = readYaml<RawPassage[]>(file, errors) ?? [];
      for (const raw of list) {
        try {
          bundle.passages.push(buildPassage(raw, lang as CourseLanguage, level as CefrCode, audio, errors));
        } catch (err) {
          errors.push(`readings/${lang}/${level}/${raw.slug}: ${(err as Error).message}`);
        }
      }
    }
  }

  const scenarioDir = path.join(root, "scenarios");
  if (exists(scenarioDir)) {
    for (const file of fs.readdirSync(scenarioDir).filter((f) => f.endsWith(".yaml")).sort()) {
      const raw = readYaml<RawScenario>(path.join(scenarioDir, file), errors);
      if (!raw) continue;
      try {
        bundle.scenarios.push(buildScenario(raw));
      } catch (err) {
        errors.push(`scenarios/${file}: ${(err as Error).message}`);
      }
    }
  }

  for (const lang of COURSE_LANGUAGES) {
    if (!wanted(lang)) continue;
    const file = path.join(root, "placement", `${lang}.yaml`);
    if (exists(file)) {
      const raw = readYaml<Record<string, string>>(file, errors);
      if (raw) bundle.placement.push(...buildPlacement(lang, raw, audio, errors));
    }
    const tax = path.join(root, "taxonomy", `${lang}.yaml`);
    if (exists(tax)) {
      const raw = readYaml<{ tags: string }>(tax, errors);
      if (raw) bundle.taxonomy.push(...buildTaxonomy(lang, raw.tags));
    }
  }

  bundle.audio = audio.all();
  return bundle;
}
