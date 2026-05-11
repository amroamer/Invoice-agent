import { useQuery } from "@tanstack/react-query";
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  FileText,
  Filter,
  Search,
  Sparkles,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { listContracts } from "@/api/contracts";
import { listInvoices, type Invoice } from "@/api/invoices";
import { listProjects } from "@/api/projects";
import { listVendors } from "@/api/vendors";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Donut } from "@/components/ui/Donut";
import { KpiCard } from "@/components/ui/KpiCard";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/cn";
import { money, shortDate } from "@/lib/format";

type Bucket = "pending" | "ready" | "attention" | "paid" | "rejected" | "all";

const BUCKETS: Array<{ key: Bucket; label: string }> = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending review" },
  { key: "ready", label: "Ready to approve" },
  { key: "attention", label: "Needs attention" },
  { key: "paid", label: "Paid" },
  { key: "rejected", label: "Rejected" },
];

function bucketOf(inv: Invoice): Exclude<Bucket, "all"> {
  switch (inv.status) {
    case "pending":
      return "pending";
    case "reviewed":
      return "ready";
    case "decided":
      return "ready";
    case "paid":
    case "partially_paid":
      return "paid";
    case "rejected":
      return "rejected";
    default:
      return "attention";
  }
}

function confidenceFor(inv: Invoice): { label: "High" | "Medium" | "Low"; pct: number } {
  // Heuristic until extractions/recommendations expose explicit confidence on the list view.
  const mapped = inv.line_items.filter((li) => !li.not_in_boq).length;
  const total = inv.line_items.length || 1;
  const pct = Math.round((mapped / total) * 100);
  if (pct >= 80) return { label: "High", pct };
  if (pct >= 50) return { label: "Medium", pct };
  return { label: "Low", pct };
}

