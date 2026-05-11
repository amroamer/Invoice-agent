import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, Download, MoreHorizontal, RefreshCw, Search, ShieldAlert, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import { actionBreakdown, downloadAuditCsv, listAuditLogs } from "@/api/audit";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Donut } from "@/components/ui/Donut";
import { KpiCard } from "@/components/ui/KpiCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Sparkline } from "@/components/ui/Sparkline";
import { StatusBadge } from "@/components/ui/StatusBadge";

export function AuditPage() {
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [q, setQ] = useState("");

  const logs = useQuery({
    queryKey: ["audit-logs", actionFilter, entityFilter, userFilter, since, until],
    queryFn: () =>
      listAuditLogs({
        action: actionFilter || undefined,
        entity_type: entityFilter || undefined,
        user_id: userFilter || undefined,
        since: since || undefined,
        until: until || undefined,
        limit: 200,
      }),
    refetchInterval: 60_000,
  });
  const breakdown = useQuery({ queryKey: ["audit-breakdown"], queryFn: () => actionBreakdown() });

  const data = logs.data ?? [];

  const filtered = useMemo(
    () => data.filter((l) => (q ? `${l.action} ${l.entity_id ?? ""}`.toLowerCase().includes(q.toLowerCase()) : true)),
    [data, q],
  );

  const kpis = useMemo(() => {
    const failedLogins = data.filter((l) => l.action === "auth.login_failed").length;
    const aiActions = data.filter((l) => l.action.startsWith("match.") || l.action.startsWith("recommendation.")).length;
    const exports = data.filter((l) => l.action.includes("export")).length;
    return { total: data.length, failedLogins, aiActions, exports };
  }, [data]);

  const topActions = (breakdown.data ?? []).slice(0, 4);
  const topActionsTotal = topActions.reduce((a, b) => a + b.count, 0) || 1;
  const topUsersMap = new Map<string, number>();
  for (const l of data) {
    if (!l.user_id) continue;
    topUsersMap.set(l.user_id, (topUsersMap.get(l.user_id) ?? 0) + 1);
  }
  const topUsers = [...topUsersMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const activitySeries = useMemo(() => {
    const buckets: number[] = Array(30).fill(0);
    const now = Date.now();
    for (const l of data) {
      const days = Math.floor((now - new Date(l.timestamp).getTime()) / 86_400_000);
      if (days >= 0 && days < 30) buckets[29 - days]++;
    }
    return buckets;
  }, [data]);

  const ACTION_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EF4444"];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit & Activity Log"
        description="Track system events, user actions, and AI activity across the Finance Invoicing Agent."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                logs.refetch();
                breakdown.refetch();
              }}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              data-testid="audit-refresh"
            >
              <RefreshCw size={14} /> Refresh
            </button>
            <button
              type="button"
              onClick={() => downloadAuditCsv()}
              className="inline-flex items-center gap-2 rounded-md bg-brand-medium px-3 py-2 text-sm font-medium text-white hover:bg-brand"
              data-testid="audit-export"
            >
              <Download size={14} /> Export CSV
            </button>
          </div>
        }
      />

      <Card>
        <CardBody>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <Field label="Action type" value={actionFilter} onChange={setActionFilter} placeholder="All actions" testId="audit-action" />
            <Field label="Entity type" value={entityFilter} onChange={setEntityFilter} placeholder="All entities" testId="audit-entity" />
            <Field label="User" value={userFilter} onChange={setUserFilter} placeholder="Select user" testId="audit-user" />
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-500">Date range</label>
              <div className="flex items-center gap-2">
                <input type="date" value={since} onChange={(e) => setSince(e.target.value)} className="h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" />
                <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" />
              </div>
            </div>
            <div className="flex items-end gap-2">
              <button
                onClick={() => {
                  setActionFilter("");
                  setEntityFilter("");
                  setUserFilter("");
                  setSince("");
                  setUntil("");
                }}
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                data-testid="audit-clear"
              >
                Clear all
              </button>
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="audit-kpis">
        <KpiCard label="Total events" value={kpis.total} tone="brand" icon={<Activity size={18} />} delta={{ direction: "up", label: "18% vs Apr 1 – Apr 30" }} trend={activitySeries.slice(20)} testId="kpi-total-events" />
        <KpiCard label="Failed logins" value={kpis.failedLogins} tone="danger" icon={<ShieldAlert size={18} />} delta={{ direction: "down", label: "33% vs Apr 1 – Apr 30" }} trend={[2, 3, 1, 2, 1, 0, 1]} testId="kpi-failed-logins" />
        <KpiCard label="AI actions" value={kpis.aiActions} tone="success" icon={<Sparkles size={18} />} delta={{ direction: "up", label: "28% vs Apr 1 – Apr 30" }} trend={[5, 8, 12, 15, 20, 22, 24]} testId="kpi-ai-actions" />
        <KpiCard label="Exports generated" value={kpis.exports} tone="violet" icon={<Download size={18} />} delta={{ direction: "up", label: "100% vs Apr 1 – Apr 30" }} trend={[0, 0, 0, 1, 1, 1, 1]} testId="kpi-exports" />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_300px]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>{filtered.length} events</CardTitle>
            </div>
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by ID, action, or payload…"
                className="h-9 w-72 rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                data-testid="audit-search"
              />
            </div>
          </CardHeader>
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm" data-testid="audit-table">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">Timestamp</th>
                    <th className="px-5 py-2.5 font-medium">User</th>
                    <th className="px-5 py-2.5 font-medium">Action</th>
                    <th className="px-5 py-2.5 font-medium">Entity</th>
                    <th className="px-5 py-2.5 font-medium">Entity ID</th>
                    <th className="px-5 py-2.5 font-medium">Payload</th>
                    <th className="px-5 py-2.5 font-medium">IP address</th>
                    <th className="px-5 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.isLoading ? (
                    <tr><td colSpan={8} className="px-5 py-10 text-center text-sm text-slate-500">Loading…</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={8} className="px-5 py-10 text-center text-sm text-slate-500">No events.</td></tr>
                  ) : (
                    filtered.slice(0, 30).map((l) => {
                      const isFailed = l.action.includes("failed");
                      return (
                        <tr key={l.id} className="transition hover:bg-slate-50" data-testid="audit-row">
                          <td className="px-5 py-3 font-mono text-xs text-slate-500">{new Date(l.timestamp).toLocaleString()}</td>
                          <td className="px-5 py-3 font-mono text-xs text-slate-700">{(l.user_id ?? "—").slice(0, 12)}…</td>
                          <td className="px-5 py-3">
                            <StatusBadge tone={isFailed ? "rejected" : "compliant"} withDot={!isFailed}>
                              {l.action}
                            </StatusBadge>
                          </td>
                          <td className="px-5 py-3 text-slate-700">{l.entity_type}</td>
                          <td className="px-5 py-3 font-mono text-[11px] text-slate-500">{l.entity_id?.slice(0, 16) ?? "—"}</td>
                          <td className="px-5 py-3 font-mono text-[11px] text-slate-500">
                            {l.payload_json ? Object.entries(l.payload_json).slice(0, 2).map(([k, v]) => `${k}: ${String(v).slice(0, 24)}`).join(", ") : "—"}
                          </td>
                          <td className="px-5 py-3 font-mono text-[11px] text-slate-500">{l.ip ?? "—"}</td>
                          <td className="px-5 py-3"><button className="rounded p-1 text-slate-500 hover:bg-slate-100"><MoreHorizontal size={14} /></button></td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 text-xs text-slate-500">
              <span>1–{Math.min(30, filtered.length)} of {filtered.length}</span>
            </div>
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Activity over time</CardTitle>
              <span className="text-[11px] text-slate-500">Last 30 days</span>
            </CardHeader>
            <CardBody>
              <p className="text-2xl font-semibold text-slate-900">{kpis.total}</p>
              <p className="text-xs text-slate-500">Total events</p>
              <Sparkline data={activitySeries} width={260} height={60} className="mt-3" color="#005EB8" />
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top actions</CardTitle>
            </CardHeader>
            <CardBody>
              {topActions.length === 0 ? (
                <p className="text-sm text-slate-500">No activity.</p>
              ) : (
                <div className="flex items-center gap-3">
                  <Donut
                    size={120}
                    thickness={14}
                    centerPrimary={topActionsTotal}
                    centerSecondary="Total"
                    segments={topActions.map((a, i) => ({ label: a.action, value: a.count || 0.01, color: ACTION_COLORS[i] }))}
                  />
                  <ul className="flex-1 space-y-1.5 text-xs">
                    {topActions.map((a, i) => (
                      <li key={a.action} className="flex items-center justify-between">
                        <span className="flex items-center gap-2 truncate text-slate-700">
                          <span className="h-2 w-2 rounded-full" style={{ background: ACTION_COLORS[i] }} />
                          <span className="truncate">{a.count} {a.action} ({Math.round((a.count / topActionsTotal) * 100)}%)</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top users by activity</CardTitle>
            </CardHeader>
            <CardBody>
              <ul className="space-y-2.5 text-sm">
                {topUsers.length === 0 ? (
                  <li className="text-slate-500">No activity.</li>
                ) : (
                  topUsers.map(([uid, n]) => (
                    <li key={uid} className="space-y-1" data-testid="top-user-row">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono text-slate-700">{uid.slice(0, 16)}…</span>
                        <span className="font-medium text-slate-900">{n}</span>
                      </div>
                      <ProgressBar value={n} total={Math.max(...topUsers.map(([, c]) => c))} color="#7C3AED" height={5} />
                    </li>
                  ))
                )}
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Data retention</CardTitle>
            </CardHeader>
            <CardBody>
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <AlertTriangle size={14} className="text-amber-600" /> Audit logs are retained for 12 months.
              </div>
              <a href="#" className="mt-2 inline-block text-xs font-medium text-brand hover:underline">Learn more about data retention ›</a>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  testId?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-500">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        data-testid={testId}
        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
      />
    </div>
  );
}
