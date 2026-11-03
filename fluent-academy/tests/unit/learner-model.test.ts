import { describe, expect, it } from "vitest";
import { classifyWeakness, WEAKNESS_RULES } from "@/server/learner-model/observations";
import { ruleCorrections } from "@/server/coach/practice-engine";

const now = new Date("2026-03-10T12:00:00Z");
const day = (d: number) => new Date(now.getTime() - d * 86_400_000);
const row = (outcome: "ERROR" | "SUCCESS", daysAgo: number, item: string, confidence = 1) => ({
  outcome, sourceId: item, createdAt: day(daysAgo), evidence: null, detail: null, confidence,
});

describe("classifyWeakness", () => {
  it("does not flag a weakness from a single mistake", () => {
    expect(classifyWeakness([row("ERROR", 0, "a")], null, null, now).status).toBe("EMERGING");
  });
  it("needs repeated errors on different items and days", () => {
    const sameDay = [row("ERROR", 0, "a"), row("ERROR", 0, "b"), row("ERROR", 0, "c")];
    expect(classifyWeakness(sameDay, null, null, now).status).toBe("EMERGING");
    const sameItem = [row("ERROR", 0, "a"), row("ERROR", 1, "a"), row("ERROR", 2, "a")];
    expect(classifyWeakness(sameItem, null, null, now).status).toBe("EMERGING");
    const repeated = [row("ERROR", 0, "a"), row("ERROR", 1, "b"), row("ERROR", 3, "c"), row("SUCCESS", 2, "d")];
    expect(classifyWeakness(repeated, null, null, now).status).toBe("ACTIVE");
  });
  it("ignores evidence outside the window", () => {
    const old = [row("ERROR", 40, "a"), row("ERROR", 41, "b"), row("ERROR", 45, "c")];
    expect(classifyWeakness(old, null, null, now).status).not.toBe("ACTIVE");
  });
  it("counts low-confidence evidence (noisy recordings) at half weight", () => {
    const noisy = [row("ERROR", 0, "a", 0.4), row("ERROR", 1, "b", 0.4), row("ERROR", 2, "c", 0.4), row("ERROR", 3, "d", 0.4)];
    expect(classifyWeakness(noisy, null, null, now).status).toBe("EMERGING");
  });
  it("moves an active weakness to improving, then resolved, with consecutive successes", () => {
    const base = [row("ERROR", 5, "a"), row("ERROR", 4, "b"), row("ERROR", 3, "c")];
    const three = [...base, row("SUCCESS", 2, "d"), row("SUCCESS", 1, "e"), row("SUCCESS", 0, "f")];
    expect(classifyWeakness(three, "ACTIVE", null, now).status).toBe("IMPROVING");
    const six = [...base, ...[2, 1.5, 1, 0.8, 0.5, 0].map((d, i) => row("SUCCESS", d, `s${i}`))];
    expect(classifyWeakness(six, "IMPROVING", null, now).status).toBe("RESOLVED");
  });
  it("respects a learner's dismissal for the cooldown period", () => {
    const evidence = [row("ERROR", 0, "a"), row("ERROR", 1, "b"), row("ERROR", 3, "c")];
    expect(classifyWeakness(evidence, "ACTIVE", day(5), now).status).toBe("DISMISSED");
    expect(classifyWeakness(evidence, "DISMISSED", day(WEAKNESS_RULES.dismissCooldownDays + 1), now).status).toBe("ACTIVE");
  });
});

describe("practice-mode corrections", () => {
  it("catches common French errors", () => {
    expect(ruleCorrections("fr", "je suis 25 ans")[0]?.corrected).toMatch(/j'ai 25 ans/i);
    expect(ruleCorrections("fr", "je aime le café")[0]?.corrected).toMatch(/j'aime/i);
    expect(ruleCorrections("fr", "je parle pas anglais")[0]?.corrected).toMatch(/ne parle pas/);
  });
  it("leaves correct sentences alone", () => {
    expect(ruleCorrections("fr", "J'ai vingt-cinq ans et je ne parle pas allemand.")).toEqual([]);
    expect(ruleCorrections("en", "I have been living here for two years.")).toEqual([]);
  });
});
