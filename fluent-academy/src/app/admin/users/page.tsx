import { RoleSelect } from "@/components/admin/forms";
import { Table } from "@/components/admin/badges";
import { Badge, PageHeader } from "@/components/ui/primitives";
import { formatDate, formatNumber } from "@/lib/format";
import { requireStaff } from "@/server/auth/current";
import { db } from "@/server/db";

/**
 * Account administration. Shows account-level information only — learners' private
 * records (recordings, conversations, answers) are not exposed here.
 */
export default async function UsersAdmin(props: PageProps<"/admin/users">) {
  const actor = await requireStaff("ADMIN");
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const where = q ? { OR: [{ email: { contains: q, mode: "insensitive" as const } }, { name: { contains: q, mode: "insensitive" as const } }] } : {};
  const [users, total, byRole] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, name: true, email: true, role: true, createdAt: true, lastLoginAt: true, subscription: { select: { planCode: true, status: true, provider: true } } },
    }),
    db.user.count({ where }),
    db.user.groupBy({ by: ["role"], _count: true }),
  ]);
  return (
    <>
      <PageHeader eyebrow="Operations" title="Users & roles" description="Editors write and publish content, reviewers approve revisions and record linguistic reviews, admins manage everything. Role changes sign the user out." />
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {byRole.map((r) => <Badge key={r.role} tone="outline">{r.role.toLowerCase()} · {formatNumber(r._count)}</Badge>)}
      </div>
      <form className="mb-5 flex gap-2" role="search">
        <input name="q" defaultValue={q} placeholder="Search name or email" aria-label="Search users" className="h-10 flex-1 rounded-lg border border-line bg-white px-3 text-sm" />
        <button className="h-10 rounded-lg bg-navy-900 px-4 text-sm font-medium text-white">Search</button>
      </form>
      <p className="mb-3 text-sm text-muted">{formatNumber(total)} accounts</p>
      <Table>
        <thead><tr><th>User</th><th>Plan</th><th>Joined</th><th>Last sign-in</th><th>Role</th></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td><p className="font-medium text-navy-900">{u.name}</p><p className="text-xs text-muted">{u.email}</p></td>
              <td className="text-sm">{u.subscription?.planCode ?? "free"}{u.subscription && u.subscription.status !== "ACTIVE" && ` · ${u.subscription.status.toLowerCase()}`}{u.subscription?.provider === "simulation" && " · simulated"}</td>
              <td className="text-sm">{formatDate(u.createdAt)}</td>
              <td className="text-sm">{u.lastLoginAt ? formatDate(u.lastLoginAt) : "—"}</td>
              <td><RoleSelect userId={u.id} role={u.role} disabled={u.id === actor.id} /></td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
