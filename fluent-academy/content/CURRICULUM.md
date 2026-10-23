# Fluent Academy curriculum plan and authoring guide

This is the single source of truth for writing course content. Every course (language × level) follows the same
unit framework so the platform, the AI coach and learners moving between languages get a consistent experience,
while grammar is sequenced for each language so levels build on each other without gaps or repetition.

- Languages: English (`en`), French (`fr`), Spanish (`es`), German (`de`), Danish (`da`)
- Levels: CEFR A1, A2, B1, B2 — 8 units per level, 3 lessons per unit, plus a unit review and a level assessment
- Instruction language: English (titles, explanations, questions, feedback). Target-language text is used for
  dialogues, readings, examples, vocabulary and answers.
- The English course is **monolingual**: vocabulary glosses are simple English definitions, dialogues have no
  translations, and translation exercises (`tr`, `tr-en`) are replaced by rewriting, gap-fill and comprehension items.

## Non-negotiable rules

1. **Original material only.** Write every dialogue, text, example and exercise yourself. Do not reproduce or
   paraphrase textbooks, websites, songs or other copyrighted text. Real place names and well-known public facts are fine.
2. **Correct, natural, current language** in the standard variety: British/American-neutral English (US spelling),
   metropolitan French, peninsular Spanish (note Latin American alternatives where useful), standard German
   (Germany), standard Danish (rigsdansk). Use correct accents and characters (é, ñ, ß, æ/ø/å). No machine-sounding
   phrasing. Learner-facing explanations must be accurate — if unsure about a rule, choose an example you are sure of.
3. **Level-appropriate.** Stay within the grammar scope listed for the unit and earlier units. A1 dialogue lines are
   short (≈4–9 words); A2 ≈6–12; B1 ≈8–16; B2 ≈10–22. Readings get longer by level (see Library).
4. **Every answer key must be unambiguous.** Multiple-choice distractors must be clearly wrong for a stated reason;
   fill-in blanks list every acceptable variant (`a / b`); translations list the common correct variants (`|`).
5. **Content is AI-drafted.** It is marked as unreviewed in the platform until a native-speaker reviewer signs it off.
   Do not claim it has been reviewed.
6. **Inclusive and neutral.** Diverse names, ages, jobs and family types; no stereotypes; no politics beyond neutral
   civic topics; no brands as product placement.

## Files

```
content/courses/<lang>/<level>/course.yaml   syllabus, 8 planned units with lesson titles, assessmentItems
content/courses/<lang>/<level>/u01.yaml … u08.yaml
content/readings/<lang>/<level>.yaml          6 reading + 4 listening passages
content/placement/<lang>.yaml                 7 items per level (A1–B2)
content/scenarios/NN-*.yaml                   AI-coach scenarios (one section per language)
content/taxonomy/<lang>.yaml                  grammar/skill tags — exercise @tags must use these keys
```

Reference implementation: `content/courses/fr/a1/course.yaml` and `content/courses/fr/a1/u01.yaml`. Copy their
structure exactly. The line formats (vocabulary, dialogue, exercises) are documented in `src/content/dsl.ts`.

### Course file (`course.yaml`)

Fields: `language`, `level`, `title` ("Spanish A1 · Foundations"), `description`, `monolingual: true` (English only),
`hours`, `summary`, `objectives` (6–8), `canDo` (listening, reading, spokenInteraction, spokenProduction, writing),
`grammar` (the level's grammar scope), `vocabularyDomains`, `assessment` (one sentence), `units` (8 × `title`, `theme`,
`lessons: [3 titles]`) and `assessmentItems` (18–22 exercise lines covering every unit and skill, including 2–3
`listen`, 2 `tr`/`rw`, 1 `short` and 1 `write`). Unit `title`s are in the target language; lesson titles in English.
The lesson titles in `units` must match the `title` of each lesson in the unit file exactly.

### Unit file (`uNN.yaml`)

`unit`, `title`, `theme`, `description`, `free` (true for units 1–2 only), `objectives` (3), `canDo` (3–4 "I can…"),
`review` (10–12 exercise lines mixing all three lessons, including 2 `listen`, 1 `ask` and 1 `write`) and `lessons`.

Each lesson needs, at minimum (checked automatically):

