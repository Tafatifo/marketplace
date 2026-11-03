import { apiUser } from "@/server/auth/current";
import { json, route } from "@/server/http";
import { deleteAttemptAudio } from "@/server/speech/service";

export const POST = route(async () => {
  const user = await apiUser();
  const n = await deleteAttemptAudio(user.id);
  return json({ deleted: n });
});
