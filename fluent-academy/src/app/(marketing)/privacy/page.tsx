import type { Metadata } from "next";
import { LegalPage } from "../legal-page";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="22 October 2026">
      <p>
        This policy explains what Fluent Academy collects, why, how long we keep it, and the controls you have. Operators
        deploying Fluent Academy should review it with their own legal counsel and adapt contact details and processors.
      </p>
      <h2>What we collect</h2>
      <ul>
        <li><strong>Account data:</strong> your name, email address and a salted Argon2id hash of your password (we never store the password itself).</li>
        <li><strong>Learning preferences:</strong> native and target languages, level, goals, focus areas and correction preferences you choose in onboarding and settings.</li>
        <li><strong>Learning records:</strong> exercise responses and results, lesson progress, assessment scores, vocabulary notebook entries and review history, XP and streaks.</li>
        <li><strong>Learner observations:</strong> structured notes about recurring difficulties (for example “French auxiliary verbs, 4 errors in 2 weeks”), derived from your answers.</li>
        <li><strong>Conversations:</strong> messages you exchange with the AI coach, the coach&apos;s replies, corrections and session reviews.</li>
        <li><strong>Voice recordings:</strong> audio you record in speaking practice, its transcript and the feedback generated from it.</li>
        <li><strong>Technical data:</strong> a session cookie that keeps you signed in, and a keyed hash of your IP address used for rate limiting and security.</li>
      </ul>
      <h2>How recordings are handled</h2>
      <p>
        Recordings are stored privately and are only accessible to your signed-in account. By default they are deleted
        automatically 30 days after recording. In Settings you can shorten the retention period, choose not to keep
        recordings at all (only the transcript and feedback are kept), or delete every recording immediately.
      </p>
      <h2>Third-party processing</h2>
      <p>
        If the operator has connected an AI language-model provider, your coach messages, your level and a summary of your
        learner record are sent to that provider to generate replies and reviews. If a speech-recognition or
        pronunciation-assessment provider is connected, your recordings are sent to it for transcription or assessment.
        Payments are processed by Stripe; we never see or store your card details. API keys for these services are held
        only on our servers.
      </p>
      <h2>Your rights and controls</h2>
      <ul>
        <li>Download a copy of your data in JSON format from Settings → Data &amp; privacy.</li>
        <li>Delete your recordings, your conversation history, or your whole account at any time. Account deletion removes all your learning records permanently.</li>
        <li>Correct your profile and preferences in Settings, and dismiss any focus area you think is wrong.</li>
      </ul>
      <h2>Cookies</h2>
      <p>We use a single, strictly necessary session cookie. We do not use advertising or cross-site tracking cookies.</p>
      <h2>Security</h2>
      <p>
        Passwords are hashed with Argon2id; session tokens and password-reset tokens are stored only as SHA-256 digests;
        access to every private record is checked against your account on the server.
      </p>
    </LegalPage>
  );
}
