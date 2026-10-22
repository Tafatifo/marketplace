import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import type { Prisma, PrismaClient } from "@prisma/client";
import { lines, splitFields } from "@/content/dsl";
import { loadContent } from "@/content/load";
import type { ContentBundle, CourseDef, ExerciseDef, LessonDef } from "@/content/types";
import { LANGUAGE_META, VOICES } from "@/content/voices";

/**
 * Imports the curriculum from /content into the database.
 *
 * - New lessons are created directly (status PUBLISHED when `publish`, otherwise DRAFT).
 * - Changed lessons get a new LessonRevision. With `publish` the revision is applied
 *   immediately; otherwise it waits in the review queue (/admin/review).
 * - Exercise rows are matched by their stable `key`, so learner attempts survive
 *   re-imports. Exercises removed from the source are deactivated, never deleted.
 */

export interface ImportOptions {
  publish: boolean;
  resetPlans?: boolean;
  triggeredBy?: string;
  root?: string;
  log?: (msg: string) => void;
}

export interface ImportSummary {
  courses: number;
  units: number;
  lessonsCreated: number;
  lessonsUpdated: number;
  lessonsUnchanged: number;
  revisionsPending: number;
  exercises: number;
  exercisesDeactivated: number;
  vocabulary: number;
  passages: number;
  scenarios: number;
  placement: number;
  audioAssets: number;
  errors: string[];
}

const LEVELS = [
  { code: "A1", order: 1, name: "Beginner", guidedHours: 90, description: "Understand and use familiar everyday expressions and very basic phrases." },
  { code: "A2", order: 2, name: "Elementary", guidedHours: 180, description: "Communicate in simple, routine tasks on familiar topics." },
  { code: "B1", order: 3, name: "Intermediate", guidedHours: 380, description: "Deal with most travel situations and describe experiences, plans and opinions." },
  { code: "B2", order: 4, name: "Upper intermediate", guidedHours: 560, description: "Interact with fluency and spontaneity and argue a viewpoint on a wide range of topics." },
];

type Tx = Prisma.TransactionClient;

export function lessonSnapshot(l: LessonDef) {
  return {
    title: l.title,
    summary: l.summary,
    minutes: l.minutes,
    skills: l.skills,
    objectives: l.objectives,
    grammarTags: l.grammarTags,
    kind: l.kind,
    content: l.content,
    exercises: l.exercises,
  };
}
export type LessonSnapshot = ReturnType<typeof lessonSnapshot>;

/** Applies a lesson snapshot (from import or the editor) to the live tables. */
export async function applyLessonSnapshot(tx: Tx, lessonId: string, slug: string, snap: LessonSnapshot, sourceHash: string | null) {
  await tx.lesson.update({
    where: { id: lessonId },
    data: {
      title: snap.title,
      summary: snap.summary,
      estimatedMinutes: snap.minutes,
      skills: snap.skills,
      objectives: snap.objectives as Prisma.InputJsonValue,
      grammarTags: snap.grammarTags,
      content: snap.content as unknown as Prisma.InputJsonValue,
      kind: snap.kind,
      sourceHash,
      status: "PUBLISHED",
      publishedAt: new Date(),
      version: { increment: 1 },
    },
  });
  const keys = new Set(snap.exercises.map((e) => e.key));
  for (const e of snap.exercises) await upsertExercise(tx, lessonId, e);
  const stale = await tx.exercise.updateMany({
    where: { lessonId, isActive: true, key: { notIn: [...keys] } },
    data: { isActive: false },
  });
  return stale.count;
}

async function upsertExercise(tx: Tx, lessonId: string, e: ExerciseDef) {
  const data = {
    lessonId,
    order: e.order,
    type: e.type,
    skill: e.skill,
    prompt: e.prompt as unknown as Prisma.InputJsonValue,
    answer: e.answer as unknown as Prisma.InputJsonValue,
    explanation: e.explanation,
    tags: e.tags,
    objective: e.objective ?? null,
    points: e.points,
    derived: e.derived,
    isActive: true,
  };
  await tx.exercise.upsert({ where: { key: e.key }, create: { key: e.key, ...data }, update: data });
}

