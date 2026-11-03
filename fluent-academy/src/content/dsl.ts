/**
 * Line-oriented authoring syntax used inside YAML literal blocks.
 *
 * Literal blocks (`key: |`) let authors write natural French/Spanish/German text
 * (with ": " and " #" sequences that would otherwise break YAML) while keeping
 * files compact and diff-friendly. Each helper here parses one kind of block.
 *
 * Separators: " | " between fields, "||" between exercise fields,
 * "@name value" for optional exercise attributes.
 */

export function lines(block: string | undefined | null): string[] {
  if (!block) return [];
  return block
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
}

export function splitFields(line: string, sep = "|"): string[] {
  // Split on a single pipe that is not part of "||".
  if (sep === "|") return line.split(/(?<!\|)\|(?!\|)/).map((f) => f.trim());
  return line.split(sep).map((f) => f.trim());
}

export interface RawVocab {
  term: string;
  gloss: string;
  pos?: string;
  example: string;
  exampleTranslation?: string;
  collocations: string[];
  note?: string;
  gender?: string;
  plural?: string;
  translations?: Record<string, string>;
}

/**
 * `term | gloss | pos | example | example translation | c: coll1; coll2 | n: note | g: f | pl: plural | t: es=..; fr=..`
 * Use "-" for an empty positional field.
 */
export function parseVocabLine(line: string): RawVocab {
  const f = splitFields(line);
  if (f.length < 4) throw new Error(`Vocabulary line needs at least 4 fields: "${line}"`);
  const [term, gloss, pos, example, exTr, ...extra] = f;
  const v: RawVocab = {
    term: term!,
    gloss: gloss!,
    pos: pos && pos !== "-" ? pos : undefined,
    example: example!,
    exampleTranslation: exTr && exTr !== "-" ? exTr : undefined,
    collocations: [],
  };
  for (const e of extra) {
    const m = e.match(/^(c|n|g|pl|t):\s*(.*)$/);
    if (!m) throw new Error(`Unknown vocabulary field "${e}" in "${line}"`);
    const [, k, val] = m;
    if (k === "c") v.collocations = val!.split(";").map((s) => s.trim()).filter(Boolean);
    else if (k === "n") v.note = val;
    else if (k === "g") v.gender = val;
    else if (k === "pl") v.plural = val;
    else if (k === "t") {
      v.translations = {};
      for (const pair of val!.split(";")) {
        const [lang, ...rest] = pair.split("=");
        if (lang && rest.length) v.translations[lang.trim()] = rest.join("=").trim();
      }
    }
  }
  if (!v.term || !v.gloss || !v.example) throw new Error(`Vocabulary line is missing term, gloss or example: "${line}"`);
  return v;
}

/** `text | translation | note` */
export function parseExampleLine(line: string) {
  const [text, translation, note] = splitFields(line);
  return { text: text!, translation: translation || undefined, note: note || undefined };
}

/** First line is the header row. */
export function parseTable(block: string | undefined) {
  const rows = lines(block).map((l) => splitFields(l));
  if (rows.length < 2) return undefined;
  return { head: rows[0]!, rows: rows.slice(1) };
}

/** `L: text | translation` where L is a speaker id from the `speakers` field. */
export function parseDialogueLine(line: string) {
  const m = line.match(/^([A-Za-z0-9_]{1,12}):\s*(.+)$/);
  if (!m) throw new Error(`Dialogue line must start with a speaker id: "${line}"`);
  const [text, translation] = splitFields(m[2]!);
  return { speaker: m[1]!, text: text!, translation: translation || undefined };
}

/** `L=Léa/f; M=Marc/m` */
export function parseSpeakers(spec: string | undefined) {
  if (!spec) return [];
  return spec
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/^([A-Za-z0-9_]{1,12})=(.+)\/([fm])$/);
      if (!m) throw new Error(`Invalid speaker spec "${s}" (expected ID=Name/f|m)`);
      return { id: m[1]!, name: m[2]!.trim(), gender: m[3] as "f" | "m" };
    });
}

