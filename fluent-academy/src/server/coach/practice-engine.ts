import "server-only";
import { normalizeAnswer, stripDiacritics } from "@/content/text";
import type { ScenarioTurn } from "@/content/types";
import type { SessionReview, TutorTurn } from "./schemas";

/**
 * Practice mode: a scripted tutor used when no language model is configured.
 * It follows the scenario script and applies a small set of documented,
 * rule-based checks for frequent learner errors. It is always labelled as
 * "Practice mode" in the interface and never presented as AI.
 */

interface Rule {
  re: RegExp;
  fix: (m: RegExpMatchArray, text: string) => string;
  explanation: string;
  category: string;
}

const N = "(\\d+|un|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingt|trente|quarante|cinquante|soixante)";

export const RULES: Record<string, Rule[]> = {
  fr: [
    { re: new RegExp(`\\bje suis ${N}( ans)?\\b`, "i"), fix: (m) => `j'ai ${m[1]} ans`, explanation: "French uses avoir for age: j'ai … ans.", category: "fr.avoir" },
    { re: /\bje (ai|aime|habite|étudie|adore|arrive|écoute|achète)\b/i, fix: (m) => `j'${m[1]}`, explanation: "Je becomes j' before a vowel or silent h.", category: "fr.elision" },
    { re: /\bje veux (un|une|des|du|de la|le|la|les)\b/i, fix: (m) => `je voudrais ${m[1]}`, explanation: "When ordering or asking politely, je voudrais sounds more natural than je veux.", category: "fr.register" },
    {
      re: /\bje (?!ne\b|n')([a-zéèêàâîôûç]+) pas\b/i,
      fix: (m) => (/^[aeiouéèêh]/i.test(m[1]!) ? `je n'${m[1]} pas` : `je ne ${m[1]} pas`),
      explanation: "In careful spoken and written French, negation surrounds the verb: ne … pas (n' before a vowel).",
      category: "fr.negation",
    },
    { re: /\b(il|elle|on) (es)\b/i, fix: (m) => `${m[1]} est`, explanation: "With il/elle/on, être is est.", category: "fr.etre" },
    { re: /\bj'ai allé\b/i, fix: () => "je suis allé(e)", explanation: "Aller forms the passé composé with être: je suis allé(e).", category: "fr.passe-compose-etre" },
    { re: /\b(à le)\b/i, fix: () => "au", explanation: "À + le contracts to au.", category: "fr.contractions" },
    { re: /\b(de le)\b/i, fix: () => "du", explanation: "De + le contracts to du.", category: "fr.contractions" },
  ],
  es: [
    { re: /\b(soy|estoy) (\d+|veinte|treinta|cuarenta|dieciocho|diecinueve) años\b/i, fix: (m) => `tengo ${m[2]} años`, explanation: "Spanish uses tener for age: tengo … años.", category: "es.tener" },
    { re: /\bestoy (estudiante|profesora?|médic[oa]|español[a]?|ingl[eé]s[a]?|alem[aá]n[a]?|frances[a]?)\b/i, fix: (m) => `soy ${m[1]}`, explanation: "Use ser for professions, nationality and identity.", category: "es.ser-estar" },
    { re: /\bsoy (cansad[oa]|enferm[oa]|content[oa]|en casa|en (madrid|el trabajo))\b/i, fix: (m) => `estoy ${m[1]}`, explanation: "Use estar for temporary states and location.", category: "es.ser-estar" },
    { re: /\byo gusto\b/i, fix: () => "me gusta", explanation: "Gustar works like 'to please': me gusta(n) …", category: "es.gustar" },
    { re: /\bquiero (un|una|el|la)\b/i, fix: (m) => `quisiera ${m[1]}`, explanation: "Quisiera or me pone… sounds more polite than quiero when ordering.", category: "es.register" },
  ],
  de: [
    { re: /\bich habe (\d+|zwanzig|dreißig|achtzehn|neunzehn) jahre\b/i, fix: (m) => `ich bin ${m[1]} Jahre alt`, explanation: "German uses sein for age: Ich bin … Jahre alt.", category: "de.sein" },
    { re: /\bich bin gegangen nach\b/i, fix: () => "ich bin nach … gegangen", explanation: "In the Perfekt, the past participle goes to the end of the clause.", category: "de.word-order" },
    { re: /\bheute ich (\w+)\b/i, fix: (m) => `heute ${m[1]} ich`, explanation: "Verb-second rule: after a time expression at the start, the verb comes next.", category: "de.word-order" },
    { re: /\bich möchte ein (kaffee|tee|wasser)\b/i, fix: (m) => `ich möchte einen ${m[1]}`, explanation: "Möchten takes the accusative: einen Kaffee (masculine).", category: "de.accusative" },
    { re: /\bich will (einen|eine|ein)\b/i, fix: (m) => `ich hätte gern ${m[1]}`, explanation: "Ich hätte gern / ich möchte is more polite than ich will when ordering.", category: "de.register" },
  ],
  en: [
    { re: /\bi have (\d+|twenty|thirty|eighteen|nineteen) years\b/i, fix: (m) => `I am ${m[1]} years old`, explanation: "English uses be for age: I'm … years old.", category: "en.be" },
    { re: /\bi am agree\b/i, fix: () => "I agree", explanation: "Agree is a verb: I agree (not I am agree).", category: "en.verb-forms" },
    { re: /\b(he|she|it) (don't|have)\b/i, fix: (m) => `${m[1]} ${m[2] === "have" ? "has" : "doesn't"}`, explanation: "Third person singular takes -s: he has, she doesn't.", category: "en.present-simple" },
    { re: /\bpeople is\b/i, fix: () => "people are", explanation: "People is plural: people are.", category: "en.agreement" },
    { re: /\bsince (\d+|two|three|four|five|ten) (years|months|weeks|days)\b/i, fix: (m) => `for ${m[1]} ${m[2]}`, explanation: "Use for with a length of time, since with a starting point.", category: "en.prepositions-time" },
    { re: /\bi am living here since\b/i, fix: () => "I have lived here since", explanation: "Use the present perfect with since for a situation that started in the past and continues.", category: "en.present-perfect" },
  ],
};

export function ruleCorrections(language: string, text: string): TutorTurn["corrections"] {
  const out: TutorTurn["corrections"] = [];
  for (const r of RULES[language] ?? []) {
    const m = text.match(r.re);
    if (!m) continue;
    const original = m[0];
    const corrected = r.fix(m, text);
    if (normalizeAnswer(original, language) === normalizeAnswer(corrected, language)) continue;
    out.push({ original, corrected, explanation: r.explanation, category: r.category, severity: "important" });
    if (out.length >= 2) break;
  }
  return out;
}

export function practiceTurn(opts: {
  language: string;
  script: ScenarioTurn[];
  userTurns: number; // number of learner messages including this one
  text: string;
  vocabulary: { term: string; translation: string }[];
  goals: string[];
}): TutorTurn & { finished: boolean } {
  const { script, userTurns, text, language } = opts;
  const corrections = ruleCorrections(language, text);
  const prev = script[userTurns - 1];
  const next = script[userTurns];
  const normalized = ` ${stripDiacritics(normalizeAnswer(text, language))} `;
  const addressed = !prev?.expect?.length || prev.expect.some((k) => normalized.includes(` ${stripDiacritics(normalizeAnswer(k, language))}`));
  const finished = !next;
  const closing: Record<string, string> = {
    fr: "Merci beaucoup, c'était très bien ! Tu peux terminer la conversation pour voir ton bilan.",
    es: "¡Muchas gracias, lo has hecho muy bien! Puedes terminar la conversación para ver tu resumen.",
    de: "Vielen Dank, das war sehr gut! Du kannst das Gespräch jetzt beenden und deine Auswertung ansehen.",
    en: "Thank you, that was great! You can end the conversation now to see your review.",
  };
  const nudge: Record<string, string> = {
    fr: "Pas de problème. ",
    es: "No pasa nada. ",
    de: "Kein Problem. ",
    en: "No problem. ",
  };
  const reply = finished ? closing[language] ?? closing.en! : `${!addressed ? nudge[language] ?? "" : ""}${next!.tutor}`;
  return {
    reply,
    replyTranslation: finished ? "Thank you — you can end the conversation to see your review." : next!.translation ?? "",
    corrections,
    vocabulary: userTurns === 1 ? opts.vocabulary.slice(0, 3) : [],
    hint: finished ? "" : next!.hint,
    goalsCompleted: opts.goals.map((_, i) => i).filter((i) => i < Math.floor((userTurns / Math.max(1, script.length)) * opts.goals.length)),
    finished,
  };
}

export function practiceReview(opts: {
  scenarioTitle: string;
  userMessages: string[];
  corrections: TutorTurn["corrections"];
  vocabulary: { term: string; translation: string }[];
  nextScenario: string;
}): SessionReview {
  const words = opts.userMessages.join(" ").split(/\s+/).filter(Boolean).length;
  const unique = new Map(opts.corrections.map((c) => [c.original.toLowerCase(), c]));
  return {
    summary: `You completed the scripted “${opts.scenarioTitle}” practice with ${opts.userMessages.length} message${opts.userMessages.length === 1 ? "" : "s"} (${words} words). This review was produced by practice mode's rule-based checks, which only detect a small set of common mistakes — connect an AI provider for a full review.`,
    strengths: words >= 30 ? ["You kept the conversation going with complete replies."] : ["You took part in every turn of the conversation."],
    keyMistakes: [...unique.values()].slice(0, 6),
    correctedSentences: [...unique.values()].slice(0, 6).map((c) => ({ original: c.original, corrected: c.corrected })),
    newVocabulary: opts.vocabulary.slice(0, 8).map((v) => ({ ...v, example: "" })),
    grammarPatterns: [...new Map([...unique.values()].map((c) => [c.category, { pattern: c.category, explanation: c.explanation, category: c.category }])).values()].slice(0, 4),
    recommendedCategories: [...new Set([...unique.values()].map((c) => c.category))],
    suggestedNextScenario: opts.nextScenario,
    difficultyAdjustment: "same",
  };
}
