import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { CtaBand } from "@/components/marketing/sections";
import { Badge } from "@/components/ui/primitives";
import { getCatalog } from "@/server/catalog";
import { LANGUAGE_META } from "@/content/voices";

export const revalidate = 300;

export async function generateMetadata(props: PageProps<"/languages/[code]">): Promise<Metadata> {
  const { code } = await props.params;
  const meta = LANGUAGE_META[code];
  return meta ? { title: `${meta.name} syllabus`, description: `${meta.name} from A1 to B2: units, objectives and can-do statements.` } : {};
}

const SCALE_LABEL: Record<string, string> = {
  listening: "Listening",
  reading: "Reading",
  spokenInteraction: "Spoken interaction",
  spokenProduction: "Spoken production",
  writing: "Writing",
};

export default async function LanguageSyllabusPage(props: PageProps<"/languages/[code]">) {
  const { code } = await props.params;
  const meta = LANGUAGE_META[code];
  if (!meta) notFound();
  const courses = await getCatalog(code);

  return (
    <>
      <section className="border-b border-line bg-[linear-gradient(180deg,var(--color-navy-50),#fff)]">
        <div className="container-page py-16">
          <p className="eyebrow">{meta.name} · {meta.nativeName}</p>
          <h1 className="display mt-3 text-4xl sm:text-5xl">{meta.name} syllabus, A1 to B2</h1>
          <p className="mt-4 max-w-2xl text-lg text-muted">
            Objectives, grammar scope and the units of each level. Courses marked “in preparation” are planned but not yet published.
          </p>
        </div>
      </section>
      <section className="container-page space-y-10 py-14">
        {["A1", "A2", "B1", "B2"].map((lvl) => {
          const c = courses.find((x) => x.levelCode === lvl);
          if (!c) {
            return (
              <div key={lvl} className="card p-7">
                <div className="flex items-center gap-3">
                  <h2 className="font-serif text-2xl text-navy-900">{lvl}</h2>
                  <Badge tone="neutral">In preparation</Badge>
                </div>
              </div>
            );
          }
          const s = c.syllabus;
          return (
            <article key={lvl} className="card overflow-hidden">
              <header className="flex flex-col gap-2 border-b border-line bg-navy-50/40 px-7 py-6 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="font-serif text-2xl text-navy-900">{c.title}</h2>
                  <p className="mt-1 max-w-3xl text-sm text-muted">{c.description}</p>
                </div>
                <p className="shrink-0 text-sm text-muted tabular-nums">
                  {c.units.filter((u) => u.order < 99).length} units · {c.lessonCount} lessons · ~{s.hours} h
                </p>
              </header>
              <div className="grid gap-8 px-7 py-7 lg:grid-cols-[1fr_1fr]">
                <div>
                  <h3 className="text-sm font-semibold tracking-wide text-navy-900 uppercase">By the end you can…</h3>
                  <ul className="mt-3 space-y-2 text-sm text-ink">
                    {s.objectives.map((o) => (
                      <li key={o} className="flex gap-2">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-gold-600" aria-hidden />
                        {o}
                      </li>
                    ))}
                  </ul>
                  <h3 className="mt-7 text-sm font-semibold tracking-wide text-navy-900 uppercase">Grammar scope</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{s.grammar.join(" · ")}</p>
                </div>
                <div>
                  <h3 className="text-sm font-semibold tracking-wide text-navy-900 uppercase">Units</h3>
                  <ol className="mt-3 divide-y divide-line rounded-xl border border-line">
                    {s.plannedUnits.map((u) => {
                      const live = c.units.find((x) => x.order === u.order);
                      return (
                        <li key={u.order} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                          <div>
                            <p className="font-medium text-navy-900">
                              {u.order}. {u.title}
                            </p>
                            <p className="text-xs text-muted">{u.lessons.join(" · ")}</p>
                          </div>
                          {!live && <Badge tone="neutral">Planned</Badge>}
                        </li>
                      );
                    })}
                  </ol>
                </div>
              </div>
              <div className="border-t border-line px-7 py-6">
                <h3 className="text-sm font-semibold tracking-wide text-navy-900 uppercase">CEFR-aligned can-do statements</h3>
                <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(s.canDo).map(([scale, items]) => (
                    <div key={scale}>
                      <dt className="font-medium text-navy-800">{SCALE_LABEL[scale] ?? scale}</dt>
                      <dd className="mt-1 space-y-1 text-muted">
                        {items.map((i) => (
                          <p key={i}>{i}</p>
                        ))}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </article>
          );
        })}
      </section>
      <CtaBand />
    </>
  );
}