export async function seedReferenceData(db: PrismaClient, opts: { resetPlans?: boolean; root?: string } = {}) {
  const root = opts.root ?? path.resolve(process.cwd(), "content");
  for (const [code, meta] of Object.entries(LANGUAGE_META)) {
    const voices = Object.values(VOICES[code] ?? {}).map((v) => ({ id: v.id, label: v.label, gender: v.gender, license: v.license }));
    await db.language.upsert({
      where: { code },
      create: { code, name: meta.name, nativeName: meta.nativeName, locale: meta.locale, sortOrder: meta.order, voices, meta: { flagColors: meta.flagColors } },
      update: { name: meta.name, nativeName: meta.nativeName, locale: meta.locale, sortOrder: meta.order, voices, meta: { flagColors: meta.flagColors } },
    });
  }
  for (const l of LEVELS) await db.cefrLevel.upsert({ where: { code: l.code }, create: l, update: l });

  const plansFile = path.join(root, "plans.yaml");
  if (fs.existsSync(plansFile)) {
    const plans = YAML.parse(fs.readFileSync(plansFile, "utf8")) as Record<string, {
      name: string; description: string; priceMonthlyCents: number; priceYearlyCents: number; currency: string;
      sortOrder: number; limits: Record<string, unknown>; features: string[];
    }>;
    for (const [code, p] of Object.entries(plans)) {
      const data = {
        name: p.name,
        description: p.description,
        priceMonthlyCents: p.priceMonthlyCents,
        priceYearlyCents: p.priceYearlyCents,
        currency: p.currency,
        sortOrder: p.sortOrder,
        limits: p.limits as Prisma.InputJsonValue,
        features: p.features,
      };
      const existing = await db.plan.findUnique({ where: { code } });
      if (!existing) await db.plan.create({ data: { code, ...data } });
      else if (opts.resetPlans) await db.plan.update({ where: { code }, data });
    }
  }

  const achFile = path.join(root, "achievements.yaml");
  if (fs.existsSync(achFile)) {
    const raw = YAML.parse(fs.readFileSync(achFile, "utf8")) as { achievements: string };
    let order = 0;
    for (const line of lines(raw.achievements)) {
      const [code, title, description, icon, category, threshold] = splitFields(line);
      const data = { title: title!, description: description!, icon: icon!, category: category!, threshold: Number(threshold), sortOrder: ++order };
      await db.achievement.upsert({ where: { code: code! }, create: { code: code!, ...data }, update: data });
    }
  }
}

