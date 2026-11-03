# Fluent Academy — Speak With Confidence

A structured, AI-assisted language academy for **English, French, Spanish, German and Danish**, CEFR **A1–B2**.
Learners follow a sequenced curriculum (units → lessons → exercises with server-checked answers), practise
conversation with an AI coach, record themselves for speaking feedback, read and listen to graded texts, and review
vocabulary and mistakes with spaced repetition. A learner model tracks repeated mistakes and turns them into
evidence-based recommendations. Editors and reviewers manage content in a built-in CMS.

- **Stack:** Next.js 16 (App Router, Turbopack) · React 19 · Tailwind CSS 4 · PostgreSQL 16 + Prisma 6 · Zod 4
- **Speech:** self-hosted Python service (faster-whisper for recognition, Piper for synthesis) or OpenAI / Azure
- **AI coach:** Anthropic Claude (default) or any OpenAI-compatible API, server-side only; scripted practice mode without a key
- **Payments:** Stripe Checkout, Customer Portal and verified webhooks; a development-only simulator

Current build and content status, with verified counts and open items: [COMPLETION_REPORT.md](COMPLETION_REPORT.md).

---

## Quick start (local development)

Requirements: Node.js 20+, PostgreSQL 16, Python 3.11+ and ffmpeg (only for the speech service and audio pipeline).

```bash
cp .env.example .env                 # then set DATABASE_URL and APP_SECRET (openssl rand -base64 32)
npm install
npm run db:migrate:dev               # creates the schema
npm run content:import               # loads /content into the database (published)
npm run dev                          # http://localhost:3000
```

Sign up at `/signup`. To get admin access, put your email in `ADMIN_EMAILS` before signing up (or change the role in
`/admin/users` from another admin account).

Optional, for real speech recognition and on-demand speech synthesis:

```bash
npm run speech:setup                 # venv, Python deps, Piper voices (~760 MB)
SPEECH_SERVICE_TOKEN=change-me npm run speech:dev     # http://127.0.0.1:8090
# then in .env: SPEECH_SERVICE_URL=http://127.0.0.1:8090 and SPEECH_SERVICE_TOKEN=change-me
```

Without any speech provider configured, the app uses the browser's built-in speech recognition where available and
says so in the interface.

## What works without credentials

Every external integration is optional. When credentials are missing the platform runs a clearly labelled fallback
instead of pretending the integration is live (`/admin` and `/api/health` show the current state):

| Feature | Live with | Fallback without credentials |
|---|---|---|
| AI coach | `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`) | "Practice mode": scripted scenario partner and rule-based checks for common mistakes, labelled in the chat |
| Speech recognition | `SPEECH_SERVICE_URL` (self-hosted Whisper), `OPENAI_API_KEY` or Azure | Browser Web Speech API where supported, otherwise self-review |
| Pronunciation assessment | `AZURE_SPEECH_KEY` + `AZURE_SPEECH_REGION` | Off — feedback compares the recognised words with the target and says it is not a pronunciation score |
| On-demand speech synthesis | Speech service or OpenAI | Pre-generated curriculum audio; other text uses the browser voice |
| Payments | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price IDs | Simulation mode in development only (never in production unless explicitly allowed) |
| Password-reset email | `SMTP_URL` | Development mailbox at `/dev/mailbox`; production refuses to send |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js development server, production build, production server |
| `npm run typecheck` · `npm run lint` | `next typegen` + TypeScript · ESLint |
| `npm test` | Vitest unit + integration tests (uses the `fluent_academy_test` database; set `TEST_DATABASE_URL` to override) |
| `npm run test:e2e` | Playwright end-to-end tests (desktop + phone) against a running app with imported content |
| `npm run db:migrate` | Apply migrations (production) · `db:migrate:dev` creates new ones |
| `npm run content:check` | Parse `/content` and print counts and errors |
| `npm run content:qa` | Full content QA → `content/manifest.json` (completeness) and `reports/content-qa.json` |
| `npx tsx scripts/content/check-course.ts fr A1` | Validate one course while authoring |
| `npm run content:build` | Write `content/dist/audio-manifest.json` (every clip the curriculum needs) |
| `npm run audio:generate` | Synthesise missing clips with Piper → `public/audio`, metadata → `content/audio-index.json` (resumable) |
| `npm run audio:qa` · `audio:qa:escalate` | Re-transcribe clips with Whisper and score them; re-check flagged clips with a larger model |
| `npm run content:import` | Import content + audio metadata into the database (`-- --draft` stages changes for review) |
| `npm run content:all` | QA → build → generate audio → audio QA → import |
| `npm run jobs:cleanup` | Retention and housekeeping job — run daily (see below) |

## Architecture

```
src/app/(marketing)      public site: home, features, method, languages, pricing, legal, credits
src/app/(auth)           signup, login, password recovery
src/app/onboarding       learner setup and placement check
src/app/(app)            learner app: dashboard, course, lessons, review, coach, speaking, reading,
                         listening, vocabulary, progress, achievements, assessments, settings, billing
src/app/admin            CMS: curriculum editor, revisions, review queue, passages, vocabulary,
                         audio QA, imports, users & roles, plans, system events, audit log
src/app/api              JSON API (every handler wrapped in route(): origin check + uniform errors)
src/server               server-only logic (auth, lessons, learner model, coach, speech, billing, content)
src/content              content model, YAML parser, QA rules (shared by scripts, tests and the CMS)
src/components           UI (design system in components/ui, feature components by area)
content/                 the curriculum as YAML (see content/CURRICULUM.md), taxonomies, plans, achievements
services/speech          FastAPI speech service + audio generation and QA scripts
prisma/                  schema and migrations
tests/                   unit, integration and e2e tests
```

Key design decisions:

- **Answers are checked on the server.** The browser never receives answer keys before it submits; `src/lib/validate.ts`
  is pure and unit-tested. Lesson scores use first attempts only; XP is awarded once per source (unique constraint).
- **Entitlements come only from the Subscription row**, written by signature-verified Stripe webhooks
  (`src/server/billing/service.ts`), processed idempotently. The browser's "payment succeeded" redirect grants nothing.
- **Learner model** (`src/server/learner-model`): every scored answer, coach correction and speaking attempt is an
  observation tagged with a taxonomy key. A weakness becomes active only with repeated evidence (≥ 3 errors on ≥ 2
  items across ≥ 2 days, error rate ≥ 30 % within 30 days) and resolves after a run of successes. Learners can dismiss it.
- **Speaking feedback is honest about its method.** With speech recognition only, the app aligns the recognised words
  with the target sentence and labels the result as intelligibility, not pronunciation. Per-word and phoneme-level
  scores appear only when Azure pronunciation assessment is configured, and are shown as that provider's estimates.
- **Content is files first, CMS second.** `/content` is the authored source. The importer versions every lesson
  (`LessonRevision`). Edits made in the CMS go through draft → review → approve → publish, and later imports never
  overwrite them: source changes queue for review instead.

## Security

- Passwords: Argon2id (OWASP parameters), minimum 10 characters, common-password rejection, constant-time checks for
  unknown accounts. Plaintext passwords are never stored or logged.
- Sessions: random 256-bit tokens stored as SHA-256 hashes, httpOnly + SameSite=Lax + Secure (production) cookie,
  30-day sliding expiry, all sessions revoked on password reset, role change or account deletion.
- Password reset: single-use, one-hour tokens; responses never reveal whether an account exists.
- Requests: same-origin check on every state-changing API call, JSON body size limits, Zod validation, Postgres-backed
  rate limits on sign-up, login, password reset, coach and speech uploads; daily usage quotas per plan.
- Authorisation: every learner record is queried with the signed-in user's id; staff routes require roles.
- Uploads: size limit, audio format sniffed from magic bytes, stored outside the web root with path-traversal checks.
- Headers: CSP, HSTS (production), X-Frame-Options DENY, nosniff, strict referrer policy, microphone limited to the site.
- Secrets live in environment variables only; API keys are used server-side and never sent to the browser. Logs redact
  passwords, tokens, cookies and keys.

## Data retention and learner control

| Data | Default retention | Learner control (Settings → Privacy) |
|---|---|---|
| Speaking recordings (audio) | `RECORDING_RETENTION_DAYS` (default 30), then deleted by `jobs:cleanup` | Turn off audio storage (recognition still works; audio is discarded), shorten retention, delete all recordings |
| Transcripts and speaking feedback | Until the learner deletes them or the account | Deleted with recordings or the account |
| Coach conversations | Until deleted | Delete all conversations |
| Progress, vocabulary, mistakes | Until account deletion | Export everything as JSON; delete the account (password + typed confirmation; cancels Stripe) |
| Sessions, reset tokens, rate-limit buckets | Expired entries removed daily | — |
| Usage counters, system events | 90 days | — |

Text sent to the AI provider (coach messages, writing for feedback) and audio sent to an external recognition provider
are processed under that provider's terms. The self-hosted speech service keeps everything on your infrastructure.

## Deployment

1. Provision PostgreSQL 16 and set `DATABASE_URL`, `APP_URL` (public https URL) and `APP_SECRET` (required in production).
2. `npm ci && npm run build && npm run db:migrate && npm run content:import`, then `npm start` behind TLS.
3. Serve curriculum audio: copy `public/audio` (generated, not in git) with the app, or upload it to object storage/CDN
   and set `AUDIO_BASE_URL` and `NEXT_PUBLIC_AUDIO_BASE_URL`. Regenerate with `npm run audio:generate` (resumable).
4. Optional services: deploy `services/speech` (Docker or VM with ffmpeg; set `SPEECH_SERVICE_TOKEN`), set AI keys,
   configure Stripe (create Products/Prices, set price IDs in `/admin/plans` or env, point a webhook at
   `/api/billing/webhook` for `checkout.session.completed`, `customer.subscription.*` and `invoice.payment_failed`),
   and set `SMTP_URL`.
5. Schedule `npm run jobs:cleanup` daily. Use `/api/health` for uptime checks (503 only when a required dependency is down).
6. Recordings and the TTS cache are written to `RECORDINGS_DIR` / `TTS_CACHE_DIR`; mount persistent storage for them.

## Content workflow

1. Write or edit YAML in `/content` following `content/CURRICULUM.md` (unit framework, grammar sequence, formats).
2. `npx tsx scripts/content/check-course.ts <lang> <level>` until there are no errors; `npm run content:qa` for the
   whole curriculum and the completeness manifest.
3. `npm run content:build && npm run audio:generate && npm run audio:qa && npm run audio:qa:escalate`.
4. `npm run content:import -- --draft` stages changes for review in `/admin/review`; without `--draft` they publish.
5. Native-speaker reviewers record linguistic reviews per lesson and passage in the CMS. **All content is AI-drafted
   and shown as "Not yet reviewed" until a review is recorded** — automatic QA checks structure and answer keys, not
   linguistic quality.

## Known limitations

- Curriculum content is AI-drafted and has not been reviewed by native speakers. See `content/manifest.json` for the
  exact completion state of every course, unit and lesson.
- Danish has one open synthetic voice; the second dialogue voice is derived from it by pitch and formant shifting.
- Synthetic voices are clear but not fully natural; audio QA verifies the words spoken, not naturalness.
- Pronunciation assessment requires Azure; without it the app does not score pronunciation.
- Practice mode recognises only a handful of common mistakes per language; connect an AI provider for real coaching.
