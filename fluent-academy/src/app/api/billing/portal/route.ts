import { apiUser } from "@/server/auth/current";
import { json, route } from "@/server/http";
import { createPortal } from "@/server/billing/service";

export const POST = route(async () => {
  const user = await apiUser();
  return json({ url: await createPortal(user.id) });
});