async function importCourse(db: PrismaClient, c: CourseDef, opts: ImportOptions, s: ImportSummary) {
  const course = await db.course.upsert({
    where: { languageCode_levelCode: { languageCode: c.language, levelCode: c.level } },
    create: {
      slug: c.slug, languageCode: c.language, levelCode: c.level, title: c.title, description: c.description,
      syllabus: c.syllabus as unknown as Prisma.InputJsonValue, sourceHash: c.sourceHash, status: "PUBLISHED",
    },
    update: { title: c.title, description: c.description, syllabus: c.syllabus as unknown as Prisma.InputJsonValue, sourceHash: c.sourceHash },
  });
  s.courses++;

  for (const u of c.units) {
    const unit = await db.unit.upsert({
      where: { slug: u.slug },
      create: {
        slug: u.slug, courseId: course.id, order: u.order, title: u.title, description: u.description, theme: u.theme,
        objectives: u.objectives, canDo: u.canDo, isFree: u.isFree,
      },
      update: { order: u.order, title: u.title, description: u.description, theme: u.theme, objectives: u.objectives, canDo: u.canDo, isFree: u.isFree },
    });
    s.units++;

    for (const l of u.lessons) {
      const snap = lessonSnapshot(l);
      const existing = await db.lesson.findUnique({ where: { slug: l.slug }, select: { id: true, sourceHash: true, version: true } });
      if (!existing) {
        await db.$transaction(async (tx) => {
          const created = await tx.lesson.create({
            data: {
              slug: l.slug, unitId: unit.id, order: l.order, kind: l.kind, title: l.title, summary: l.summary,
              estimatedMinutes: l.minutes, skills: l.skills, objectives: l.objectives, grammarTags: l.grammarTags,
              content: l.content as unknown as Prisma.InputJsonValue, sourceHash: l.sourceHash,
              status: opts.publish ? "PUBLISHED" : "DRAFT", publishedAt: opts.publish ? new Date() : null,
            },
          });
          for (const e of l.exercises) await upsertExercise(tx, created.id, e);
          await tx.lessonRevision.create({
            data: { lessonId: created.id, version: 1, source: "IMPORT", snapshot: snap as unknown as Prisma.InputJsonValue, status: opts.publish ? "PUBLISHED" : "DRAFT", publishedAt: opts.publish ? new Date() : null },
          });
        }, { timeout: 60_000 });
        s.lessonsCreated++;
        s.exercises += l.exercises.length;
      } else if (existing.sourceHash !== l.sourceHash) {
        const last = await db.lessonRevision.findFirst({ where: { lessonId: existing.id }, orderBy: { version: "desc" } });
        const version = (last?.version ?? existing.version) + 1;
        await db.$transaction(async (tx) => {
          await tx.lessonRevision.create({
            data: {
              lessonId: existing.id, version, source: "IMPORT", snapshot: snap as unknown as Prisma.InputJsonValue,
              status: opts.publish ? "PUBLISHED" : "IN_REVIEW", publishedAt: opts.publish ? new Date() : null,
              note: "Imported from /content",
            },
          });
          await tx.lesson.update({ where: { id: existing.id }, data: { unitId: unit.id, order: l.order } });
          if (opts.publish) {
            s.exercisesDeactivated += await applyLessonSnapshot(tx, existing.id, l.slug, snap, l.sourceHash);
          }
        }, { timeout: 60_000 });
        if (opts.publish) s.lessonsUpdated++;
        else s.revisionsPending++;
        s.exercises += l.exercises.length;
      } else {
        s.lessonsUnchanged++;
      }

      const lessonRow = await db.lesson.findUnique({ where: { slug: l.slug }, select: { id: true } });
      for (const v of l.vocab) {
        const data = {
          languageCode: c.language, levelCode: c.level, lessonId: lessonRow?.id ?? null, term: v.term, translation: v.gloss,
          translations: (v.translations ?? {}) as Prisma.InputJsonValue, partOfSpeech: v.pos ?? null, gender: v.gender ?? null,
          example: v.example, exampleTranslation: v.exampleTranslation ?? null, collocations: v.collocations,
          usageNote: v.note ?? null, audioKey: v.audio?.key ?? null, exampleAudioKey: v.exampleAudio?.key ?? null,
          tags: [`vocab.${l.slug}`],
        };
        await db.vocabularyItem.upsert({ where: { key: v.key }, create: { key: v.key, ...data }, update: data });
        s.vocabulary++;
      }
    }
  }
}

/** Audio metadata produced by services/speech/generate_audio.py (and QA). */
interface AudioIndexEntry {
  key: string; language: string; text: string; voice: string; speed: string; durationMs: number; bytes: number;
  checksum: string; qaStatus?: string; qaScore?: number; qaTranscript?: string; wordTimings?: unknown; ipa?: string;
}

export async function importAudioIndex(db: PrismaClient, root: string) {
  const file = path.join(root, "audio-index.json");
  if (!fs.existsSync(file)) return 0;
  const entries = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, AudioIndexEntry>;
  let n = 0;
  const batch = Object.values(entries);
  for (let i = 0; i < batch.length; i += 500) {
    await db.$transaction(
      batch.slice(i, i + 500).map((e) => {
        const data = {
          languageCode: e.language, text: e.text, textHash: e.checksum.slice(0, 16), voice: e.voice, speed: e.speed,
          durationMs: e.durationMs, bytes: e.bytes, checksum: e.checksum, qaStatus: e.qaStatus ?? "UNCHECKED",
          qaScore: e.qaScore ?? null, qaTranscript: e.qaTranscript ?? null,
          wordTimings: (e.wordTimings ?? undefined) as Prisma.InputJsonValue | undefined,
        };
        return db.audioAsset.upsert({ where: { key: e.key }, create: { key: e.key, ...data }, update: data });
      }),
    );
    n += Math.min(500, batch.length - i);
  }
  // Attach automatic IPA (from the TTS phonemiser) to vocabulary that has none from an editor.
  const withIpa = batch.filter((e) => e.ipa && e.speed === "normal");
  const ipaByKey = new Map(withIpa.map((e) => [e.key, e.ipa!]));
  const vocab = await db.vocabularyItem.findMany({ where: { audioKey: { in: [...ipaByKey.keys()] } }, select: { id: true, audioKey: true, ipaSource: true } });
  for (const v of vocab) {
    if (v.ipaSource === "editor") continue;
    await db.vocabularyItem.update({ where: { id: v.id }, data: { ipa: ipaByKey.get(v.audioKey!), ipaSource: "espeak-ng" } });
  }
  return n;
}

