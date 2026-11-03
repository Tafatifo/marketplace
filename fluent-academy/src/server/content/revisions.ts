import "server-only";
import type { ContentStatus, LinguisticStatus, Prisma, Role } from "@prisma/client";
import { db } from "../db";
import { badRequest, forbidden, notFound } from "../http";
import { applyLessonSnapshot, lessonSnapshot, type LessonSnapshot } from "./importer";
import { validateSnapshot } from "./snapshot";
import type { LessonDef } from "@/content/types";

/**
 * Editorial workflow: DRAFT → IN_REVIEW → APPROVED → PUBLISHED (or REJECTED back to DRAFT).
 * Editors draft and submit; reviewers approve or request changes; publishing applies the
 * snapshot to the live lesson. Every transition is recorded in the audit log.
 */
const TRANSITIONS: Record<string, { from: ContentStatus[]; to: ContentStatus; roles: Role[] }> = {
  submit: { from: ["DRAFT"], to: "IN_REVIEW", roles: ["EDITOR", "ADMIN"] },
  approve: { from: ["IN_REVIEW"], to: "APPROVED", roles: ["REVIEWER", "ADMIN"] },
  reject: { from: ["IN_REVIEW", "APPROVED"], to: "DRAFT", roles: ["REVIEWER", "ADMIN"] },
  publish: { from: ["APPROVED"], to: "PUBLISHED", roles: ["EDITOR", "ADMIN"] },
};

export async function currentSnapshot(slug: string): Promise<{ lessonId: string; version: number; snapshot: LessonSnapshot } | null> {
  const lesson = await db.lesson.findUnique({ where: { slug }, include: { exercises: { where: { isActive: true }, orderBy: { order: "asc" } } } });
  if (!lesson) return null;
  const def = {
    title: lesson.title,
    summary: lesson.summary,
    minutes: lesson.estimatedMinutes,
    skills: lesson.skills,
    objectives: lesson.objectives as string[],
    grammarTags: lesson.grammarTags,
    kind: lesson.kind,
    content: lesson.content,
    exercises: lesson.exercises.map((e) => ({
      key: e.key, order: e.order, type: e.type, skill: e.skill, prompt: e.prompt, answer: e.answer, explanation: e.explanation,
      tags: e.tags, objective: e.objective ?? undefined, points: e.points, derived: e.derived,
    })),
  } as unknown as LessonDef;
  return { lessonId: lesson.id, version: lesson.version, snapshot: lessonSnapshot(def) };
}

export async function saveDraftRevision(actor: { id: string }, slug: string, input: unknown, note?: string) {
  const lesson = await db.lesson.findUnique({ where: { slug }, select: { id: true } });
  if (!lesson) throw notFound("Lesson not found.");
  const v = validateSnapshot(input);
  if (!v.ok) return { ok: false as const, issues: v.issues };
  const last = await db.lessonRevision.findFirst({ where: { lessonId: lesson.id }, orderBy: { version: "desc" } });
  const revision = await db.lessonRevision.create({
    data: { lessonId: lesson.id, version: (last?.version ?? 0) + 1, source: "EDITOR", snapshot: v.snapshot as unknown as Prisma.InputJsonValue, status: "DRAFT", authorId: actor.id, note: note?.slice(0, 500) },
  });
  await db.auditLog.create({ data: { actorId: actor.id, action: "revision.create", entityType: "Lesson", entityId: lesson.id, metadata: { revision: revision.id, version: revision.version } } });
  return { ok: true as const, revision, warnings: v.warnings };
}

export async function transitionRevision(actor: { id: string; role: Role }, revisionId: string, action: keyof typeof TRANSITIONS, comment?: string) {
  const t = TRANSITIONS[action];
  if (!t) throw badRequest("Unknown action.");
  if (!t.roles.includes(actor.role) && actor.role !== "ADMIN") throw forbidden("Your role can't perform this action.");
  const rev = await db.lessonRevision.findUnique({ where: { id: revisionId }, include: { lesson: { select: { id: true, slug: true } } } });
  if (!rev) throw notFound("Revision not found.");
  const past = { submit: "submitted", approve: "approved", reject: "sent back", publish: "published" }[action];
  if (!t.from.includes(rev.status)) throw badRequest(`A revision that is ${rev.status.toLowerCase().replace("_", " ")} can't be ${past}.`);
  if (action === "approve" && rev.authorId === actor.id && actor.role !== "ADMIN") throw forbidden("A different person must approve your own revision.");
  await db.$transaction(async (tx) => {
    await tx.lessonRevision.update({
      where: { id: rev.id },
      data: { status: t.to, ...(action === "approve" || action === "reject" ? { reviewerId: actor.id } : {}), ...(action === "publish" ? { publishedAt: new Date() } : {}), ...(comment ? { reviewComment: comment.slice(0, 500) } : {}) },
    });
    if (action === "publish") {
      const v = validateSnapshot(rev.snapshot);
      if (!v.ok) throw badRequest("This revision no longer passes validation.");
      // Import revisions keep their source hash so the next import sees the lesson as in sync;
      // editor revisions clear it, which protects the edit from being overwritten by the files.
      await applyLessonSnapshot(tx, rev.lesson.id, rev.lesson.slug, v.snapshot, rev.source === "IMPORT" ? rev.sourceHash : null);
    }
    await tx.auditLog.create({ data: { actorId: actor.id, action: `revision.${action}`, entityType: "Lesson", entityId: rev.lesson.id, metadata: { revision: rev.id, comment: comment ?? null } } });
  }, { timeout: 60_000 });
  return db.lessonRevision.findUnique({ where: { id: rev.id } });
}

export async function setLinguisticStatus(actor: { id: string; role: Role }, entity: { type: "LESSON" | "PASSAGE"; id: string }, status: LinguisticStatus, comment: string) {
  if (actor.role !== "REVIEWER" && actor.role !== "ADMIN") throw forbidden("Only reviewers can record linguistic reviews.");
  if (entity.type === "LESSON") await db.lesson.update({ where: { id: entity.id }, data: { linguisticStatus: status } });
  else await db.readingPassage.update({ where: { id: entity.id }, data: { linguisticStatus: status } });
  await db.contentReview.create({ data: { entityType: entity.type, entityId: entity.id, status, comment: comment.slice(0, 2000), reviewerId: actor.id } });
  await db.auditLog.create({ data: { actorId: actor.id, action: "content.linguistic-review", entityType: entity.type, entityId: entity.id, metadata: { status } } });
}
