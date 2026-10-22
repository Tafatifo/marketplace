import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PlacementTest } from "@/components/onboarding/placement-test";
import { requireUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { placementItems } from "@/server/assessment/placement";
import { toPublicExercise } from "@/server/lessons/service";
import { LANGUAGE_META } from "@/content/voices";

export const metadata: Metadata = { title: "Placement check" };
export const dynamic = "force-dynamic";

export default async function PlacementPage(props: PageProps<"/onboarding/placement">) {
  const user = await requireUser("/onboarding/placement");
  const { lang } = await props.searchParams;
  const prefs = await db.userPreferences.findUnique({ where: { userId: user.id } });
  const language = typeof lang === "string" && LANGUAGE_META[lang] ? lang : prefs?.activeLanguage;
  if (!language) redirect("/onboarding");
  const enrollment = await db.enrollment.findUnique({ where: { userId_languageCode: { userId: user.id, languageCode: language } } });
  const items = await placementItems(language);
  if (items.length < 8) redirect("/dashboard");
  return (
    <PlacementTest
      language={language}
      languageName={LANGUAGE_META[language]!.name}
      currentLevel={enrollment?.levelCode ?? "A1"}
      items={items.map((i) => ({
        ...toPublicExercise({ id: i.id, key: i.key, order: i.order, type: (i.prompt as { kind: string }).kind === "listen" ? "LISTENING" : (i.prompt as { kind: string }).kind === "fill" ? "FILL_BLANK" : "MULTIPLE_CHOICE", skill: i.skill, prompt: i.prompt, points: 10 }),
        level: i.levelCode,
      }))}
    />
  );
}
