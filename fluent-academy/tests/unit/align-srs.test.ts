import { describe, expect, it } from "vitest";
import { alignWords } from "@/lib/align";
import { schedule, scheduleMistake } from "@/lib/srs";

describe("alignWords", () => {
  it("marks matched, close, substituted and missing words", () => {
    const a = alignWords("Je voudrais un café, s'il vous plaît.", "je voudrai un thé s'il vous plaît", "fr");
    const status = Object.fromEntries(a.words.map((w) => [w.word, w.status]));
    expect(status["Je"]).toBe("match");
    expect(status["voudrais"]).toBe("close");
    expect(status["café,"]).toBe("substituted");
    expect(a.matchRatio).toBeGreaterThan(0.6);
    expect(alignWords("un deux trois", "un trois", "fr").words[1]!.status).toBe("missing");
  });
  it("reports extra words", () => {
    expect(alignWords("bonjour", "euh bonjour", "fr").extra).toEqual(["euh"]);
  });
});

describe("schedule (SM-2)", () => {
  const fresh = { easeFactor: 2.5, intervalDays: 0, repetitions: 0, lapses: 0 };
  const now = new Date("2026-01-01T10:00:00Z");
  it("grows intervals with successful recall", () => {
    const one = schedule(fresh, 4, now);
    const two = schedule(one, 4, now);
    const three = schedule(two, 4, now);
    expect([one.intervalDays, two.intervalDays]).toEqual([1, 3]);
    expect(three.intervalDays).toBeGreaterThan(two.intervalDays);
  });
  it("resets and relearns after a lapse", () => {
    const r = schedule({ easeFactor: 2.5, intervalDays: 10, repetitions: 4, lapses: 0 }, 1, now);
    expect(r.repetitions).toBe(0);
    expect(r.lapses).toBe(1);
    expect(r.dueAt.getTime() - now.getTime()).toBe(10 * 60_000);
    expect(r.easeFactor).toBeCloseTo(2.3);
  });
  it("never lets ease drop below 1.3", () => {
    let s = { ...fresh };
    for (let i = 0; i < 20; i++) s = schedule(s, 0, now);
    expect(s.easeFactor).toBe(1.3);
  });
  it("graduates mistakes after four correct reviews", () => {
    let s = { intervalDays: 1, repetitions: 0, easeFactor: 2.5 };
    let graduated = false;
    for (let i = 0; i < 4; i++) {
      const r = scheduleMistake(s, true, now);
      s = r;
      graduated = r.graduated;
    }
    expect(graduated).toBe(true);
    expect(scheduleMistake(s, false, now).repetitions).toBe(0);
  });
});
