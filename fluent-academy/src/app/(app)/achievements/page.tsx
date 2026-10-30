import type { Metadata } from "next";
import { icons, type LucideIcon } from "lucide-react";
import { Badge, PageHeader } from "@/components/ui/primitives";
import { db } from "@/server/db";
import { requireLearner } from "@/server/learner";
import { awardAchievements } from "@/server/progress/achievements";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Achievements" };

function iconFor(name: string): LucideIcon {
  const key = name.split("-").map((p) => p[0]!.toUpperCase() + p.slice(1)).join("") as keyof typeof icons;
  return icons[key] ?? icons.Award;
}

export default async function AchievementsPage() {
  const ctx = await requireLearner("/achievements");
  await awardAchievements(ctx.user.id);
  const [all, mine] = await Promise.all([
    db.achievement.findMany({ orderBy: { sortOrder: "asc" } }),
    db.userAchievement.findMany({ where: { userId: ctx.user.id } }),
  ]);
  const earned = new Map(mine.map((m) => [m.achievementCode, m.earnedAt]));
  return (
    <>
      <PageHeader eyebrow="You" title="Achievements" description={`${earned.size} of ${all.length} earned. Badges mark real milestones — they don't award XP, so there's nothing to farm.`} />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {all.map((a) => {
          const Icon = iconFor(a.icon);
          const at = earned.get(a.code);
          return (
            <li key={a.code} className={cn("card flex items-start gap-4 p-5", !at && "opacity-60")}>
              <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", at ? "bg-navy-900 text-gold-400" : "bg-navy-50 text-navy-300")}>
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <p className="font-semibold text-navy-900">{a.title}</p>
                <p className="mt-0.5 text-sm text-muted">{a.description}</p>
                {at ? <Badge tone="success" className="mt-2">Earned {formatDate(at)}</Badge> : <Badge tone="neutral" className="mt-2">Not yet</Badge>}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
