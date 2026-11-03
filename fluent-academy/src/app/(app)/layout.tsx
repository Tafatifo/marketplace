import { AppSidebar, MobileNav, type NavProps } from "@/components/app/app-nav";
import { LANGUAGE_META } from "@/content/voices";
import { db } from "@/server/db";
import { requireLearner } from "@/server/learner";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireLearner();
  const now = new Date();
  const [vocabDue, exerciseDue, languages] = await Promise.all([
    db.userVocabulary.count({ where: { userId: ctx.user.id, languageCode: ctx.enrollment.languageCode, dueAt: { lte: now }, status: { not: "SUSPENDED" } } }),
    db.exerciseReview.count({ where: { userId: ctx.user.id, languageCode: ctx.enrollment.languageCode, dueAt: { lte: now } } }),
    db.course.findMany({ where: { status: "PUBLISHED" }, distinct: ["languageCode"], select: { languageCode: true } }),
  ]);
  const meta = LANGUAGE_META[ctx.enrollment.languageCode];
  const nav: NavProps = {
    user: { name: ctx.user.name, email: ctx.user.email, role: ctx.user.role },
    plan: { name: ctx.plan.name, isPremium: ctx.isPremium },
    active: {
      language: ctx.enrollment.languageCode,
      languageName: meta?.name ?? ctx.enrollment.languageCode,
      nativeName: meta?.nativeName ?? ctx.enrollment.languageCode,
      level: ctx.enrollment.levelCode,
    },
    enrollments: ctx.enrollments.map((e) => ({ language: e.languageCode, languageName: LANGUAGE_META[e.languageCode]?.name ?? e.languageCode, level: e.levelCode })),
    availableLanguages: languages.map((l) => ({ code: l.languageCode, name: LANGUAGE_META[l.languageCode]?.name ?? l.languageCode })),
    dueCount: vocabDue + exerciseDue,
  };
  return (
    <div className="min-h-screen bg-canvas">
      <AppSidebar {...nav} />
      <MobileNav {...nav} />
      <div className="lg:pl-64">
        <main id="main" className="mx-auto w-full max-w-6xl px-4 pt-6 pb-28 sm:px-6 lg:px-10 lg:pt-10 lg:pb-16">
          {children}
        </main>
      </div>
    </div>
  );
}
