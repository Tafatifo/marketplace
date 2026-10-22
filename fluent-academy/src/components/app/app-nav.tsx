"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DropdownMenu } from "radix-ui";
import {
  Award,
  BookOpenText,
  Check,
  ChevronsUpDown,
  ClipboardCheck,
  CreditCard,
  GraduationCap,
  Headphones,
  LayoutDashboard,
  LineChart,
  LogOut,
  Menu,
  MessagesSquare,
  Mic,
  NotebookPen,
  Plus,
  RotateCcw,
  Settings,
  Shield,
  X,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/cn";
import { api } from "@/lib/api";

export const NAV_GROUPS = [
  {
    label: "Learn",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/learn", label: "Course", icon: GraduationCap },
      { href: "/review", label: "Review", icon: RotateCcw, badgeKey: "due" as const },
      { href: "/assessments", label: "Assessments", icon: ClipboardCheck },
    ],
  },
  {
    label: "Practise",
    items: [
      { href: "/coach", label: "AI coach", icon: MessagesSquare },
      { href: "/speaking", label: "Speaking", icon: Mic },
      { href: "/reading", label: "Reading", icon: BookOpenText },
      { href: "/listening", label: "Listening", icon: Headphones },
      { href: "/vocabulary", label: "Vocabulary", icon: NotebookPen },
    ],
  },
  {
    label: "You",
    items: [
      { href: "/progress", label: "Progress", icon: LineChart },
      { href: "/achievements", label: "Achievements", icon: Award },
    ],
  },
];

export interface NavProps {
  user: { name: string; email: string; role: string };
  plan: { name: string; isPremium: boolean };
  active: { language: string; languageName: string; nativeName: string; level: string };
  enrollments: { language: string; languageName: string; level: string }[];
  availableLanguages: { code: string; name: string }[];
  dueCount: number;
}

