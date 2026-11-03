# Fluent Academy — completion report

Status as of 31 October 2026. Every number below comes from the repository itself:
- `content/manifest.json` (from `npm run content:qa`);
- the importer's summary;
- the test runners' output.

Re-running the commands in the last section reproduces them.

## Summary

- **Platform:** the learner app, admin CMS, AI coach, speech practice, billing and content pipeline are built.
  - They type-check, lint cleanly, build for production, and pass 66 unit/integration tests and 12 end-to-end browser runs.
- **Curriculum:** all 20 courses (English, French, Spanish, German and Danish, levels A1–B2) are written.
  - They pass automatic content QA with 0 errors and 0 warnings and are imported into the database.
- **Audio:** every clip the curriculum needs has been generated (38,173 clips) and checked by speech recognition. 78 % pass, 22 % are flagged for a listen, and 169 clips (95 sentences) fail.
  - The failures hold 81 lessons back from "complete" in the manifest, so 10 of the 20 courses are fully complete (see Audio).
- **Linguistic review:** all content is AI-drafted and has **not** been reviewed by native speakers.
  - The app labels it "Not yet reviewed" until a reviewer records a verdict in `/admin/review`.

## Verification

| Check | Command | Result |
|---|---|---|
| Type check | `npm run typecheck` | passes |
| Lint | `npm run lint` | passes, no warnings |
| Unit + integration tests | `npm test` | 11 files, 66 tests passed |
| End-to-end (Playwright, desktop + phone) | `npm run test:e2e` | 12 passed |
| Production build | `npm run build` | succeeds |
| Content QA | `npm run content:qa` | 0 errors, 0 warnings |
| Content import | `npm run content:import` | 20 courses, 180 units, 660 lessons, 6,100 vocabulary items, 200 passages, 12 scenarios, 140 placement items, 38,173 audio assets, 0 errors, 0 conflicts |

What the tests cover:

**Integration tests (against a real Postgres database):**
- passwords are stored as Argon2id hashes and session tokens only as hashes;
- weak and common passwords are rejected;
- login errors are the same for unknown accounts;
- password resets are single-use;
- one learner cannot read or change another learner's records;
- answers are validated on the server and the client's verdict is never trusted;
- lesson scores use first attempts only, and XP is awarded once;
- billing:
  - unsigned or forged Stripe webhooks change nothing;
  - Premium is granted only from verified events, each processed once;
  - unknown plans are never granted from metadata;
  - the simulator is disabled whenever real billing is configured;
- coach practice mode and daily quotas.

**End-to-end tests:**
- sign-up and onboarding;
- answering a lesson exercise;
- the coach's labelled practice mode;
- admin access control;
- marketing pages;
- auth redirects;
- the health endpoint;
- phone layouts.

## Curriculum

Every course has:
- 8 units of 3 lessons plus a unit review (32 lesson pages);
- a level assessment;
- a library of 6 graded readings and 4 listenings.

Placement tests have 7 items per level for every language (140 in total). The 12 coach scenarios each have a section for all five languages.

| Course | Lessons | Exercises* | Vocabulary | Readings + listenings | Assessment items |
|---|---|---|---|---|---|
| English A1 · Foundations | 32 | 832 | 336 | 6 + 4 | 38 |
| English A2 · Everyday life | 32 | 840 | 310 | 6 + 4 | 38 |
| English B1 · Independence | 32 | 811 | 293 | 6 + 4 | 38 |
| English B2 · Fluency | 32 | 839 | 304 | 6 + 4 | 37 |
| French A1 · Foundations | 32 | 843 | 333 | 6 + 4 | 36 |
| French A2 · Everyday life | 32 | 812 | 313 | 6 + 4 | 38 |
| French B1 · Independence | 32 | 830 | 296 | 6 + 4 | 38 |
| French B2 · Fluency | 32 | 791 | 281 | 6 + 4 | 37 |
| Spanish A1 · Foundations | 32 | 834 | 336 | 6 + 4 | 38 |
| Spanish A2 · Everyday life | 32 | 828 | 304 | 6 + 4 | 38 |
| Spanish B1 · Independence | 32 | 818 | 295 | 6 + 4 | 38 |
| Spanish B2 · Fluency | 32 | 824 | 293 | 6 + 4 | 38 |
| German A1 · Foundations | 32 | 827 | 336 | 6 + 4 | 37 |
| German A2 · Everyday life | 32 | 792 | 289 | 6 + 4 | 38 |
| German B1 · Independence | 32 | 819 | 292 | 6 + 4 | 37 |
| German B2 · Fluency | 32 | 798 | 289 | 6 + 4 | 37 |
| Danish A1 · Foundations | 32 | 839 | 335 | 6 + 4 | 38 |
| Danish A2 · Everyday life | 32 | 840 | 315 | 6 + 4 | 38 |
| Danish B1 · Independence | 32 | 823 | 294 | 6 + 4 | 38 |
| Danish B2 · Fluency | 32 | 799 | 256 | 6 + 4 | 38 |
| **Total** | **640** | **16,439** | **6,100** | **120 + 80** | **753** |

