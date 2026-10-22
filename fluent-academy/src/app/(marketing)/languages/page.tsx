import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CtaBand, LanguageCards } from "@/components/marketing/sections";
import { getCatalog } from "@/server/catalog";
import { LANGUAGE_META } from "@/content/voices";

export const metadata: Metadata = {
  title: "Languages & syllabus",
  description: "English, French, Spanish and German from CEFR A1 to B2 — units, objectives and lesson counts.",
};
export const revalidate = 300;

export default async function LanguagesPage() {
  const catalog = await getCatalog();
  const byLang = Object.keys(LANGUAGE_META).map((code) => ({
    code,
    meta: LANGUAGE_META[code]!,
    courses: catalog.filter((c) => c.languageCode === code),
  }));
  return (
    <>
      <section className="container-page py-16 lg:py-20">
        <p className="eyebrow">Languages</p>
        <h1 className="display mt-3 max-w-3xl text-4xl sm:text-5xl">Four languages, from first words to confident discussion.</h1>
        <p className="mt-5 max-w-2xl text-lg text-muted">
          Each language follows the same CEFR-aligned progression, with grammar and culture adapted to the language itself.
        </p>
        <div className="mt-12">
          <LanguageCards />
        </div>
      </section>
      <section className="border-t border-line bg-canvas py-16">
        <div className="container-page">
          <h2 className="display text-2xl sm:text-3xl">Published course content</h2>
          <p className="mt-2 text-sm text-muted">Live counts from the curriculum currently published on the platform.</p>
          <div className="mt-8 overflow-x-auto rounded-[var(--radius-card)] border border-line bg-white">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="border-b border-line bg-navy-50/60 text-xs tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-5 py-3 font-medium">Language</th>
                  {["A1", "A2", "B1", "B2"].map((l) => (
                    <th key={l} className="px-5 py-3 font-medium">{l}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {byLang.map((l) => (
                  <tr key={l.code}>
                    <td className="px-5 py-4">
                      <Link href={`/languages/${l.code}`} className="font-medium text-navy-900 hover:underline">
                        {l.meta.name}
                      </Link>
                    </td>
                    {["A1", "A2", "B1", "B2"].map((lvl) => {
                      const c = l.courses.find((x) => x.levelCode === lvl);
                      return (
                        <td key={lvl} className="px-5 py-4 text-muted tabular-nums">
                          {c ? `${c.units.filter((u) => u.order < 99).length} units · ${c.lessonCount} lessons` : "In preparation"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Link href="/signup" className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-navy-700 hover:text-navy-900">
            Create a free account to start <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
      <CtaBand />
    </>
  );
}
