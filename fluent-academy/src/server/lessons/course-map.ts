import "server-only";
import { db } from "../db";
import { entitlementFor } from "../learner";

export interface MapLesson {
  id: string;
  slug: string;
  title: string;
  summary: string;
  kind: string;
  minutes: number;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  bestScore: number;
  locked: boolean;
}

export interface MapUnit {
  slug: string;
  order: number;
  title: string;
  theme: string;
  description: string;
  isFree: boolean;
  lessons: MapLesson[];
  completed: number;
  total: number;
}

/** The course structure for one language and level with the learner's progress overlaid. */
export async function courseMap(userId: string, languageCode: string, levelCode: string) {
  const [course, ent] = await Promise.all([
    db.course.findUnique({
      where: { languageCode_levelCode: { languageCode, levelCode } },
      include: {
        units: {
          orderBy: { order: "asc" },
          include: {
            lessons: {
              where: { status: "PUBLISHED" },
              orderBy: { order: "asc" },
              include: { progress: { where: { userId }, select: { status: true, bestScore: true } } },
            },
          },
        },
      },
    }),
    entitlementFor(userId),
  ]);
  if (!course) return null;
  const units: MapUnit[] = course.units
    .filter((u) => u.lessons.length > 0)
    .map((u) => {
      const lessons: MapLesson[] = u.lessons.map((l) => ({
        id: l.id,
        slug: l.slug,
        title: l.title,
        summary: l.summary,
        kind: l.kind,
        minutes: l.estimatedMinutes,
        status: (l.progress[0]?.status ?? "NOT_STARTED") as MapLesson["status"],
        bestScore: l.progress[0]?.bestScore ?? 0,
        locked: (l.kind === "LEVEL_ASSESSMENT" && !ent.isPremium) || (ent.plan.limits.freeUnitsOnly && !u.isFree),
      }));
      return {
        slug: u.slug,
        order: u.order,
        title: u.title,
        theme: u.theme,
        description: u.description,
        isFree: u.isFree,
        lessons,
        completed: lessons.filter((l) => l.status === "COMPLETED").length,
        total: lessons.length,
      };
    });
  const all = units.flatMap((u) => u.lessons);
  const next = all.find((l) => l.status === "IN_PROGRESS" && !l.locked) ?? all.find((l) => l.status !== "COMPLETED" && !l.locked) ?? null;
  return {
    course: { id: course.id, slug: course.slug, title: course.title, description: course.description, syllabus: course.syllabus },
    units,
    next,
    completed: all.filter((l) => l.status === "COMPLETED").length,
    total: all.length,
    isPremium: ent.isPremium,
  };
}

export async function publishedLevels(languageCode: string) {
  const rows = await db.course.findMany({ where: { languageCode, status: "PUBLISHED" }, select: { levelCode: true }, orderBy: { level: { order: "asc" } } });
  return rows.map((r) => r.levelCode);
}
