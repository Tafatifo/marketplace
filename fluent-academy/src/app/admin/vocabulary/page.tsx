import { VocabularyEditor } from "@/components/admin/forms";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { formatNumber } from "@/lib/format";
import { LANGUAGE_META } from "@/content/voices";
import { requireStaff } from "@/server/auth/current";
import { db } from "@/server/db";

export default async function VocabularyAdmin(props: PageProps<"/admin/vocabulary">) {
  const user = await requireStaff();
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const lang = typeof sp.lang === "string" && LANGUAGE_META[sp.lang] ? sp.lang : "";
  const where = {
    ...(lang ? { languageCode: lang } : {}),
    ...(q ? { OR: [{ term: { contains: q, mode: "insensitive" as const } }, { translation: { contains: q, mode: "insensitive" as const } }] } : {}),
  };
  const [items, total] = await Promise.all([
    db.vocabularyItem.findMany({ where, orderBy: [{ languageCode: "asc" }, { key: "asc" }], take: 100 }),
    db.vocabularyItem.count({ where }),
  ]);
  const canEdit = user.role !== "LEARNER";
  return (
    <>
      <PageHeader eyebrow="Curriculum" title="Vocabulary" description="Every word and phrase taught in the course. Corrections here are kept when content is re-imported." />
      <form className="mb-5 flex flex-col gap-2 sm:flex-row" role="search">
        <input name="q" defaultValue={q} placeholder="Search term or translation" aria-label="Search vocabulary" className="h-10 flex-1 rounded-lg border border-line bg-white px-3 text-sm" />
        <select name="lang" defaultValue={lang} aria-label="Language" className="h-10 rounded-lg border border-line bg-white px-3 text-sm">
          <option value="">All languages</option>
          {Object.entries(LANGUAGE_META).map(([code, m]) => <option key={code} value={code}>{m.name}</option>)}
        </select>
        <button className="h-10 rounded-lg bg-navy-900 px-4 text-sm font-medium text-white">Search</button>
      </form>
      <p className="mb-3 text-sm text-muted">{formatNumber(total)} items{total > items.length && ` · showing the first ${items.length}`}</p>
      {items.length === 0 ? (
        <EmptyState title="No matching vocabulary" />
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {items.map((v) => (
              <li key={v.id} className="px-5 py-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-medium text-navy-900" lang={v.languageCode}>{v.term}</span>
                  {v.ipa && <span className="font-mono text-xs text-muted">/{v.ipa}/{v.ipaSource === "espeak-ng" && " (auto)"}</span>}
                  <span className="text-sm text-ink">{v.translation}</span>
                  <span className="text-xs text-subtle">{v.key}</span>
                  {v.editedAt && <Badge tone="gold">Corrected in CMS</Badge>}
                  <span className="ml-auto">{canEdit && <VocabularyEditor item={v} />}</span>
                </div>
                <p className="mt-0.5 text-sm text-muted"><span lang={v.languageCode}>{v.example}</span>{v.exampleTranslation && ` — ${v.exampleTranslation}`}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
