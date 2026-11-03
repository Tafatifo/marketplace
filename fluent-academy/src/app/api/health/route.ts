import { systemStatus } from "@/server/admin/status";
import { json } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * Liveness/readiness for load balancers and uptime checks. Returns 503 only when a
 * required dependency is down; fallbacks (practice AI, browser speech) are reported
 * but do not fail the check. No secrets or configuration values are included.
 */
export async function GET() {
  const status = await systemStatus();
  return json(
    { ok: status.ok, time: new Date().toISOString(), checks: status.checks.map((c) => ({ name: c.name, state: c.state })) },
    { status: status.ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
