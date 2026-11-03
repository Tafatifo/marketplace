import type { ReactNode } from "react";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <section className="container-page py-16">
      <div className="mx-auto max-w-3xl">
        <p className="eyebrow">Legal</p>
        <h1 className="display mt-3 text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-subtle">Last updated {updated}</p>
        <div className="prose prose-slate mt-10 max-w-none prose-headings:font-serif prose-headings:text-navy-900 prose-a:text-navy-700 prose-strong:text-navy-900">
          {children}
        </div>
      </div>
    </section>
  );
}
