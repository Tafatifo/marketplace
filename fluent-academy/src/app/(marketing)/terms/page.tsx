import type { Metadata } from "next";
import { LegalPage } from "../legal-page";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of service" updated="22 October 2026">
      <p>
        These terms govern your use of Fluent Academy. By creating an account you agree to them. Operators deploying
        Fluent Academy should adapt these terms to their jurisdiction and business.
      </p>
      <h2>Your account</h2>
      <p>You must provide accurate information, keep your password secure, and be at least 16 years old (or have a parent&apos;s or guardian&apos;s consent).</p>
      <h2>Learning content and AI features</h2>
      <p>
        Course levels are aligned with CEFR descriptors for guidance only; completing a level is not an official
        certification. AI coach replies, corrections and reviews are generated automatically and may contain errors.
        Speaking feedback based on speech recognition estimates intelligibility and is not a precise pronunciation
        measurement unless a dedicated assessment service is shown as active.
      </p>
      <h2>Subscriptions</h2>
      <p>
        Premium is billed in advance monthly or yearly through our payment provider and renews automatically until
        cancelled. You can cancel at any time; access continues until the end of the paid period. Prices may change with
        at least 30 days&apos; notice before your next renewal.
      </p>
      <h2>Acceptable use</h2>
      <p>
        Don&apos;t misuse the service: no attempts to access other users&apos; data, overload or reverse-engineer the platform,
        or use the AI coach to generate harmful content. We apply fair-use limits to AI and audio features.
      </p>
      <h2>Content ownership</h2>
      <p>
        Course materials, audio and illustrations are owned by Fluent Academy or used under the licences listed on the
        credits page. You keep ownership of what you write and record; you grant us a licence to process it to provide the service.
      </p>
      <h2>Liability</h2>
      <p>The service is provided “as is”. To the extent permitted by law, we are not liable for indirect or consequential losses.</p>
    </LegalPage>
  );
}
