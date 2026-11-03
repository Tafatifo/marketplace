import { z } from "zod";
import { apiStaff } from "@/server/auth/current";
import { setLinguisticStatus } from "@/server/content/revisions";
import { json, parseJson, route } from "@/server/http";

const schema = z.object({
  entityType: z.enum(["LESSON", "PASSAGE"]),
  entityId: z.string().min(1).max(40),
  status: z.enum(["AI_DRAFTED", "NEEDS_CHANGES", "NATIVE_REVIEWED", "APPROVED"]),
  comment: z.string().trim().min(3, "Say what you checked or what needs to change.").max(2000),
});

/** Records a linguistic review (native-speaker check) for a lesson or passage. */
export const POST = route(async (req) => {
  const user = await apiStaff("REVIEWER");
  const body = await parseJson(req, schema);
  await setLinguisticStatus(user, { type: body.entityType, id: body.entityId }, body.status, body.comment);
  return json({ ok: true }, { status: 201 });
});
