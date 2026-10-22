import { after } from "next/server";
import { z } from "zod";
import { apiStaff } from "@/server/auth/current";
import { runImport } from "@/server/content/importer";
import { db } from "@/server/db";
import { conflict, json, parseJson, route } from "@/server/http";
import { logger } from "@/server/logger";

const log = logger("admin.import");
const schema = z.object({ publish: z.boolean().default(false) });

/**
 * Starts a content import from /content. Runs after the response is sent; progress
 * and the result appear in /admin/imports. Without `publish`, changed lessons wait
 * in the review queue instead of going live.
 */
export const POST = route(async (req) => {
  const user = await apiStaff("EDITOR");
  const body = await parseJson(req, schema);
  const running = await db.contentImport.findFirst({ where: { status: "RUNNING", startedAt: { gt: new Date(Date.now() - 30 * 60_000) } } });
  if (running) throw conflict("An import is already running.");
  await db.auditLog.create({ data: { actorId: user.id, action: "content.import", entityType: "ContentImport", metadata: { publish: body.publish } } });
  after(async () => {
    try {
      await runImport(db, { publish: body.publish, triggeredBy: user.email });
    } catch (err) {
      log.error("Content import failed", { error: err });
    }
  });
  return json({ started: true }, { status: 202 });
});