export async function runImport(db: PrismaClient, opts: ImportOptions, bundle?: ContentBundle): Promise<ImportSummary> {
  const root = opts.root ?? path.resolve(process.cwd(), "content");
  const log = opts.log ?? (() => {});
  const content = bundle ?? loadContent(root);
  const summary: ImportSummary = {
    courses: 0, units: 0, lessonsCreated: 0, lessonsUpdated: 0, lessonsUnchanged: 0, revisionsPending: 0, exercises: 0,
    exercisesDeactivated: 0, vocabulary: 0, passages: 0, scenarios: 0, placement: 0, audioAssets: 0, errors: content.errors,
  };
  const record = await db.contentImport.create({ data: { status: "RUNNING", publish: opts.publish, triggeredBy: opts.triggeredBy ?? "cli" } });
  try {
    if (content.errors.length) throw new Error(`Content has ${content.errors.length} validation errors; fix them before importing.`);
    await seedReferenceData(db, { resetPlans: opts.resetPlans, root });
    for (const c of content.courses) {
      log(`Importing ${c.slug}…`);
      await importCourse(db, c, opts, summary);
    }
    for (const p of content.passages) {
      const data = {
        languageCode: p.language, levelCode: p.level, kind: p.kind, title: p.title, summary: p.summary, topic: p.topic,
        body: p.body, translation: p.translation ?? null, wordCount: p.wordCount, estimatedMinutes: p.minutes,
        glossary: p.glossary as Prisma.InputJsonValue,
        questions: { items: p.questions, speakers: p.speakers ?? [], lineAudio: p.lineAudio ?? [] } as unknown as Prisma.InputJsonValue,
        audioKey: p.audio?.key ?? null, isFree: p.isFree, sourceHash: p.sourceHash, status: "PUBLISHED" as const,
      };
      await db.readingPassage.upsert({ where: { slug: p.slug }, create: { slug: p.slug, ...data }, update: data });
      summary.passages++;
    }
    for (const sc of content.scenarios) {
      const data = {
        title: sc.title, description: sc.description, minLevel: sc.minLevel, maxLevel: sc.maxLevel, category: sc.category,
        goals: sc.goals, focusTags: sc.focusTags, roles: sc.roles, isFree: sc.isFree, sortOrder: sc.order,
        openers: Object.fromEntries(Object.entries(sc.perLanguage).map(([k, v]) => [k, { text: v.opener, translation: v.openerTranslation }])),
        vocabulary: Object.fromEntries(Object.entries(sc.perLanguage).map(([k, v]) => [k, v.vocabulary])),
        mockScript: Object.fromEntries(Object.entries(sc.perLanguage).map(([k, v]) => [k, v.script])) as unknown as Prisma.InputJsonValue,
      };
      await db.scenario.upsert({ where: { slug: sc.slug }, create: { slug: sc.slug, ...data }, update: data });
      summary.scenarios++;
    }
    for (const p of content.placement) {
      const data = {
        languageCode: p.language, levelCode: p.level, skill: p.skill, order: p.order,
        prompt: p.prompt as unknown as Prisma.InputJsonValue, answer: p.answer as unknown as Prisma.InputJsonValue, explanation: p.explanation,
      };
      await db.placementItem.upsert({ where: { key: p.key }, create: { key: p.key, ...data }, update: data });
      summary.placement++;
    }
    summary.audioAssets = await importAudioIndex(db, root);
    await db.contentImport.update({
      where: { id: record.id },
      data: { status: "SUCCEEDED", finishedAt: new Date(), summary: summary as unknown as Prisma.InputJsonValue },
    });
  } catch (err) {
    summary.errors = [...summary.errors, (err as Error).message];
    await db.contentImport.update({
      where: { id: record.id },
      data: { status: "FAILED", finishedAt: new Date(), summary: summary as unknown as Prisma.InputJsonValue },
    });
    throw Object.assign(err as Error, { summary });
  }
  return summary;
}
