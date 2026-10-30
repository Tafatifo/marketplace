import type { Metadata } from "next";
import { LegalPage } from "../legal-page";
import { VOICES, LANGUAGE_META } from "@/content/voices";

export const metadata: Metadata = { title: "Audio & content credits" };

export default function CreditsPage() {
  return (
    <LegalPage title="Audio & content credits" updated="22 October 2026">
      <h2>Course content</h2>
      <p>
        Lessons, dialogues, reading passages, exercises and illustrations are original works created for Fluent Academy.
        Parts were drafted with AI assistance; each item carries a linguistic review status in our editorial workflow and
        is not presented as professionally verified until a language specialist approves it. No textbook content was copied.
      </p>
      <h2>Synthesised audio</h2>
      <p>
        Model audio is generated with the open-source <a href="https://github.com/OHF-Voice/piper1-gpl">Piper</a> text-to-speech
        engine using the following voices. We thank the creators of the underlying speech datasets.
      </p>
      <table>
        <thead>
          <tr>
            <th>Language</th>
            <th>Voice</th>
            <th>Dataset licence</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(VOICES).flatMap(([lang, set]) =>
            Object.values(set).map((v) => (
              <tr key={v.id}>
                <td>{LANGUAGE_META[lang]?.name}</td>
                <td>{v.label} <code>{v.id}</code></td>
                <td>{v.license}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>
      <p>
        Automatic phonetic transcriptions (IPA) are produced by eSpeak NG through Piper&apos;s phonemiser and are marked as
        automatic until reviewed.
      </p>
      <h2>Software, fonts and icons</h2>
      <ul>
        <li>Inter and Source Serif 4 typefaces — SIL Open Font License 1.1.</li>
        <li>Lucide icons — ISC License.</li>
        <li>Speech recognition in self-hosted mode: faster-whisper (MIT) with OpenAI Whisper models (MIT).</li>
      </ul>
    </LegalPage>
  );
}
