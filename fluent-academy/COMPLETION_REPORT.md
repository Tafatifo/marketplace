# Fluent Academy — completion report

Status as of 30 October 2026. Every number below comes from the repository itself:
- `content/manifest.json` (from `npm run content:qa`);
- the importer's summary;
- the test runners' output.

Re-running the commands in the last section reproduces them.

## Summary

- **Platform:** the learner app, admin CMS, AI coach, speech practice, billing and content pipeline are built.
  - They type-check, lint cleanly, build for production, and pass 66 unit/integration tests and 12 end-to-end browser runs.
- **Curriculum:** all 20 courses (English, French, Spanish, German and Danish, levels A1–B2) are written.
  - They pass automatic content QA with 0 errors and 0 warnings and are imported into the database.
- **Audio:** every clip the curriculum needs has been generated (38,173 clips).
  - Speech-recognition QA of those clips is still running. Until it finishes, some lessons count as "incomplete" in the manifest because of clips that failed or have not been checked yet (see Audio).
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

State when this report was written:

| | Clips |
|---|---|
| Generated | 38,173 / 38,173 |
| PASS | 9,800 |
| REVIEW | 3,153 |
| FAIL | 139 (113 Danish, 24 German, 2 French) |
| Not yet checked | 25,081 |

The QA run continues in the background (`scripts/audio/pipeline.sh`) and is resumable. On this 4-core machine it needs several more hours.

- **Why some courses still show as incomplete:** 16 of the 20 courses are "complete" in the manifest. The other four (French A2, German A1, Danish A1, Danish A2) are held back only by failed clips; their content passes QA.
- **What the failures are:**
  - Most failures are Danish. There Whisper's recognition is itself unreliable, so many are recognition errors rather than bad audio. The larger-model re-check resolves part of them.
  - One real cause was found and fixed: Piper misread years and numbers written with thousands separators ("7.500 kroner", "1990"). Those 55 clips are regenerated with the numbers spelled out.
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
2. **Audio QA in progress** (see Audio). After it finishes, remaining FAIL and REVIEW clips need a listen in `/admin/audio`. The Danish ones are the priority.
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