| Block | Requirement |
|---|---|
| `objectives` | 2–3 |
| `intro` | 2–4 sentences, why this matters |
| `vocab` | 10–14 items, each with an example sentence and its translation; collocations/notes where useful; `g:` gender for nouns in fr/es/de/da |
| `grammar` | `title`, `body` ≥ 200 characters of clear explanation, `table` where useful, ≥ 3 `examples`, a `tip` |
| `dialogue` (or `reading` at B1/B2) | 8–12 lines with 2–3 speakers (`speakers: A=Name/f; B=Name/m`) and translations (not for English) |
| `pronunciation` | `title`, `body`, 5–6 `items` (words or short phrases from the lesson) |
| `culture` | 1–2 short paragraphs (optional at B2) |
| `mistakes` | 3 lines `wrong => right | why` |
| `task` | a real-world speaking or writing task (`mode: speaking|writing|interaction`) |
| `exercises` | 12–15 authored lines using ≥ 5 different kinds, including ≥ 1 `listen`, ≥ 1 `ask` or `say`, ≥ 1 `write` or `tr`, ≥ 1 `dict` |

The parser adds derived practice automatically (matching, meaning check, hearing recognition, dictation from the
dialogue, sentence order, repeat-after-me). Do not duplicate those by hand.

Exercise `@tags` must be keys from `content/taxonomy/<lang>.yaml` (comma-separated, no spaces). Tag every grammar
item. `@ctx dialogue` marks comprehension questions about the lesson's dialogue.

### Library (`content/readings/<lang>/<level>.yaml`)

A YAML list of passages: 6 `kind: reading` and 4 `kind: listening`. Each has `slug`, `kind`, `title`, `topic`,
`summary`, `free` (true for 2 of the 10), `text`, `translation` (not for English), `glossary` (6–10 lines
`term | translation | note`), and `questions` (5–6 exercise lines: mc, tf, short, fill). Listening passages are
dialogues: give `speakers` and write `text` as `ID: line` (one per line, no inline translations).

Length by level (words): A1 80–200 · A2 150–350 · B1 250–550 · B2 350–800. Topics follow the level's unit themes
(one passage per unit theme where possible) so the library supports the course.

### Placement (`content/placement/<lang>.yaml`)

Keys `A1`, `A2`, `B1`, `B2`, each a block of 7 items (mostly `mc`, plus 1 `fill` and 1 `listen`) that discriminate
that level from the one below. Mirror `content/placement/fr.yaml`.

## Unit framework (all languages)

Lesson titles are shared across languages; adapt the content to the culture of the language (cities, food, customs).

### A1 · Foundations
1. Greetings and introductions — Greetings and goodbyes · Introducing yourself · Numbers, age and spelling
2. Family and people — My family · Describing people · Jobs and workplaces
3. Time and daily routine — Telling the time · My daily routine · Days and frequency
4. Food and drink — Ordering at a café · At the market · At the restaurant
5. Town and home — Places in town · Asking for directions · My home
6. Shopping — Clothes and colours · Prices and numbers to 100 · In a shop
7. Free time and weather — Hobbies and likes · Weather and seasons · Making plans
8. Travel — Getting around · Plans for the weekend · Booking a room

### A2 · Everyday life
1. Life stories — Last weekend · My life so far · Childhood memories
2. Holidays and travel — A holiday to remember · Planning a trip · When things go wrong on a trip
3. Health and the body — Aches and pains · At the doctor's and the pharmacy · Healthy habits
4. Work and studies — My studies · A day at work · Applying for a job
5. Home and housing — Finding a flat · Furniture and chores · Neighbours and community
6. Services and errands — At the bank and the post office · Returns and exchanges · Phone calls and messages
7. Celebrations and traditions — Festivals and holidays · Invitations and parties · Gifts and good wishes
8. Plans and choices — Future plans · Making arrangements · Comparing options

### B1 · Independence
1. People and relationships — Personality and character · Friendship and disagreements · Telling an anecdote
2. Work and careers — The job interview · Emails and meetings · Changing careers
3. Education and learning — School memories and systems · How we learn languages · Giving advice
4. Media and technology — News and how we follow it · Digital life · Solving a tech problem
5. City and environment — City or countryside? · Green habits · Proposing solutions
6. Health and lifestyle — Stress and wellbeing · Food culture · Sport and fitness
7. Culture and entertainment — Reviewing a film or series · Books and music · Recommending and retelling a story
8. Society and travel — Travelling responsibly · What would you do if…? · Customs and stereotypes

### B2 · Fluency
1. Identity and society — Identity and belonging · Generations · Living between languages
2. Work and the economy — The future of work · Negotiating · Consumer society
3. Science and technology — Innovation and ethics · Artificial intelligence · Health and medicine in the news
4. Environment — Climate policy · Sustainable cities · Debating solutions
5. Media and persuasion — Misinformation and media literacy · Advertising and persuasion · Writing an opinion piece
6. Arts and culture — Talking about art · Cultural heritage · Humour and wordplay
7. Citizenship and public life — Rights and responsibilities · Public services · Formal complaints
8. Looking ahead — Predictions and speculation · Regrets and lessons learned · Presenting an argument

