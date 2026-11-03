import type { Metadata } from "next";
import { OnboardingWizard } from "@/components/onboarding/wizard";
import { requireUser } from "@/server/auth/current";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Set up your plan" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await requireUser("/onboarding");
  const [courses, placement] = await Promise.all([
    db.course.findMany({ where: { status: "PUBLISHED" }, select: { languageCode: true, levelCode: true } }),
    db.placementItem.groupBy({ by: ["languageCode"], _count: true }),
  ]);
  const availableLevels: Record<string, string[]> = {};
  for (const c of courses) (availableLevels[c.languageCode] ??= []).push(c.levelCode);
  return (
    <OnboardingWizard
      userName={user.name}
      availableLevels={availableLevels}
      placementLanguages={placement.filter((p) => p._count >= 8).map((p) => p.languageCode)}
    />
  );
}
