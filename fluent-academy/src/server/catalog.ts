import "server-only";
import type { CourseSyllabus } from "@/content/types";
import { db } from "./db";

export interface CatalogCourse {
  id: string;
  slug: string;
  languageCode: string;
  levelCode: string;
  title: string;
  description: string;
  syllabus: CourseSyllabus;
  units: { slug: string; order: number; title: string; theme: string; lessons: number; isFree: boolean }[];
  lessonCount: number;
  exerciseCount: number;
}

/** Published curriculum, used by marketing syllabus pages and course navigation. */
export async function getCatalog(languageCode?: string): Promise<CatalogCourse[]> {
  try {
    const courses = await db.course.findMany({
      where: { status: "PUBLISHED", ...(languageCode ? { languageCode } : {}) },
      orderBy: [{ language: { sortOrder: "asc" } }, { level: { order: "asc" } }],
      include: {
        units: {
          orderBy: { order: "asc" },
          include: {
            lessons: { where: { status: "PUBLISHED" }, select: { id: true, _count: { select: { exercises: { where: { isActive: true } } } } } },
          },
        },
      },
    });
    return courses.map((c) => ({
      id: c.id,
      slug: c.slug,
      languageCode: c.languageCode,
      levelCode: c.levelCode,
      title: c.title,
      description: c.description,
      syllabus: c.syllabus as unknown as CourseSyllabus,
      units: c.units.map((u) => ({ slug: u.slug, order: u.order, title: u.title, theme: u.theme, lessons: u.lessons.length, isFree: u.isFree })),
      lessonCount: c.units.reduce((n, u) => n + u.lessons.length, 0),
      exerciseCount: c.units.reduce((n, u) => n + u.lessons.reduce((m, l) => m + l._count.exercises, 0), 0),
    }));
  } catch {
    return [];
  }
}

export async function getLanguages() {
  try {
    return await db.language.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });
  } catch {
    return [];
  }
}