\* Exercises per lesson include practice items generated from the lesson's vocabulary. Each lesson has 12–16 hand-authored exercises of at least four types. The manifest's total of 17,192 counts the assessment items too.

Content is original, written for this project, and follows the unit framework and grammar sequence in `content/CURRICULUM.md`. People, companies, series and books in dialogues and readings are fictional unless they are well-known public facts (places, institutions, dates).

## Audio

Generation:
- Clips are synthesised with Piper using openly licensed voices. `services/speech/download_voices.sh` fetches them, and each voice's licence is in its MODEL_CARD.
- Each sentence and dialogue has a normal-speed and a slow version.
- All 38,173 clips the curriculum references exist and none failed to generate.

Quality check:
- Every clip is re-transcribed with faster-whisper and compared with its script.
- Clips that are flagged are re-checked with a larger model.
- Verdicts are PASS (≥ 0.85 match), REVIEW or FAIL.
- Editors can hear any clip and record their own verdict in `/admin/audio`.

State on 31 October 2026, after every clip was checked and every failed clip was re-checked with the larger model:

| | Clips |
|---|---|
| Generated | 38,173 / 38,173 |
| PASS | 29,723 (78 %) |
| REVIEW | 8,281 (22 %) |
| FAIL | 169 (0.4 %) |
| Not yet checked | 0 |

The 169 failed clips are 95 distinct sentences, each in a normal and usually a slow version:

| Language | Distinct sentences | Voice |
|---|---|---|
| Danish | 74 | 58 with the derived second voice, 16 with the natural voice |
| German | 18 | all with the `de_DE-kerstin-low` voice (Piper's lower-quality German voice) |
| English | 1 | "miss out (on)" |
| French | 1 | "tu as lu" |

The larger model has re-checked 850 of the 4,975 normal-speed REVIEW clips, and the score improved for 546 of them. The rest of this optional step can be resumed with `npm run audio:qa:escalate -- --only REVIEW`; it takes about 6 hours on 4 cores. REVIEW clips count as usable; only FAIL clips hold a lesson back.

- **Why some courses still show as incomplete:**
  - In the manifest, 10 of the 20 courses are "complete": all English courses except B2, all French courses except A2, and all Spanish courses.
  - In the other 10, 81 lessons each contain at least one failed clip:
    - German: A1 10, A2 3, B1 1, B2 6.
    - Danish: A1 22, A2 18, B1 10, B2 8.
    - English B2: 2.
    - French A2: 1.
  - Their written content passes QA. They become complete when an editor listens to the flagged clips in `/admin/audio` and either approves them or replaces the voice.
- **What the failures are:**
  - The derived Danish voice and the low-quality German voice account for 76 of the 95 sentences. Nobody has listened to them yet. Some may be genuinely hard to understand; others are likely Whisper misrecognitions, because Danish recognition is unreliable and isolated phrases such as "in der Nähe" give it little context.
  - One real cause was found and fixed: Piper misread years and numbers written with thousands separators ("7.500 kroner", "1990"). The 55 affected clips were regenerated with the numbers spelled out.
- **What would reduce the failures:**
  - A second natural Danish voice, if an openly licensed one becomes available.
  - A medium-quality female German voice in place of `kerstin-low`. All German female-speaker clips would then need regenerating.
- **Danish voices:** only one open Danish voice exists (male). The second dialogue voice is derived from it by pitch and formant shifting, and lessons use the natural voice for single speakers.
- **What QA measures:** it confirms the words spoken, not naturalness.

## Integrations: live or fallback

`/api/health` and `/admin` show the live state. In this environment no third-party credentials are configured, so:

| Feature | State here | Needed for live operation |
|---|---|---|
| AI coach | **Practice mode** (scripted partner + rule-based checks), labelled in the chat | `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`) |
| Speech recognition | **Live**, via the self-hosted faster-whisper service | Deploy `services/speech` with `SPEECH_SERVICE_TOKEN` |
| Pronunciation assessment | **Off**: feedback compares recognised words and says it is not a pronunciation score | `AZURE_SPEECH_KEY` + `AZURE_SPEECH_REGION` |
| On-demand speech synthesis | **Live** (Piper through the speech service) | — |
| Payments | **Simulation** (development only; production refuses it unless explicitly allowed) | Stripe secret key, webhook secret, price IDs |
| Password-reset email | **Development mailbox** at `/dev/mailbox` | `SMTP_URL` |

