import { z } from "zod";
import { apiStaff } from "@/server/auth/current";
import { validateSnapshot } from "@/server/content/snapshot";
import { json, parseJson, route } from "@/server/http";

const schema = z.object({ snapshot: z.unknown() });

/** Validates an edited lesson without saving it. */
export const POST = route(async (req) => {
  await apiStaff();
  const body = await parseJson(req, schema, 1024 * 1024);
  const v = validateSnapshot(body.snapshot);
  return json(v.ok ? { ok: true, issues: v.warnings } : { ok: false, issues: v.issues });
});
