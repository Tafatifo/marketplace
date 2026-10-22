import { notFound } from "next/navigation";
import { readDevMailbox } from "@/server/email";
import { emailDeliveryMode } from "@/server/env";

export const dynamic = "force-dynamic";

/** Development-only inbox for emails that would have been sent without SMTP. */
export default async function DevMailboxPage() {
  if (emailDeliveryMode() !== "dev-log") notFound();
  const mails = await readDevMailbox();
  const linkify = (t: string) => t.split(/(https?:\/\/\S+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? <a key={i} href={part} className="break-all text-navy-700 underline">{part}</a> : part,
  );
  return (
    <main id="main" className="container-page max-w-3xl py-12">
      <p className="eyebrow">Development only</p>
      <h1 className="display mt-2 text-3xl">Development mailbox</h1>
      <p className="mt-2 text-sm text-muted">SMTP_URL is not set, so outgoing emails are stored locally instead of being sent. This page is disabled in production.</p>
      <div className="mt-8 space-y-4">
        {mails.length === 0 && <p className="text-sm text-muted">No emails yet.</p>}
        {mails.map((m, i) => (
          <article key={i} className="card p-5" data-testid="dev-mail">
            <p className="text-xs text-subtle">{m.sentAt} · to {m.to}</p>
            <h2 className="mt-1 font-semibold text-navy-900">{m.subject}</h2>
            <pre className="mt-3 font-sans text-sm whitespace-pre-wrap text-ink">{linkify(m.text)}</pre>
          </article>
        ))}
      </div>
    </main>
  );
}
