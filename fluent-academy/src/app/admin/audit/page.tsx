import { Table } from "@/components/admin/badges";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { formatDate } from "@/lib/format";
import { db } from "@/server/db";

export default async function AuditAdmin() {
  const entries = await db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 200, include: { actor: { select: { name: true, email: true } } } });
  return (
    <>
      <PageHeader eyebrow="Monitoring" title="Audit log" description="Every editorial, review, role, plan and account action." />
      {entries.length === 0 ? (
        <EmptyState title="No actions recorded yet" />
      ) : (
        <Table>
          <thead><tr><th>Time</th><th>Who</th><th>Action</th><th>Target</th><th>Details</th></tr></thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="align-top">
                <td className="text-xs whitespace-nowrap text-muted">{formatDate(e.createdAt, { dateStyle: "short", timeStyle: "short" })}</td>
                <td className="text-sm">{e.actor?.name ?? "system"}</td>
                <td><code className="text-xs">{e.action}</code></td>
                <td className="text-xs text-muted">{e.entityType}{e.entityId && ` · ${e.entityId.slice(0, 10)}…`}</td>
                <td className="max-w-sm text-xs text-muted"><code className="break-all">{JSON.stringify(e.metadata)}</code></td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
