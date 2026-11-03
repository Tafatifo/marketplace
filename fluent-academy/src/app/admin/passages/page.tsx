import Link from "next/link";
import { LinguisticBadge, Table } from "@/components/admin/badges";
import { Badge, EmptyState, PageHeader } from "@/components/ui/primitives";
import { LANGUAGE_META } from "@/content/voices";
import { db } from "@/server/db";

export default async function PassagesAdmin(props: PageProps<"/admin/passages">) {
  const sp = await props.searchParams;
  const lang = typeof sp.lang === "string" ? sp.lang : undefined;
  const passages = await db.readingPassage.findMany({
    where: lang ? { languageCode: lang } : {},
    orderBy: [{ languageCode: "asc" }, { levelCode: "asc" }, { kind: "asc" }, { title: "asc" }],
    select: { slug: true, title: true, languageCode: true, levelCode: true, kind: true, wordCount: true, linguisticStatus: true, isFree: true, audioKey: true },
  });
  const languages = Object.entries(LANGUAGE_META);
  return (
    <>
      <PageHeader eyebrow="Library" title="Reading & listening passages" description="Original texts written for Fluent Academy, with comprehension questions, glossaries and narrated audio." />
      <div className="mb-5 flex flex-wrap gap-2">
        <Link href="/admin/passages" className={`rounded-full px-3 py-1.5 text-sm ${!lang ? "bg-navy-900 text-white" : "bg-white ring-1 ring-line"}`}>All</Link>
        {languages.map(([code, m]) => (
          <Link key={code} href={`/admin/passages?lang=${code}`} className={`rounded-full px-3 py-1.5 text-sm ${lang === code ? "bg-navy-900 text-white" : "bg-white ring-1 ring-line"}`}>{m.name}</Link>
        ))}
      </div>
      {passages.length === 0 ? (
        <EmptyState title="No passages imported" />
      ) : (
        <Table>
          <thead><tr><th>Title</th><th>Level</th><th>Kind</th><th>Words</th><th>Review</th></tr></thead>
          <tbody>
            {passages.map((p) => (
              <tr key={p.slug}>
                <td>
                  <Link href={`/admin/passages/${p.slug}`} className="font-medium text-navy-900 hover:underline">{p.title}</Link>
                  <p className="text-xs text-muted">{p.slug}{p.isFree && " · free"}{!p.audioKey && " · no audio"}</p>
                </td>
                <td className="text-sm">{LANGUAGE_META[p.languageCode]?.name} {p.levelCode}</td>
                <td><Badge tone="outline">{p.kind === "READING" ? "Reading" : "Listening"}</Badge></td>
                <td className="text-sm tabular-nums">{p.wordCount}</td>
                <td><LinguisticBadge status={p.linguisticStatus} /></td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