## Grammar sequence by language

Each unit's lessons together cover the listed grammar (in addition to the communicative goals). Earlier items may be
recycled; later items must not be required.

### French (fr)
- **A1** 1 tu/vous, être, s'appeler, avoir, numbers 0–20 · 2 possessives, adjective agreement, articles & gender, jobs without article · 3 time, reflexive verbs, -er present, frequency · 4 partitive, je voudrais, quantities, negation ne…pas · 5 prepositions of place, à+le=au, il y a, imperative · 6 demonstratives, colours/agreement, numbers to 100, questions (combien, quel) · 7 aimer + infinitive, faire, weather, aller · 8 futur proche, transport prepositions, questions (est-ce que, inversion)
- **A2** 1 passé composé with avoir · 2 passé composé with être, agreement · 3 avoir mal à, imperative (advice), il faut · 4 imparfait vs passé composé (intro), depuis/il y a · 5 comparatives, y, possessive pronouns · 6 direct & indirect object pronouns · 7 en, futur simple (intro), conditionnel de politesse · 8 futur simple, si + présent, superlatives
- **B1** 1 imparfait vs passé composé, relative pronouns qui/que/où · 2 conditionnel, formal register, connectors · 3 subjonctif after il faut que, giving advice · 4 plus-que-parfait, reported speech (present) · 5 subjonctif after opinion/emotion, en+gérondif · 6 pronouns y/en, double pronouns · 7 dont, ce qui/ce que, past narration · 8 si + imparfait + conditionnel, hypotheses
- **B2** 1 subjonctif (doubt, concession: bien que), nuance · 2 conditionnel passé, negotiation language · 3 passive voice, nominalisation · 4 connectors of cause/consequence/opposition · 5 reported speech (past), argumentation · 6 relative pronouns lequel/auquel/duquel · 7 formal letters, subjonctif passé · 8 futur antérieur, si + plus-que-parfait + conditionnel passé (regrets)

### Spanish (es)
- **A1** 1 tú/usted, ser, llamarse, tener, numbers 0–20 · 2 possessives, adjective agreement, articles & gender, ser + profession · 3 time, reflexive verbs, present regular verbs, frequency · 4 quiero/quisiera, partitive-free quantities (un poco de), stem-changing verbs · 5 hay vs estar, prepositions of place, al/del, imperative (tú) for directions · 6 demonstratives, colours, numbers to 100, cuánto/a · 7 gustar, hacer + weather, ir · 8 ir a + infinitive, transport, question words
- **A2** 1 pretérito indefinido (regular) · 2 indefinido (irregular), pretérito perfecto · 3 doler, imperative for advice, tener que/hay que · 4 pretérito imperfecto, desde/hace · 5 comparatives, por/para (intro) · 6 direct & indirect object pronouns · 7 future tense, conditional for politeness · 8 future, si + presente, superlatives
- **B1** 1 indefinido vs imperfecto, relative pronouns · 2 conditional, formal register, connectors · 3 present subjunctive (wishes, advice) · 4 pluperfect, reported speech (present) · 5 subjunctive after opinion/emotion, estar + gerundio · 6 double object pronouns, se impersonal · 7 lo que, past narration · 8 si + imperfect subjunctive + conditional
- **B2** 1 subjunctive (doubt, concession: aunque) · 2 conditional perfect, negotiation · 3 passive (ser + participio, pasiva refleja) · 4 cause/consequence connectors · 5 reported speech (past) · 6 relative pronouns el cual/cuyo · 7 formal letters, perfect subjunctive · 8 future perfect, si + pluscuamperfecto de subjuntivo (regrets)

