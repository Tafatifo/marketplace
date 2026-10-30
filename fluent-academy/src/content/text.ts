/**
 * Text normalisation shared by content generation and answer validation.
 */

const APOSTROPHES = /[’‘ʼ´`′]/g;
const QUOTES = /[“”„«»‹›"]/g;
// Punctuation that never changes the meaning of a short answer.
const PUNCT = /[.,!?¡¿;:…()\[\]{}–—*_~]/g;

export function cleanText(s: string): string {
  return s.normalize("NFC").replace(APOSTROPHES, "'").replace(QUOTES, '"').replace(/\s+/g, " ").trim();
}

/** Case/punctuation-insensitive form that keeps accents (accents matter in most languages). */
export function normalizeAnswer(s: string, lang = "en"): string {
  let out = cleanText(s).toLocaleLowerCase(lang).replace(QUOTES, "").replace(PUNCT, " ");
  // Hyphens and slashes between words are usually optional for learners (allez-vous / allez vous).
  out = out.replace(/(\S)-(\S)/g, "$1 $2").replace(/\s-\s/g, " ").replace(/\//g, " ");
  // French typographic spacing before punctuation already removed; collapse whitespace.
  out = out.replace(/\s+/g, " ").trim();
  if (lang === "en") out = expandEnglishContractions(out);
  if (lang === "de") out = out.replace(/ß/g, "ss");
  // "aa" is the traditional spelling of å (still used in some names and on keyboards without å).
  if (lang === "da") out = out.replace(/aa/g, "å");
  return out;
}

export function stripDiacritics(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/ß/g, "ss")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/œ/g, "oe");
}

const CONTRACTIONS: [RegExp, string][] = [
  [/\bcan't\b/g, "cannot"],
  [/\bcan not\b/g, "cannot"],
  [/\bwon't\b/g, "will not"],
  [/\bshan't\b/g, "shall not"],
  [/\bain't\b/g, "is not"],
  [/\b(\w+)n't\b/g, "$1 not"],
  [/\bi'm\b/g, "i am"],
  [/\b(you|we|they)'re\b/g, "$1 are"],
  [/\b(he|she|it|that|there|what|who|where|here)'s\b/g, "$1 is"],
  [/\b(i|you|we|they|who)'ve\b/g, "$1 have"],
  [/\b(i|you|he|she|we|they|it|who|that)'ll\b/g, "$1 will"],
  [/\b(i|you|he|she|we|they|it|who)'d\b/g, "$1 would"],
  [/\blet's\b/g, "let us"],
];

export function expandEnglishContractions(s: string): string {
  let out = s;
  for (const [re, rep] of CONTRACTIONS) out = out.replace(re, rep);
  return out;
}

export function words(s: string, lang = "en"): string[] {
  const n = normalizeAnswer(s, lang);
  return n ? n.split(" ") : [];
}

export function countWords(s: string): number {
  return cleanText(s)
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** Levenshtein distance (iterative, O(n·m)). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length]!;
}

/** Deterministic 32-bit hash (FNV-1a) used to seed shuffles. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** murmur3 finaliser: decorrelates seeds that differ only slightly (e.g. "...-e1" vs "...-e2"). */
function fmix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export function seededRandom(seed: string) {
  let a = fmix32(hash32(seed)) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic Fisher–Yates shuffle. By default it never returns the input order
 * (useful for ordering/matching tasks); pass allowIdentity for unbiased option order.
 */
export function seededShuffle<T>(items: T[], seed: string, allowIdentity = false): T[] {
  const rand = seededRandom(seed);
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  if (!allowIdentity && out.length > 1 && out.every((v, i) => v === items[i])) out.push(out.shift()!);
  return out;
}

/**
 * Splits a sentence into draggable tokens for ordering exercises. Sentence-final
 * punctuation (and Spanish opening marks) are held back as a fixed prefix/suffix.
 */
export function orderTokens(sentence: string): { tokens: string[]; prefix: string; suffix: string } {
  let s = cleanText(sentence);
  let prefix = "";
  let suffix = "";
  const pre = s.match(/^[¿¡]+/);
  if (pre) {
    prefix = pre[0];
    s = s.slice(prefix.length);
  }
  const suf = s.match(/\s*[.!?…]+$/);
  if (suf) {
    suffix = suf[0].trim();
    s = s.slice(0, s.length - suf[0].length);
  }
  const raw = s.split(" ").filter(Boolean);
  const tokens: string[] = [];
  for (const t of raw) {
    // Attach stand-alone punctuation (French spacing: "Bonjour , ...") to the previous token.
    if (/^[,;:»"]+$/.test(t) && tokens.length) tokens[tokens.length - 1] += ` ${t}`;
    else tokens.push(t);
  }
  return { tokens, prefix, suffix };
}
