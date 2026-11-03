import "server-only";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { buildTaxonomy } from "@/content/parse";
import type { TaxonomyEntry } from "@/content/types";

let cache: Map<string, TaxonomyEntry> | null = null;

function load(): Map<string, TaxonomyEntry> {
  if (cache) return cache;
  const map = new Map<string, TaxonomyEntry>();
  const dir = path.resolve(process.cwd(), "content/taxonomy");
  try {
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".yaml"))) {
      const raw = YAML.parse(fs.readFileSync(path.join(dir, f), "utf8")) as { tags: string };
      for (const t of buildTaxonomy(f.replace(".yaml", ""), raw.tags)) map.set(t.key, t);
    }
  } catch {
    // Taxonomy files are optional; fall back to generated labels.
  }
  cache = map;
  return map;
}

export function taxonomyEntries(language?: string): TaxonomyEntry[] {
  return [...load().values()].filter((t) => !language || t.language === language);
}

const GENERIC: Record<string, string> = {
  listening: "Listening comprehension",
  reading: "Reading comprehension",
  speaking: "Speaking tasks",
  pronunciation: "Pronunciation",
};

/** Human-readable label for a taxonomy key, including generated keys (vocab.*, pron.*). */
export function labelFor(key: string, extra?: { lessonTitle?: string; word?: string }): string {
  const t = load().get(key);
  if (t) return t.label;
  if (key.startsWith("vocab.")) return extra?.lessonTitle ? `Vocabulary: ${extra.lessonTitle}` : "Lesson vocabulary";
  if (key.startsWith("pron.")) return extra?.word ? `Pronouncing “${extra.word}”` : "Pronunciation";
  const suffix = key.split(".").slice(1).join(".");
  if (GENERIC[suffix]) return GENERIC[suffix]!;
  return suffix.replace(/[-_]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function skillFor(key: string, fallback: string): string {
  const t = load().get(key);
  if (t) return t.skill;
  if (key.startsWith("vocab.")) return "vocabulary";
  if (key.startsWith("pron.")) return "pronunciation";
  return fallback;
}
