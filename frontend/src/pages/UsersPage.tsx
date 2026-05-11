import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Mail, MoreHorizontal, Search, ShieldCheck, UserPlus, Users as UsersIcon } from "lucide-react";
import { useMemo, useState } from "react";

import type { Role } from "@/api/auth";
import { createUser, listUsers, type UserInput } from "@/api/users";
import { Card, CardBody } from "@/components/ui/Card";
import { KpiCard } from "@/components/ui/KpiCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { shortDate } from "@/lib/format";

const blank: UserInput = {
  email: "",
  username: "",
  full_name: "",
  password: "",
  role: "officer",
};

function initials(name?: string | null) {
  if (!name) return "?";
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

export function UsersPage() {
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ["users"], queryFn: listUsers });
  const [showInvite, setShowInvite] = useState(false);
  const [form, setForm] = useState<UserInput>(blank);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");

  const mutate = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setForm(blank);
      setShowInvite(false);
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const data = users.data ?? [];

  const filtered = useMemo(
    () =>
      data.filter((u) => {
        if (roleFilter && u.role !== roleFilter) return false;
        if (activeFilter === "active" && !u.active) return false;
        if (activeFilter === "inactive" && u.active) return false;
        if (q) {
          const hay = `${u.username} ${u.email} ${u.full_name ?? ""}`.toLowerCase();
          if (!hay.includes(q.toLowerCase())) return false;
        }
        return true;
      }),
    [data, roleFilter, activeFilter, q],
  );

  const kpis = useMemo(() => {
    const active = data.filter((u) => u.active);
    return {
      total: data.length,
      sessions: active.length,
      admins: data.filter((u) => u.role === "admin").length,
      invites: 0,
    };
  }, [data]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users & Access"
        description="Manage user accounts, roles, and access to keep your invoicing operations secure and efficient."
        actions={
          <button
            type="button"
            onClick={() => setShowInvite((s) => !s)}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-medium px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand"
            data-testid="invite-user-btn"
          >
            <UserPlus size={16} /> Invite user
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="users-kpis">
        <KpiCard label="Total users" value={kpis.total} tone="brand" icon={<UsersIcon size={18} />} description={`${kpis.total} vs last month`} testId="kpi-total-users" />
        <KpiCard label="Active sessions" value={kpis.sessions} tone="success" icon={<Activity size={18} />} description="All users active" testId="kpi-sessions" />
        <KpiCard label="Admins" value={kpis.admins} tone="violet" icon={<ShieldCheck size={18} />} description={`${Math.round((kpis.admins / Math.max(1, kpis.total)) * 100)}% of total users`} testId="kpi-admins" />
        <KpiCard label="Pending invites" value={kpis.invites} tone="warning" icon={<Mail size={18} />} description="No pending invites" testId="kpi-invites" />
      </div>

      {showInvite && (
        <Card>
          <CardBody>
            <h2 className="mb-3 text-sm font-semibold">Invite user</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
              <Field label="Username" value={form.username} onChange={(v) => setForm({ ...form, username: v })} testId="user-username" />
              <Field label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} testId="user-email" />
              <Field label="Full name" value={form.full_name ?? ""} onChange={(v) => setForm({ ...form, full_name: v })} testId="user-name" />
              <Field label="Password" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} testId="user-password" />
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-500">Role</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                  data-testid="user-role"
                >
                  <option value="officer">officer</option>
                  <option value="admin">admin</option>
                </select>
              </div>
            </div>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowInvite(false)} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button
                onClick={() => mutate.mutate(form)}
                disabled={!form.username || !form.email || form.password.length < 10 || mutate.isPending}
                className="rounded-md bg-brand-medium px-4 py-2 text-sm font-medium text-white hover:bg-brand disabled:opacity-50"
                data-testid="user-submit"
              >
                {mutate.isPending ? "Creating…" : "Create user"}
              </button>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody>
          <div className="flex flex-wrap items-end gap-3">
            <div className="relative min-w-[260px] flex-1">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by username, email, or name"
                className="h-10 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                data-testid="users-search"
              />
            </div>
            <FilterSelect label="All roles" value={roleFilter} onChange={setRoleFilter} options={[
              { value: "", label: "All roles" },
              { value: "admin", label: "Admin" },
              { value: "officer", label: "Officer" },
            ]} />
            <FilterSelect label="All status" value={activeFilter} onChange={setActiveFilter} options={[
              { value: "", label: "All status" },
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]} />
            <button
              type="button"
              onClick={() => {
                setQ("");
                setRoleFilter("");
                setActiveFilter("");
              }}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              data-testid="users-clear"
            >
              Clear filters
            </button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm" data-testid="users-table">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Username</th>
                  <th className="px-5 py-2.5 font-medium">Email</th>
                  <th className="px-5 py-2.5 font-medium">Full name</th>
                  <th className="px-5 py-2.5 font-medium">Role</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 font-medium">Last login</th>
                  <th className="px-5 py-2.5 font-medium">MFA</th>
                  <th className="px-5 py-2.5 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.isLoading ? (
                  <tr><td colSpan={8} className="px-5 py-10 text-center text-sm text-slate-500">Loading…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={8} className="px-5 py-10 text-center text-sm text-slate-500">No users match.</td></tr>
                ) : (
                  filtered.map((u) => (
                    <tr key={u.id} className="transition hover:bg-slate-50" data-testid="user-row">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand">
                            {initials(u.full_name ?? u.username)}
                          </span>
                          <span className="font-medium text-slate-900">{u.username}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-slate-700">{u.email}</td>
                      <td className="px-5 py-3 text-slate-700">{u.full_name ?? "—"}</td>
                      <td className="px-5 py-3">
                        <StatusBadge tone={u.role === "admin" ? "review" : "compliant"} withDot={false}>
                          {u.role === "admin" ? "Admin" : "Officer"}
                        </StatusBadge>
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge tone={u.active ? "active" : "neutral"}>{u.active ? "Active" : "Inactive"}</StatusBadge>
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500">{u.last_login ? shortDate(u.last_login) : "Never"}</td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          <ShieldCheck size={12} /> Enabled
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <button className="rounded p-1 text-slate-500 hover:bg-slate-100" data-testid="user-actions">
                          <MoreHorizontal size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 text-xs text-slate-500">
            <span>Showing 1 to {filtered.length} of {filtered.length} users</span>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  testId?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-500">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
      />
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-500">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 rounded-md border border-slate-300 bg-white px-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
