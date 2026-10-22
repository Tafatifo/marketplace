import "server-only";
import type { AudioRef, LessonContent } from "@/content/types";
import { countWords } from "@/content/text";
import { db } from "../db";

export interface PracticeSentence {
  text: string;
  translation?: string;
  audio?: AudioRef;
  source: string;
}

/**
 * Sentences for pronunciation practice, drawn from lessons the learner has opened
 * (or the first lessons of their level), optionally filtered to a focus word.
 */
export async function practiceSentences(userId: string, languageCode: string, levelCode: string, focusWord?: string, limit = 40): Promise<PracticeSentence[]> {
  const touched = await db.lessonProgress.findMany({
    where: { userId, lesson: { unit: { course: { languageCode } } } },
    select: { lessonId: true },
  });
  const lessons = await db.lesson.findMany({
    where: touched.length
      ? { id: { in: touched.map((t) => t.lessonId) }, kind: "LESSON" }
      : { kind: "LESSON", status: "PUBLISHED", unit: { course: { languageCode, levelCode } } },
    orderBy: [{ unit: { order: "asc" } }, { order: "asc" }],
    take: 30,
    select: { title: true, content: true },
  });
  const out: PracticeSentence[] = [];
  const seen = new Set<string>();
  const push = (s: PracticeSentence) => {
    const k = s.text.toLowerCase();
    const n = countWords(s.text);
    if (seen.has(k) || n < 2 || n > 16) return;
    if (focusWord && !k.includes(focusWord.toLowerCase())) return;
    seen.add(k);
    out.push(s);
  };
  for (const l of lessons) {
    for (const b of (l.content as unknown as LessonContent).blocks) {
      if (b.type === "dialogue") b.lines.forEach((x) => push({ text: x.text, translation: x.translation, audio: x.audio, source: l.title }));
      if (b.type === "vocabulary") b.items.forEach((v) => push({ text: v.example, translation: v.exampleTranslation, audio: v.exampleAudio, source: l.title }));
      if (b.type === "grammar") b.examples.forEach((e) => push({ text: e.text, translation: e.translation, audio: e.audio, source: l.title }));
    }
  }
  return out.slice(0, limit);
}