function LanguageSwitcher({ active, enrollments, availableLanguages }: Pick<NavProps, "active" | "enrollments" | "availableLanguages">) {
  const router = useRouter();
  const switchTo = async (language: string) => {
    await api("/api/enrollment", { body: { language, activate: true } });
    router.refresh();
  };
  const notEnrolled = availableLanguages.filter((l) => !enrollments.some((e) => e.language === l.code));
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex w-full items-center justify-between gap-2 rounded-xl border border-line bg-white px-3 py-2.5 text-left hover:border-navy-200 focus-visible:outline-2">
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-navy-900">{active.nativeName}</span>
          <span className="block text-xs text-muted">
            {active.languageName} · Level {active.level}
          </span>
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
        <span className="sr-only">Switch language</span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={6} className="z-50 min-w-[14rem] rounded-xl border border-line bg-white p-1.5 shadow-[var(--shadow-lift)]">
          <DropdownMenu.Label className="px-2.5 py-1.5 text-xs font-medium text-muted">Your languages</DropdownMenu.Label>
          {enrollments.map((e) => (
            <DropdownMenu.Item
              key={e.language}
              onSelect={() => e.language !== active.language && switchTo(e.language)}
              className="flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-sm text-ink outline-none data-[highlighted]:bg-navy-50"
            >
              <span>
                {e.languageName} <span className="text-muted">· {e.level}</span>
              </span>
              {e.language === active.language && <Check className="h-4 w-4 text-navy-700" />}
            </DropdownMenu.Item>
          ))}
          {notEnrolled.length > 0 && (
            <>
              <DropdownMenu.Separator className="my-1 h-px bg-line" />
              <DropdownMenu.Label className="px-2.5 py-1.5 text-xs font-medium text-muted">Add a language</DropdownMenu.Label>
              {notEnrolled.map((l) => (
                <DropdownMenu.Item
                  key={l.code}
                  onSelect={() => switchTo(l.code)}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-ink outline-none data-[highlighted]:bg-navy-50"
                >
                  <Plus className="h-4 w-4 text-subtle" /> {l.name}
                </DropdownMenu.Item>
              ))}
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function NavLinks({ dueCount, isStaff, onNavigate }: { dueCount: number; isStaff: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  return (
    <nav aria-label="App" className="space-y-6">
      {NAV_GROUPS.map((g) => (
        <div key={g.label}>
          <p className="px-3 text-[0.68rem] font-semibold tracking-[0.14em] text-subtle uppercase">{g.label}</p>
          <ul className="mt-1.5 space-y-0.5">
            {g.items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive(item.href) ? "bg-navy-900 text-white" : "text-navy-800 hover:bg-navy-50",
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="flex-1">{item.label}</span>
                  {"badgeKey" in item && item.badgeKey === "due" && dueCount > 0 && (
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[0.7rem] font-semibold tabular-nums",
                        isActive(item.href) ? "bg-white/20 text-white" : "bg-gold-100 text-gold-700",
                      )}
                    >
                      {dueCount > 99 ? "99+" : dueCount}
                      <span className="sr-only"> items due</span>
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div>
        <p className="px-3 text-[0.68rem] font-semibold tracking-[0.14em] text-subtle uppercase">Account</p>
        <ul className="mt-1.5 space-y-0.5">
          {[
            { href: "/settings", label: "Settings", icon: Settings },
            { href: "/billing", label: "Plan & billing", icon: CreditCard },
            ...(isStaff ? [{ href: "/admin", label: "Admin", icon: Shield }] : []),
          ].map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive(item.href) ? "bg-navy-900 text-white" : "text-navy-800 hover:bg-navy-50",
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

function UserFooter({ user, plan }: Pick<NavProps, "user" | "plan">) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const logout = async () => {
    setBusy(true);
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/login");
    router.refresh();
  };
  return (
    <div className="border-t border-line p-3">
      {!plan.isPremium && (
        <Link href="/billing" className="mb-3 block rounded-xl bg-navy-900 px-3.5 py-3 text-white transition-colors hover:bg-navy-800">
          <p className="text-sm font-semibold">Unlock the full academy</p>
          <p className="mt-0.5 text-xs text-navy-200">All levels, unlimited lessons, more coaching.</p>
        </Link>
      )}
      <div className="flex items-center gap-2.5 px-1">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-100 font-serif text-sm font-semibold text-navy-900" aria-hidden>
          {user.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-navy-900">{user.name}</p>
          <p className="truncate text-xs text-muted">{plan.name} plan</p>
        </div>
        <button
          type="button"
          onClick={logout}
          disabled={busy}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-navy-50 hover:text-navy-900"
          aria-label="Log out"
          title="Log out"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function AppSidebar(props: NavProps) {
  const isStaff = props.user.role !== "LEARNER";
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-white lg:flex">
      <div className="flex h-16 items-center px-5">
        <Link href="/dashboard" aria-label="Fluent Academy dashboard">
          <Logo />
        </Link>
      </div>
      <div className="px-4 pb-4">
        <LanguageSwitcher active={props.active} enrollments={props.enrollments} availableLanguages={props.availableLanguages} />
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-6">
        <NavLinks dueCount={props.dueCount} isStaff={isStaff} />
      </div>
      <UserFooter user={props.user} plan={props.plan} />
    </aside>
  );
}

export function MobileNav(props: NavProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);
  const isStaff = props.user.role !== "LEARNER";
  const tabs = [
    { href: "/dashboard", label: "Home", icon: LayoutDashboard },
    { href: "/learn", label: "Course", icon: GraduationCap },
    { href: "/coach", label: "Coach", icon: MessagesSquare },
    { href: "/review", label: "Review", icon: RotateCcw },
  ];
  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-white/90 px-4 backdrop-blur lg:hidden">
        <Link href="/dashboard" aria-label="Dashboard">
          <Logo />
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-navy-900 hover:bg-navy-50"
          aria-label="Open navigation"
          aria-expanded={open}
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button type="button" className="absolute inset-0 bg-navy-950/40 animate-fade-in" onClick={() => setOpen(false)} aria-label="Close navigation" />
          <div className="absolute inset-y-0 right-0 flex w-[min(20rem,88vw)] flex-col bg-white shadow-2xl animate-fade-in">
            <div className="flex h-14 items-center justify-between px-4">
              <span className="text-sm font-semibold text-navy-900">Menu</span>
              <button type="button" onClick={() => setOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-navy-50" aria-label="Close navigation">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-4 pb-4">
              <LanguageSwitcher active={props.active} enrollments={props.enrollments} availableLanguages={props.availableLanguages} />
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-6">
              <NavLinks dueCount={props.dueCount} isStaff={isStaff} onNavigate={() => setOpen(false)} />
            </div>
            <UserFooter user={props.user} plan={props.plan} />
          </div>
        </div>
      )}
      <nav aria-label="Quick" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
        {tabs.map((t) => {
          const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
          return (
            <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined} className={cn("flex flex-col items-center gap-0.5 py-2 text-[0.7rem] font-medium", active ? "text-navy-900" : "text-subtle")}>
              <t.icon className="h-5 w-5" aria-hidden />
              {t.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