### German (de)
- **A1** 1 du/Sie, sein, heißen, haben, numbers 0–20 · 2 possessive articles, nominative, gender, Beruf without article · 3 time, separable verbs, present regular verbs, frequency · 4 möchte, accusative (ein/einen), kein/nicht · 5 dative with in/an/auf (location), es gibt, imperative (Sie) · 6 dieser, colours, numbers to 100, wie viel · 7 gern/mögen, Wetter (es ist…), stem-changing verbs · 8 modal verbs (wollen, müssen, können), verb-second word order, W-questions
- **A2** 1 Perfekt with haben · 2 Perfekt with sein, Präteritum of sein/haben · 3 Körper, imperative (du), sollen · 4 weil/dass (verb-final), seit · 5 comparatives, two-way prepositions · 6 dative pronouns and verbs with dative · 7 reflexive verbs, Konjunktiv II for politeness (würde, hätte gern) · 8 Futur I, wenn-clauses, superlatives
- **B1** 1 Präteritum (narration), relative clauses (nominative/accusative) · 2 Konjunktiv II, formal register, connectors (deshalb, trotzdem) · 3 infinitive with zu, giving advice (sollte) · 4 Plusquamperfekt, indirect questions · 5 obwohl, adjective endings (definite) · 6 reflexive verbs with prepositions, da-/wo-compounds · 7 relative clauses (dative, with prepositions) · 8 Konjunktiv II for hypotheses (wenn… würde/hätte/wäre)
- **B2** 1 adjective endings (all), nominal style · 2 Konjunktiv II past (hätte… gemacht), negotiation · 3 passive (all tenses), Passiversatz · 4 connectors (zwar… aber, je… desto) · 5 Konjunktiv I (indirect speech) · 6 genitive and genitive prepositions · 7 formal letters, Nominalisierung · 8 Futur II, regrets with Konjunktiv II past

### English (en, monolingual)
- **A1** 1 be, subject pronouns, numbers 0–20, spelling · 2 possessives ('s, my/your), have got, a/an, jobs · 3 present simple, time, frequency adverbs · 4 countable/uncountable, some/any, would like · 5 there is/are, prepositions of place, imperatives · 6 this/that/these/those, how much/many, numbers to 100 · 7 like + -ing, present continuous, weather · 8 going to, can for possibility, question forms
- **A2** 1 past simple (regular/irregular) · 2 past continuous, past simple · 3 should, have to, imperatives for advice · 4 present perfect (ever/never), for/since · 5 comparatives, quantifiers · 6 object pronouns, polite requests (could you…?) · 7 will vs going to, invitations · 8 present continuous for arrangements, first conditional, superlatives
- **B1** 1 narrative tenses, used to · 2 present perfect continuous, formal emails, connectors · 3 modals of advice and obligation, gerund vs infinitive · 4 past perfect, reported speech · 5 passive (present/past), first conditional · 6 relative clauses (defining) · 7 relative clauses (non-defining), past narration · 8 second conditional, wish
- **B2** 1 modals of deduction, nuance · 2 third conditional, mixed conditionals, negotiation · 3 passive (all tenses), have something done · 4 linking words of contrast/cause, cleft sentences · 5 reported speech (advanced), reporting verbs · 6 inversion for emphasis, participle clauses · 7 formal register, complaints · 8 future continuous/perfect, wishes and regrets

### Danish (da)
- **A1** 1 du/De (De is rare and formal), være/hedde/have, numbers 0–20 · 2 en/et, possessives (min/mit/mine), adjective agreement · 3 time, present tense (-r), frequency, V2 word order · 4 jeg vil gerne have…, definite nouns, negation with ikke · 5 prepositions i/på, der er, imperative · 6 den/det/de her, colours, numbers to 100 (halvtreds, tres…), hvor meget · 7 kan lide + infinitive, the weather, modal verbs (kan, vil, skal) · 8 future with skal/vil, transport, question words
- **A2** 1 past tense (datid) regular · 2 irregular past, perfect with har · 3 perfect with er, ondt i, imperative for advice, skal/bør · 4 subordinate clauses (fordi, at — ikke before the verb), siden/i … år · 5 comparatives, plural nouns · 6 object pronouns, polite requests (kunne du…?) · 7 reflexive verbs, s-verbs (synes, mødes) · 8 future (kommer til at, vil), hvis-clauses, superlatives
- **B1** 1 past vs perfect, relative clauses (som/der) · 2 formal register, connectors (derfor, selvom) · 3 modal verbs in past (kunne, ville, skulle) · 4 past perfect, reported speech · 5 passive with -s, definite adjective phrases (den store by) · 6 sin/sit/sine vs hans/hendes · 7 particle verbs, narration · 8 hypotheses with hvis + past (hvis jeg havde… ville jeg)
- **B2** 1 nuance and sentence adverbs (jo, nok, vel) · 2 conditional perfect (ville have…), negotiation · 3 passive with blive, nominal style · 4 connectors of cause/contrast · 5 reported speech (past), argumentation · 6 compound words, register · 7 formal letters · 8 future perfect, regrets (hvis bare…)

## Validating your work

```
npx tsx scripts/content/check-course.ts <lang> <LEVEL>     # e.g. es A1 — course, units, library
npx tsx scripts/content/check-course.ts <lang> --placement  # placement test + scenario coverage
npx tsx scripts/content/check.ts --dump <lesson-slug>       # see a lesson as the app will (incl. derived items)
```

Fix every ERROR. Warnings are acceptable only when intentional. Run the check after each unit file, not only at the end.