export function InvoicesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();

  const filterLabel = search.get("filter") ?? "All";
  const projectId = search.get("project_id") ?? "";
  const vendorId = search.get("vendor_id") ?? "";
  const contractId = search.get("contract_id") ?? "";
  const dateFrom = search.get("date_from") ?? "";
  const dateTo = search.get("date_to") ?? "";
  const q = search.get("q") ?? "";

  function setParam(k: string, v: string) {
    const next = new URLSearchParams(search);
    if (v) next.set(k, v);
    else next.delete(k);
    setSearch(next, { replace: true });
  }

  const invoices = useQuery({
    queryKey: ["invoices", projectId, vendorId, contractId, dateFrom, dateTo, q],
    queryFn: () =>
      listInvoices({
        project_id: projectId || undefined,
        vendor_id: vendorId || undefined,
        contract_id: contractId || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        q: q || undefined,
      }),
    refetchInterval: 20_000,
  });
  const projects = useQuery({ queryKey: ["projects"], queryFn: listProjects });
  const vendors = useQuery({ queryKey: ["vendors"], queryFn: listVendors });
  const contracts = useQuery({ queryKey: ["contracts"], queryFn: listContracts });

  const all = invoices.data ?? [];

  const counts = useMemo(() => {
    const c: Record<Exclude<Bucket, "all">, number> = {
      pending: 0,
      ready: 0,
      attention: 0,
      paid: 0,
      rejected: 0,
    };
    for (const inv of all) c[bucketOf(inv)]++;
    return c;
  }, [all]);

  const totalCount = all.length || 1;

  const activeFilter = useMemo(
    () => BUCKETS.find((b) => b.label === filterLabel) ?? BUCKETS[0],
    [filterLabel],
  );

  const rows = useMemo(
    () =>
      all.filter((inv) => (activeFilter.key === "all" ? true : bucketOf(inv) === activeFilter.key)),
    [all, activeFilter.key],
  );

  const insights = useMemo(() => {
    const map = new Map<string, number>();
    for (const inv of all) {
      map.set(inv.invoice_number, (map.get(inv.invoice_number) ?? 0) + 1);
    }
    const exactDuplicates = [...map.entries()].filter(([, n]) => n > 1);
    const invoicedByContract = new Map<string, number>();
    for (const inv of all) {
      if (!inv.contract_id || inv.status === "rejected") continue;
      invoicedByContract.set(inv.contract_id, (invoicedByContract.get(inv.contract_id) ?? 0) + Number(inv.total || 0));
    }
    const breach = (contracts.data ?? []).filter(
      (c) => (invoicedByContract.get(c.id) ?? 0) > Number(c.value ?? 0),
    );
    const olderThan7d = all.filter((inv) => {
      const days = (Date.now() - new Date(inv.created_at).getTime()) / 86_400_000;
      return inv.status === "pending" && days > 7;
    });
    const mappingIssues = all.filter((inv) => inv.line_items.some((li) => li.not_in_boq));
    return { exactDuplicates, breach, olderThan7d, mappingIssues };
  }, [all, contracts.data]);

  // ── keyboard nav (J/K/Enter) ────────────────────────────────────────────
  const [focusIdx, setFocusIdx] = useState(0);
  useEffect(() => setFocusIdx((i) => Math.min(i, Math.max(0, rows.length - 1))), [rows.length]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        setFocusIdx((i) => Math.min(i + 1, rows.length - 1));
        e.preventDefault();
      } else if (e.key === "k" || e.key === "ArrowUp") {
        setFocusIdx((i) => Math.max(i - 1, 0));
        e.preventDefault();
      } else if (e.key === "Enter") {
        const r = rows[focusIdx];
        if (r) navigate(`/invoices/${r.id}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, focusIdx, navigate]);

  const openRow = useCallback((id: string) => navigate(`/invoices/${id}`), [navigate]);

  // Date range label
  const today = new Date();
  const start = new Date();
  start.setDate(today.getDate() - 7);
  const dateLabel = `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${today.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${today.getFullYear()}`;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        {/* Page title */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm text-slate-500">Welcome back</p>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Invoice Operations</h1>
            <p className="mt-1 text-sm text-slate-600">
              Real-time overview of invoice processing, approvals, and compliance.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700">
            {dateLabel}
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5" data-testid="invoices-kpis">
          <KpiCard
            label="Pending review"
            value={counts.pending}
            tone="brand"
            icon={<FileText size={18} />}
            delta={{ direction: counts.pending > 0 ? "up" : "flat", label: `${Math.max(2, counts.pending)} vs last 7 days` }}
            onClick={() => setParam("filter", filterLabel === "Pending review" ? "" : "Pending review")}
            active={filterLabel === "Pending review"}
            testId="kpi-pending-review"
          />
          <KpiCard
            label="Ready to approve"
            value={counts.ready}
            tone="success"
            icon={<CheckCircle2 size={18} />}
            delta={{ direction: counts.ready > 0 ? "up" : "flat", label: `${counts.ready} vs last 7 days` }}
            onClick={() => setParam("filter", filterLabel === "Ready to approve" ? "" : "Ready to approve")}
            active={filterLabel === "Ready to approve"}
            testId="kpi-ready"
          />
          <KpiCard
            label="Needs attention"
            value={counts.attention}
            tone="warning"
            icon={<AlertTriangle size={18} />}
            delta={{ direction: counts.attention > 0 ? "up" : "flat", label: `${counts.attention} vs last 7 days` }}
            onClick={() => setParam("filter", filterLabel === "Needs attention" ? "" : "Needs attention")}
            active={filterLabel === "Needs attention"}
            testId="kpi-attention"
          />
          <KpiCard
            label="Paid"
            value={counts.paid}
            tone="success"
            icon={<DollarSign size={18} />}
            delta={{ direction: counts.paid > 0 ? "up" : "flat", label: `${counts.paid} vs last 7 days` }}
            onClick={() => setParam("filter", filterLabel === "Paid" ? "" : "Paid")}
            active={filterLabel === "Paid"}
            testId="kpi-paid"
          />
          <KpiCard
            label="Rejected"
            value={counts.rejected}
            tone="danger"
            icon={<XCircle size={18} />}
            delta={{ direction: "flat", label: "vs last 7 days" }}
            onClick={() => setParam("filter", filterLabel === "Rejected" ? "" : "Rejected")}
            active={filterLabel === "Rejected"}
            testId="kpi-rejected"
          />
        </div>

        {/* Search + filters */}
        <Card>
          <CardBody className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={q}
                  onChange={(e) => setParam("q", e.target.value)}
                  placeholder="Search invoices by number, vendor, contract…"
                  className="h-10 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                  data-testid="invoices-search"
                />
              </div>
              <button
                type="button"
                className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Filter size={14} />
                Filters
              </button>
              <button
                type="button"
                className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <CheckCircle2 size={14} />
                Save view
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
              <FilterSelect
                label="Status"
                value={filterLabel}
                onChange={(v) => setParam("filter", v === "All" ? "" : v)}
                options={BUCKETS.map((b) => b.label)}
              />
              <FilterSelect
                label="Project"
                value={projectId}
                onChange={(v) => {
                  setParam("project_id", v);
                  setParam("contract_id", "");
                }}
                options={[{ value: "", label: "All projects" }, ...(projects.data ?? []).map((p) => ({ value: p.id, label: p.name }))]}
              />
              <FilterSelect
                label="Contract"
                value={contractId}
                onChange={(v) => setParam("contract_id", v)}
                options={[
                  { value: "", label: "All contracts" },
                  ...((contracts.data ?? [])
                    .filter((c) => !projectId || c.project_id === projectId)
                    .map((c) => ({ value: c.id, label: c.contract_number }))),
                ]}
              />
              <FilterSelect
                label="Vendor"
                value={vendorId}
                onChange={(v) => setParam("vendor_id", v)}
                options={[
                  { value: "", label: "All vendors" },
                  ...(vendors.data ?? []).map((v) => ({ value: v.id, label: v.legal_name })),
                ]}
              />
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-500">
                  Received date
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setParam("date_from", e.target.value)}
                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                    aria-label="From date"
                  />
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setParam("date_to", e.target.value)}
                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                    aria-label="To date"
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => {
                  for (const k of ["filter", "project_id", "contract_id", "vendor_id", "date_from", "date_to", "q"]) setParam(k, "");
                }}
                className="text-xs font-medium text-brand hover:underline"
                data-testid="reset-filters"
              >
                Reset
              </button>
            </div>
          </CardBody>
        </Card>

        {/* Invoice queue */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Invoice queue ({rows.length})</CardTitle>
              <p className="text-xs text-slate-500">Most recent invoices requiring action</p>
            </div>
            <span className="text-xs text-slate-500">
              Sort by: Received date
            </span>
          </CardHeader>
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">Status</th>
                    <th className="px-5 py-2.5 font-medium">Invoice #</th>
                    <th className="px-5 py-2.5 font-medium">Vendor</th>
                    <th className="px-5 py-2.5 font-medium">Contract</th>
                    <th className="px-5 py-2.5 font-medium text-right">Amount (SAR)</th>
                    <th className="px-5 py-2.5 font-medium">Received</th>
                    <th className="px-5 py-2.5 font-medium">AI confidence</th>
                    <th className="px-5 py-2.5 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoices.isLoading ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-10 text-center text-sm text-slate-500">
                        Loading…
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-10 text-center text-sm text-slate-500">
                        No invoices match the current filters.
                      </td>
                    </tr>
                  ) : (
                    rows.map((inv, idx) => {
                      const vendor = vendors.data?.find((v) => v.id === inv.vendor_id);
                      const contract = contracts.data?.find((c) => c.id === inv.contract_id);
                      const bucket = bucketOf(inv);
                      const labelMap: Record<Exclude<Bucket, "all">, string> = {
                        pending: "Processing",
                        ready: "Ready to approve",
                        attention: "Needs attention",
                        paid: "Paid",
                        rejected: "Rejected",
                      };
                      const toneMap: Record<Exclude<Bucket, "all">, StatusTone> = {
                        pending: "processing",
                        ready: "ready",
                        attention: "attention",
                        paid: "paid",
                        rejected: "rejected",
                      };
                      const conf = confidenceFor(inv);
                      return (
                        <tr
                          key={inv.id}
                          className={cn(
                            "cursor-pointer transition",
                            idx === focusIdx ? "bg-brand-50/30" : "hover:bg-slate-50",
                          )}
                          onClick={() => openRow(inv.id)}
                          onMouseEnter={() => setFocusIdx(idx)}
                          data-testid="invoice-row"
                        >
                          <td className="px-5 py-3">
                            <StatusBadge tone={toneMap[bucket]}>{labelMap[bucket]}</StatusBadge>
                          </td>
                          <td className="px-5 py-3 font-mono text-xs text-brand">{inv.invoice_number}</td>
                          <td className="px-5 py-3 text-slate-700">{vendor?.legal_name ?? "—"}</td>
                          <td className="px-5 py-3 font-mono text-xs text-brand">{contract?.contract_number ?? "—"}</td>
                          <td className="px-5 py-3 text-right font-medium text-slate-900">{money(inv.total, true)}</td>
                          <td className="px-5 py-3 text-xs text-slate-500">{shortDate(inv.invoice_date)}</td>
                          <td className="px-5 py-3">
                            <ConfidenceBar level={conf.label} />
                          </td>
                          <td className="px-5 py-3">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openRow(inv.id);
                              }}
                              className="text-xs font-medium text-brand hover:underline"
                              data-testid="invoice-action"
                            >
                              {bucket === "ready" ? "Review" : bucket === "paid" || bucket === "rejected" ? "View" : "Review"} →
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 text-xs text-slate-500">
              <span>
                Showing {rows.length === 0 ? 0 : 1} to {rows.length} of {rows.length} invoices
              </span>
              <div className="flex gap-1">
                <button className="rounded border border-slate-200 px-2 py-0.5 hover:bg-slate-50" aria-label="Previous">‹</button>
                <button className="rounded bg-brand-medium px-2 py-0.5 text-white">1</button>
                <button className="rounded border border-slate-200 px-2 py-0.5 hover:bg-slate-50" aria-label="Next">›</button>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* AI Assistant rail */}
      <aside className="space-y-5" data-testid="ai-assistant-rail">
        <Card>
          <CardBody>
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-50 text-brand">
                <Sparkles size={14} />
              </span>
              <p className="text-sm font-semibold text-slate-900">AI Assistant</p>
            </div>
            <p className="mb-3 text-sm font-medium text-slate-900">Triage summary</p>
            <p className="text-[11px] text-slate-500">Last updated 2 min ago</p>
            <div className="mt-4 flex items-center gap-4">
              <Donut
                size={120}
                thickness={14}
                centerPrimary={totalCount}
                centerSecondary="Total invoices"
                segments={[
                  { label: "Pending", value: counts.pending || 0.01, color: "#3B82F6" },
                  { label: "Ready", value: counts.ready || 0.01, color: "#10B981" },
                  { label: "Attention", value: counts.attention || 0.01, color: "#F59E0B" },
                  { label: "Paid", value: counts.paid || 0.01, color: "#0EA5A4" },
                  { label: "Rejected", value: counts.rejected || 0.01, color: "#EF4444" },
                ]}
              />
              <ul className="flex-1 space-y-1.5 text-xs">
                <LegendRow color="#3B82F6" label="Pending review" value={counts.pending} />
                <LegendRow color="#10B981" label="Ready to approve" value={counts.ready} />
                <LegendRow color="#F59E0B" label="Needs attention" value={counts.attention} />
                <LegendRow color="#0EA5A4" label="Paid" value={counts.paid} />
                <LegendRow color="#EF4444" label="Rejected" value={counts.rejected} />
              </ul>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div className="mb-3 flex items-center gap-2">
              <p className="text-sm font-semibold text-slate-900">Top risk signals</p>
              <span className="rounded-full bg-amber-50 px-1.5 text-[10px] font-semibold text-amber-800">
                {insights.exactDuplicates.length + insights.breach.length + insights.olderThan7d.length + insights.mappingIssues.length}
              </span>
            </div>
            <ul className="space-y-2">
              {insights.exactDuplicates.slice(0, 1).map(([num, n]) => (
                <RiskSignal
                  key={num}
                  iconBg="bg-red-50"
                  iconFg="text-red-700"
                  icon={<AlertOctagon size={14} />}
                  title={`${n - 1} exact duplicate detected`}
                  subtitle={num}
                />
              ))}
              {insights.breach.slice(0, 1).map((c) => (
                <RiskSignal
                  key={c.id}
                  iconBg="bg-amber-50"
                  iconFg="text-amber-700"
                  icon={<AlertTriangle size={14} />}
                  title="1 contract value breach"
                  subtitle={`${money(c.value)} exceeds limit`}
                />
              ))}
              {insights.mappingIssues.length > 0 && (
                <RiskSignal
                  iconBg="bg-amber-50"
                  iconFg="text-amber-700"
                  icon={<AlertTriangle size={14} />}
                  title={`${insights.mappingIssues.length} BoQ lines need mapping`}
                  subtitle="Manual review recommended"
                />
              )}
              {insights.olderThan7d.length > 0 && (
                <RiskSignal
                  iconBg="bg-slate-100"
                  iconFg="text-slate-700"
                  icon={<AlertTriangle size={14} />}
                  title={`${insights.olderThan7d.length} older invoices pending approval`}
                  subtitle="At risk of payment delay"
                />
              )}
              {insights.exactDuplicates.length === 0 &&
                insights.breach.length === 0 &&
                insights.mappingIssues.length === 0 &&
                insights.olderThan7d.length === 0 && (
                  <li className="text-xs text-slate-500">No risk signals detected.</li>
                )}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <p className="mb-3 text-sm font-semibold text-slate-900">Recommended next actions</p>
            <ul className="space-y-2 text-sm">
              <ActionRow icon={<CheckCircle2 size={14} className="text-emerald-700" />} label={`Review ${counts.pending} invoices ready for approval`} onClick={() => setParam("filter", "Pending review")} />
              <ActionRow icon={<AlertTriangle size={14} className="text-amber-700" />} label={`Resolve ${counts.attention} items needing attention`} onClick={() => setParam("filter", "Needs attention")} />
              <ActionRow icon={<DollarSign size={14} className="text-brand" />} label="Approve high-confidence invoices" onClick={() => setParam("filter", "Ready to approve")} />
            </ul>
            <button
              type="button"
              className="mt-4 w-full rounded-lg border border-brand/20 bg-brand-50/40 px-3 py-2 text-sm font-medium text-brand hover:bg-brand-50"
            >
              View AI insights ↗
            </button>
          </CardBody>
        </Card>
      </aside>
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
  options: Array<string | { value: string; label: string }>;
}) {
  const opts = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-500">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
      >
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ConfidenceBar({ level }: { level: "High" | "Medium" | "Low" }) {
  const color = level === "High" ? "#10B981" : level === "Medium" ? "#F59E0B" : "#EF4444";
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-700">{level}</span>
      <ProgressBar
        height={6}
        segments={[
          { value: level === "Low" ? 1 : level === "Medium" ? 2 : 3, color },
          { value: 3 - (level === "Low" ? 1 : level === "Medium" ? 2 : 3), color: "#E2E8F0" },
        ]}
        className="w-16"
      />
    </div>
  );
}

function LegendRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <li className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-slate-700">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        {label}
      </span>
      <span className="font-medium text-slate-900">{value}</span>
    </li>
  );
}

function RiskSignal({
  icon,
  iconBg,
  iconFg,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconFg: string;
  title: string;
  subtitle: string;
}) {
  return (
    <li className="flex items-start gap-2 rounded-lg border border-slate-200 px-2.5 py-2" data-testid="risk-signal">
      <span className={cn("flex h-6 w-6 items-center justify-center rounded-md", iconBg, iconFg)}>{icon}</span>
      <div className="flex-1">
        <p className="text-xs font-medium text-slate-900">{title}</p>
        <p className="font-mono text-[10px] text-slate-500">{subtitle}</p>
      </div>
      <span className="text-slate-300">›</span>
    </li>
  );
}

function ActionRow({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left hover:bg-slate-50"
      >
        <span className="flex items-center gap-2 text-slate-800">{icon} {label}</span>
        <span className="text-slate-400">›</span>
      </button>
    </li>
  );
}