/** `wrong => right | why` */
export function parseMistakeLine(line: string) {
  const m = line.match(/^(.+?)\s*=>\s*(.+)$/);
  if (!m) throw new Error(`Mistake line must use "wrong => right | why": "${line}"`);
  const [right, why] = splitFields(m[2]!);
  if (!why) throw new Error(`Mistake line needs an explanation: "${line}"`);
  return { wrong: m[1]!.trim(), right: right!, why };
}

/** `term | translation | note` */
export function parseGlossaryLine(line: string) {
  const [term, translation, note] = splitFields(line);
  if (!term || !translation) throw new Error(`Glossary line needs term and translation: "${line}"`);
  return { term, translation, note: note || undefined };
}

export interface RawExercise {
  kind: string;
  fields: string[];
  attrs: Record<string, string>;
  source: string;
}

const EXERCISE_KINDS = new Set([
  "mc", "tf", "fill", "order", "match", "tr", "tr-en", "rw", "short", "listen", "dict", "say", "ask", "write",
]);

/**
 * `kind: field || field || ... || @attr value`
 *
 * mc:     QUESTION || opt | *correct | opt || WHY
 * tf:     STATEMENT || true|false || WHY
 * fill:   SENTENCE with ___ || ans / alt ; ans2 || WHY            (";" separates blanks, "/" alternatives)
 * order:  SENTENCE || TRANSLATION || WHY?                         (@alt other accepted orders, "|" separated)
 * match:  a = b ; c = d ; e = f || WHY?
 * tr:     SOURCE (English) || accepted | accepted || WHY          (translate into the course language)
 * tr-en:  SOURCE (course language) || accepted | accepted || WHY  (translate into English)
 * rw:     INSTRUCTION :: SOURCE || accepted | accepted || WHY     (rewrite / transform)
 * short:  QUESTION || accepted | accepted  (or "kw: a/b & c") || WHY
 * listen: AUDIO TEXT (or @dialogue) || QUESTION || opt | *correct || WHY
 * dict:   SENTENCE || HINT?
 * say:    SENTENCE || TRANSLATION
 * ask:    PROMPT || kw: a/b & c || MODEL ANSWER
 * write:  PROMPT || min=40 || req: pattern | pattern || MODEL ANSWER
 *
 * Attributes: @tags a,b  @skill grammar  @obj text  @hint text  @ctx dialogue  @alt a | b
 */
export function parseExerciseLine(line: string): RawExercise {
  const m = line.match(/^([a-z-]+):\s*(.*)$/);
  if (!m || !EXERCISE_KINDS.has(m[1]!)) throw new Error(`Unknown exercise type in "${line}"`);
  const parts = m[2]!.split("||").map((p) => p.trim());
  const fields: string[] = [];
  const attrs: Record<string, string> = {};
  for (const p of parts) {
    if (p.startsWith("@") && p !== "@dialogue") {
      // One field may hold several attributes: "@tags a,b @skill vocabulary".
      for (const chunk of p.split(/\s+(?=@[a-z]+\s)/)) {
        const a = chunk.match(/^@([a-z]+)\s+(.*)$/);
        if (!a) throw new Error(`Malformed attribute "${chunk}" in "${line}"`);
        attrs[a[1]!] = a[2]!.trim();
      }
    } else fields.push(p);
  }
  return { kind: m[1]!, fields, attrs, source: line };
}

/** Parses `opt | *correct | opt` into options and the correct index. */
export function parseOptions(field: string, source: string) {
  const raw = splitFields(field);
  let correct = -1;
  const options = raw.map((o, i) => {
    if (o.startsWith("*")) {
      if (correct !== -1) throw new Error(`Multiple correct options in "${source}"`);
      correct = i;
      return o.slice(1).trim();
    }
    return o;
  });
  if (correct === -1) throw new Error(`No correct option (prefix with *) in "${source}"`);
  if (options.length < 2) throw new Error(`Need at least two options in "${source}"`);
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) {
    throw new Error(`Duplicate options in "${source}"`);
  }
  return { options, correct };
}

/** "kw: a/b & c" → [["a","b"],["c"]] */
export function parseKeywords(field: string): string[][] | null {
  const m = field.match(/^kw:\s*(.+)$/);
  if (!m) return null;
  return m[1]!
    .split("&")
    .map((g) => g.split("/").map((s) => s.trim()).filter(Boolean))
    .filter((g) => g.length > 0);
}
