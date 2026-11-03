import Link from "next/link";
import { Table } from "@/components/admin/badges";
import { Badge, EmptyState, PageHeader } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { db } from "@/server/db";

export default async function EventsAdmin(props: PageProps<"/admin/events">) {
  const sp = await props.searchParams;
  const level = sp.level === "warn" ? "warn" : sp.level === "all" ? undefined : "error";
  const events = await db.systemEvent.findMany({ where: level ? { level } : {}, orderBy: { createdAt: "desc" }, take: 200 });
  return (
    <>
      <PageHeader eyebrow="Monitoring" title="System events" description="Warnings and errors logged by the server (secrets and credentials are redacted). Each entry carries the request id returned to the client." />
      <div className="mb-5 flex gap-2">
        {[["error", "Errors"], ["warn", "Warnings"], ["all", "All"]].map(([v, label]) => (
          <Link key={v} href={`/admin/events?level=${v}`} className={cn("rounded-full px-3.5 py-1.5 text-sm font-medium", (level ?? "all") === v ? "bg-navy-900 text-white" : "bg-white ring-1 ring-line")}>{label}</Link>
        ))}
      </div>
      {events.length === 0 ? (
        <EmptyState title="Nothing logged" description="No events at this level." />
      ) : (
        <Table>
          <thead><tr><th>Time</th><th>Level</th><th>Source</th><th>Message</th></tr></thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className="align-top">
                <td className="text-xs whitespace-nowrap text-muted">{formatDate(e.createdAt, { dateStyle: "short", timeStyle: "medium" })}</td>
                <td><Badge tone={e.level === "error" ? "danger" : "warning"}>{e.level}</Badge></td>
                <td className="text-sm">{e.source}</td>
                <td className="max-w-xl text-sm">
                  {e.message}
                  {e.requestId && <p className="text-xs text-subtle">request {e.requestId}</p>}
                  {Object.keys(e.context as object).length > 0 && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-muted">Context</summary>
                      <pre className="mt-1 max-h-60 overflow-auto rounded bg-canvas p-2 text-[0.7rem]">{JSON.stringify(e.context, null, 2)}</pre>
                    </details>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
