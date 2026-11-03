"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  AudioLines,
  BookOpenText,
  ClipboardCheck,
  CreditCard,
  FileStack,
  LayoutGrid,
  Library,
  NotebookPen,
  ScrollText,
  Users,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/cn";

const GROUPS = [
  {
    label: "Content",
    items: [
      { href: "/admin", label: "Overview", icon: LayoutGrid, exact: true },
      { href: "/admin/content", label: "Curriculum", icon: Library },
      { href: "/admin/review", label: "Review queue", icon: ClipboardCheck, badge: true },
      { href: "/admin/passages", label: "Passages", icon: BookOpenText },
      { href: "/admin/vocabulary", label: "Vocabulary", icon: NotebookPen },
      { href: "/admin/audio", label: "Audio QA", icon: AudioLines },
      { href: "/admin/imports", label: "Imports", icon: FileStack },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/admin/users", label: "Users & roles", icon: Users, adminOnly: true },
      { href: "/admin/plans", label: "Plans & pricing", icon: CreditCard, adminOnly: true },
      { href: "/admin/events", label: "System events", icon: Activity },
      { href: "/admin/audit", label: "Audit log", icon: ScrollText },
    ],
  },
];

export function AdminNav({ role, pending }: { role: string; pending: number }) {
  const pathname = usePathname();
  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
  return (
    <nav aria-label="Admin" className="space-y-6">
      {GROUPS.map((g) => (
        <div key={g.label}>
          <p className="px-3 text-[0.68rem] font-semibold tracking-[0.14em] text-subtle uppercase">{g.label}</p>
          <ul className="mt-1.5 space-y-0.5">
            {g.items
              .filter((i) => !("adminOnly" in i && i.adminOnly) || role === "ADMIN")
              .map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive(item.href, "exact" in item && item.exact) ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      isActive(item.href, "exact" in item && item.exact) ? "bg-navy-900 text-white" : "text-navy-800 hover:bg-navy-50",
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="flex-1">{item.label}</span>
                    {"badge" in item && item.badge && pending > 0 && (
                      <span className="rounded-full bg-gold-100 px-1.5 py-0.5 text-[0.7rem] font-semibold text-gold-700 tabular-nums">
                        {pending}
                        <span className="sr-only"> waiting</span>
                      </span>
                    )}
                  </Link>
                </li>
              ))}
          </ul>
        </div>
      ))}
      <Link href="/dashboard" className="flex items-center gap-2 px-3 text-sm text-muted hover:text-navy-900">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to learning
      </Link>
    </nav>
  );
}

export function AdminShellHeader() {
  return (
    <div className="flex h-16 items-center gap-2 px-5">
      <Link href="/admin" aria-label="Fluent Academy admin">
        <Logo />
      </Link>
      <span className="rounded-md bg-navy-900 px-1.5 py-0.5 text-[0.65rem] font-semibold tracking-wider text-white uppercase">CMS</span>
    </div>
  );
}

export function MobileAdminBar() {
  const pathname = usePathname();
  const items = GROUPS.flatMap((g) => g.items);
  return (
    <div className="sticky top-0 z-30 border-b border-line bg-white lg:hidden">
      <AdminShellHeader />
      <div className="flex gap-1 overflow-x-auto px-3 pb-2">
        {items.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium",
              pathname === i.href || ("exact" in i && i.exact ? false : pathname.startsWith(`${i.href}/`)) ? "bg-navy-900 text-white" : "bg-navy-50 text-navy-800",
            )}
          >
            {i.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
