import { useQuery } from "@tanstack/react-query";
import { AlertOctagon, AlertTriangle, ArrowDown, CalendarClock, FileText, Plus, Search, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { listContracts, type Contract } from "@/api/contracts";
import { listInvoices, type Invoice } from "@/api/invoices";
import { listProjects } from "@/api/projects";
import { listVendors } from "@/api/vendors";
import { Card, CardBody } from "@/components/ui/Card";
import { KpiCard } from "@/components/ui/KpiCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { useAuth } from "@/hooks/useAuth";
import { money, shortDate } from "@/lib/format";

type Enriched = Contract & {
  invoicedToDate: number;
  utilization: number;
  risk: "low" | "medium" | "high";
  expiringSoon: boolean;
  daysToEnd: number;
};

function enrich(contracts: Contract[], invoices: Invoice[]): Enriched[] {
  const now = Date.now();
  return contracts.map((c) => {
    const invoicedToDate = invoices
      .filter((i) => i.contract_id === c.id && i.status !== "rejected")
      .reduce((s, i) => s + Number(i.total || 0), 0);
    const utilization = Number(c.value) > 0 ? invoicedToDate / Number(c.value) : 0;
    const daysToEnd = Math.round((new Date(c.end_date).getTime() - now) / 86_400_000);
    const expiringSoon = daysToEnd <= 90 && daysToEnd >= 0;
    const risk = utilization > 1 || daysToEnd < 0 ? "high" : utilization > 0.85 || expiringSoon ? "medium" : "low";
    return { ...c, invoicedToDate, utilization, risk, expiringSoon, daysToEnd };
  });
}

function statusTone(s: string): StatusTone {
  if (s === "active") return "active";
  if (s === "on_hold") return "review";
  return "neutral";
}

export function ContractsPage() {
  const { me } = useAuth();
  const isAdmin = me?.role === "admin";
  const contracts = useQuery({ queryKey: ["contracts"], queryFn: listContracts });
  const projects = useQuery({ queryKey: ["projects"], queryFn: listProjects });
  const vendors = useQuery({ queryKey: ["vendors"], queryFn: listVendors });
  const invoices = useQuery({ queryKey: ["invoices"], queryFn: () => listInvoices() });

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [vendorFilter, setVendorFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");

  const projectName = (id: string) => projects.data?.find((p) => p.id === id)?.name ?? id;
  const vendorName = (id: string) => vendors.data?.find((v) => v.id === id)?.legal_name ?? id;

  const enriched = useMemo(
    () => enrich(contracts.data ?? [], invoices.data ?? []),
    [contracts.data, invoices.data],
  );

  const filtered = useMemo(
    () =>
      enriched.filter((c) => {
        if (statusFilter && c.status !== statusFilter) return false;
        if (vendorFilter && c.vendor_id !== vendorFilter) return false;
        if (projectFilter && c.project_id !== projectFilter) return false;
        if (q) {
          const hay = `${c.contract_number} ${projectName(c.project_id)} ${vendorName(c.vendor_id)}`.toLowerCase();
          if (!hay.includes(q.toLowerCase())) return false;
        }
        return true;
      }),
    [enriched, statusFilter, vendorFilter, projectFilter, q, projects.data, vendors.data],
  );

  const kpis = useMemo(() => {
    const active = enriched.filter((c) => c.status === "active");
    const totalValue = active.reduce((s, c) => s + Number(c.value || 0), 0);
    const expiringSoon = active.filter((c) => c.expiringSoon).length;
    const atRisk = active.filter((c) => c.risk === "high").length;
    return { active: active.length, totalValue, expiringSoon, atRisk };
  }, [enriched]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contract Portfolio"
        description="Centralized visibility of all contracts across projects and vendors. Track performance, value, and risk."
        status={
          <div className="flex items-center gap-2">
            <StatusBadge tone="active">All systems operational</StatusBadge>
            <span className="text-xs text-slate-500">Last updated: 2 minutes ago</span>
          </div>
        }
        actions={
          isAdmin && (
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-medium px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand"
              data-testid="new-contract-btn"
            >
              <Plus size={16} /> New contract
            </button>
          )
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="contracts-kpis">
        <KpiCard label="Active contracts" value={kpis.active} tone="brand" icon={<FileText size={18} />} description={`${kpis.active === enriched.length ? "100%" : `${Math.round((kpis.active / Math.max(1, enriched.length)) * 100)}%`} of total`} testId="kpi-active" />
        <KpiCard label="Total contract value (SAR)" value={`SAR ${(kpis.totalValue / 1_000_000).toFixed(2)}M`} tone="violet" icon={<TrendingUp size={18} />} description={`Across ${kpis.active} active contracts`} testId="kpi-total-value" />
        <KpiCard label="Expiring soon (≤ 90 days)" value={kpis.expiringSoon} tone="warning" icon={<CalendarClock size={18} />} description={`${Math.round((kpis.expiringSoon / Math.max(1, enriched.length)) * 100)}% of total`} testId="kpi-expiring" />
        <KpiCard label="At-risk contracts" value={kpis.atRisk} tone="danger" icon={<AlertOctagon size={18} />} description={`${Math.round((kpis.atRisk / Math.max(1, enriched.length)) * 100)}% of total`} testId="kpi-at-risk" />
      </div>

      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="relative min-w-[260px] flex-1">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search contracts by number, project, or vendor…"
                className="h-10 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                data-testid="contracts-search"
              />
            </div>
            <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={[
              { value: "", label: "All status" },
              { value: "active", label: "Active" },
              { value: "on_hold", label: "On hold" },
              { value: "closed", label: "Closed" },
            ]} />
            <FilterSelect label="Vendor" value={vendorFilter} onChange={setVendorFilter} options={[
              { value: "", label: "All vendors" },
              ...(vendors.data ?? []).map((v) => ({ value: v.id, label: v.legal_name })),
            ]} />
            <FilterSelect label="Project" value={projectFilter} onChange={setProjectFilter} options={[
              { value: "", label: "All projects" },
              ...(projects.data ?? []).map((p) => ({ value: p.id, label: p.name })),
            ]} />
            <button className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <AlertTriangle size={14} /> More filters
            </button>
            <button className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <ArrowDown size={14} />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm" data-testid="contracts-table">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Contract #</th>
                  <th className="px-5 py-2.5 font-medium">Project</th>
                  <th className="px-5 py-2.5 font-medium">Vendor</th>
                  <th className="px-5 py-2.5 font-medium text-right">Contract value (SAR)</th>
                  <th className="px-5 py-2.5 font-medium">Utilization</th>
                  <th className="px-5 py-2.5 font-medium">Start</th>
                  <th className="px-5 py-2.5 font-medium">End</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 font-medium">Risk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {contracts.isLoading ? (
                  <tr><td colSpan={9} className="px-5 py-10 text-center text-sm text-slate-500">Loading…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={9} className="px-5 py-10 text-center text-sm text-slate-500">No contracts match.</td></tr>
                ) : (
                  filtered.map((c) => {
                    const pct = Math.round(c.utilization * 100);
                    return (
                      <tr key={c.id} className="transition hover:bg-slate-50" data-testid="contract-row">
                        <td className="px-5 py-3">
                          <Link to={`/contracts/${c.id}`} className="font-mono text-xs text-brand hover:underline">
                            {c.contract_number}
                          </Link>
                        </td>
                        <td className="px-5 py-3 text-slate-700">{projectName(c.project_id)}</td>
                        <td className="px-5 py-3 text-slate-700">{vendorName(c.vendor_id)}</td>
                        <td className="px-5 py-3 text-right font-medium text-slate-900">{money(c.value, true)}</td>
                        <td className="px-5 py-3">
                          <div className="space-y-1 min-w-[140px]">
                            <ProgressBar value={Math.min(pct, 100)} color={pct > 100 ? "#EF4444" : pct > 85 ? "#F59E0B" : "#005EB8"} />
                            <span className="text-[11px] text-slate-500">{pct}%</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-xs text-slate-500">{shortDate(c.start_date)}</td>
                        <td className="px-5 py-3 text-xs text-slate-500">{shortDate(c.end_date)}</td>
                        <td className="px-5 py-3">
                          <StatusBadge tone={statusTone(c.status)} withDot={c.status === "active"}>
                            {c.status === "on_hold" ? "On hold" : c.status[0].toUpperCase() + c.status.slice(1)}
                          </StatusBadge>
                        </td>
                        <td className="px-5 py-3">
                          <StatusBadge tone={c.risk === "high" ? "highrisk" : c.risk === "medium" ? "mediumrisk" : "lowrisk"} withDot={false}>
                            {c.risk === "high" ? "High" : c.risk === "medium" ? "Medium" : "Low"}
                          </StatusBadge>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Showing 1–{filtered.length} of {filtered.length} contracts</span>
          </div>
        </CardBody>
      </Card>
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
