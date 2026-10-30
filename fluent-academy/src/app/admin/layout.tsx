import type { Metadata } from "next";
import { AdminNav, AdminShellHeader, MobileAdminBar } from "@/components/admin/admin-nav";
import { requireStaff } from "@/server/auth/current";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin", robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  const pending = await db.lessonRevision.count({ where: { status: { in: ["IN_REVIEW", "APPROVED"] } } });
  return (
    <div className="min-h-screen bg-canvas">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-white lg:flex">
        <AdminShellHeader />
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <AdminNav role={user.role} pending={pending} />
        </div>
        <div className="border-t border-line px-5 py-3 text-xs text-muted">
          Signed in as <span className="font-medium text-navy-900">{user.name}</span>
          <br />
          {user.role.charAt(0) + user.role.slice(1).toLowerCase()}
        </div>
      </aside>
      <MobileAdminBar />
      <div className="lg:pl-64">
        <main id="main" className="mx-auto w-full max-w-6xl px-4 pt-6 pb-16 sm:px-6 lg:px-10 lg:pt-10">
          {children}
        </main>
      </div>
    </div>
  );
}
