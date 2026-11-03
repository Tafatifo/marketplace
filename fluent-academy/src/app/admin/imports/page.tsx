import { ImportButtons } from "@/components/admin/forms";
import { Table } from "@/components/admin/badges";
import { Badge, Card, CardBody, CardHeader, PageHeader } from "@/components/ui/primitives";
import { formatDate } from "@/lib/format";
import { requireStaff } from "@/server/auth/current";
import { db } from "@/server/db";
import type { ImportSummary } from "@/server/content/importer";

export default async function ImportsPage() {
  const user = await requireStaff();
  const imports = await db.contentImport.findMany({ orderBy: { startedAt: "desc" }, take: 30 });
  return (
    <>
      <PageHeader eyebrow="Content pipeline" title="Imports" description="The curriculum is authored as files in /content, checked by `npm run content:qa`, and imported here or with `npm run content:import`." />
      <Card className="mb-6">
        <CardHeader title="Run an import" description="“For review” creates revisions in the review queue for changed lessons. “Publish” applies changes immediately — except for lessons edited in the CMS, which always go to review." />
        <CardBody>{user.role === "ADMIN" || user.role === "EDITOR" ? <ImportButtons /> : <p className="text-sm text-muted">Editors and admins can run imports.</p>}</CardBody>
      </Card>
      <Table>
        <thead><tr><th>Started</th><th>Status</th><th>Mode</th><th>Result</th><th>By</th></tr></thead>
        <tbody>
          {imports.map((i) => {
            const s = i.summary as unknown as Partial<ImportSummary>;
            return (
              <tr key={i.id} className="align-top">
                <td className="text-sm">{formatDate(i.startedAt, { dateStyle: "medium", timeStyle: "short" })}</td>
                <td><Badge tone={i.status === "SUCCEEDED" ? "success" : i.status === "FAILED" ? "danger" : "warning"}>{i.status.toLowerCase()}</Badge></td>
                <td className="text-sm">{i.publish ? "publish" : "for review"}</td>
                <td className="max-w-md text-sm text-muted">
                  {s.courses !== undefined && `${s.courses} courses · ${s.lessonsCreated ?? 0} new · ${s.lessonsUpdated ?? 0} updated · ${s.revisionsPending ?? 0} for review · ${s.lessonsUnchanged ?? 0} unchanged · ${s.audioAssets ?? 0} audio`}
                  {s.conflicts && s.conflicts.length > 0 && <p className="text-warning-700">CMS-edited lessons with source changes: {s.conflicts.join(", ")}</p>}
                  {s.errors && s.errors.length > 0 && <p className="text-danger-700">{s.errors.slice(0, 5).join("; ")}</p>}
                </td>
                <td className="text-xs text-muted">{i.triggeredBy}</td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </>
  );
}