No external API calls, payments, pronunciation scores or test results have been simulated or reported as live.

## Requirements and how they are met

**Passwords and secrets**
- Passwords are stored as Argon2id hashes and never logged. This is tested.
- AI and speech providers are called only from the server. No key reaches the browser, and logs redact secrets.
- No secrets or real credentials are committed. `.env.example` lists every variable with empty values or local development defaults.

**Billing**
- Premium comes only from signature-verified Stripe webhooks. The browser's "payment succeeded" redirect grants nothing. This is tested.

**Audio recordings and learner data**
- Recordings are deleted after `RECORDING_RETENTION_DAYS` (default 30) by `npm run jobs:cleanup`.
- Learners can turn audio storage off, shorten retention, delete recordings and conversations, export everything, and delete their account.
- Retention is documented in `README.md`.
- Every learner record is queried with the signed-in user's id. This is tested.

**Honest speaking feedback**
- With recognition only, feedback is labelled as intelligibility, not pronunciation.
- Phoneme or word scores appear only with Azure and are shown as that provider's estimates.

**Content honesty**
- AI-drafted content is never marked as verified: every lesson and passage starts as "AI-drafted" and only a reviewer's recorded verdict changes that.
- Content is original. Voices and fonts are openly licensed (see `/credits`).

**Missing credentials**
- Every feature that needs credentials has a labelled fallback, and the README documents what is needed to make it live.

## Known limitations and open items

1. **Native-speaker review.**
   - None of the 640 lessons or 200 passages has been reviewed.
   - The authoring reports list what reviewers should check first:
     - answer keys that accept several forms;
     - pronunciation explanations;
     - factual statements in culture notes and readings;
     - Danish word order and particle placement.
   - Review is recorded per lesson and passage in the CMS.
2. **Flagged audio** (see Audio). The 95 failed sentences need a listen in `/admin/audio`, and then either approval or a different voice. The Danish ones are the priority. REVIEW clips are usable; the optional larger-model re-check of them is 17 % done and resumable.
3. **Unit file size.** B1/B2 units are 42–50 KB, above the authoring target of 25–38 KB. Nothing is padded; the extra comes from longer dialogues and generous lists of accepted answers. Trimming is optional.
4. **Taxonomy.**
   - Authors proposed finer tags, for example:
     - inversion, participle clauses and cleft sentences;
     - German Nominalstil and Funktionsverbgefüge;
     - Danish modal particles and object shift.
   - Exercises currently use the nearest existing tag, so the learner model groups those mistakes more coarsely.
5. **Single synthetic Danish voice** (see Audio).
6. **Practice-mode coach.** Without an AI key, the coach recognises only a handful of common mistakes per language.

## Reproducing this report

```bash
npm run typecheck && npm run lint && npm test
npm run test:e2e                         # against a running app with imported content
npm run build
npm run content:qa                       # → content/manifest.json, reports/content-qa.json
npm run content:import
bash scripts/audio/pipeline.sh 3         # generate missing audio, QA, escalate (resumable)
```
