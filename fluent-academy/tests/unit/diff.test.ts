import { describe, expect, it } from "vitest";
import { diffLines, diffStats } from "@/lib/diff";

describe("diffLines", () => {
  it("finds added and removed lines and collapses unchanged runs", () => {
    const before = Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n");
    const after = before.replace("line 20", "line twenty").concat("\nline 40");
    const d = diffLines(before, after);
    expect(diffStats(d)).toEqual({ added: 2, removed: 1 });
    expect(d.some((l) => l.op === "skip")).toBe(true);
  });
  it("returns no changes for identical text", () => {
    expect(diffStats(diffLines("a\nb", "a\nb"))).toEqual({ added: 0, removed: 0 });
  });
});
