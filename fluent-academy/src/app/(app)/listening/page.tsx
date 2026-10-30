import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/primitives";
import { LevelFilter, LibraryGrid } from "@/components/reading/library";
import { requireLearner } from "@/server/learner";
import { libraryItems } from "@/server/library";

export const metadata: Metadata = { title: "Listening library" };

export default async function LibraryPage(props: PageProps<"/listening">) {
  const ctx = await requireLearner("/listening");
  const sp = await props.searchParams;
  const level = typeof sp.level === "string" ? sp.level : ctx.enrollment.levelCode;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : undefined;
  const items = await libraryItems(ctx.user.id, ctx.enrollment.languageCode, "LISTENING", level, q);
  return (
    <>
      <PageHeader eyebrow="Practise" title="Listening library" description="Dialogues and monologues recorded at a natural pace, with adjustable speed, transcripts and comprehension questions." />
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <LevelFilter base="/listening" current={level} levels={["A1", "A2", "B1", "B2"]} q={q} />
        <form action="/listening" className="flex gap-2">
          <input type="hidden" name="level" value={level} />
          <label htmlFor="lib-q" className="sr-only">Search</label>
          <input id="lib-q" name="q" defaultValue={q} placeholder="Search titles and topics" className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm focus:border-navy-400 focus:outline-none sm:w-64" />
        </form>
      </div>
      <LibraryGrid items={items} base="/listening" emptyText="No passages match this filter yet. Try another level." />
    </>
  );
}
