import "server-only";
import { db } from "./db";
import { entitlementFor } from "./learner";

export async function libraryItems(userId: string, languageCode: string, kind: "READING" | "LISTENING", level?: string, q?: string) {
  const [passages, done, ent] = await Promise.all([
    db.readingPassage.findMany({
      where: {
        languageCode,
        kind,
        status: "PUBLISHED",
        ...(level && level !== "all" ? { levelCode: level } : {}),
        ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { summary: { contains: q, mode: "insensitive" } }, { topic: { contains: q, mode: "insensitive" } }] } : {}),
      },
      orderBy: [{ levelCode: "asc" }, { title: "asc" }],
      select: { id: true, slug: true, title: true, summary: true, levelCode: true, topic: true, estimatedMinutes: true, wordCount: true, isFree: true },
    }),
    db.readingProgress.findMany({ where: { userId, status: "COMPLETED" }, select: { passageId: true } }),
    entitlementFor(userId),
  ]);
  const completed = new Set(done.map((d) => d.passageId));
  return passages.map((p) => ({
    slug: p.slug,
    title: p.title,
    summary: p.summary,
    level: p.levelCode,
    topic: p.topic,
    minutes: p.estimatedMinutes,
    words: p.wordCount,
    completed: completed.has(p.id),
    locked: !p.isFree && !ent.plan.limits.premiumReadings,
  }));
}
