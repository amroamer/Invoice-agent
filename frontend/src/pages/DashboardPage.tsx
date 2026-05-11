import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  DollarSign,
  FileText,
  ListChecks,
  XCircle,
} from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { listContracts } from "@/api/contracts";
import { listInvoices, type Invoice } from "@/api/invoices";
import { listVendors } from "@/api/vendors";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Donut } from "@/components/ui/Donut";
import { KpiCard } from "@/components/ui/KpiCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/cn";
import { money, moneyShort, shortDate } from "@/lib/format";

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
const SHORT_MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type StatusBucket = "pending" | "ready" | "attention" | "paid" | "rejected";

function bucketFor(inv: Invoice): StatusBucket {
  switch (inv.status) {
    case "pending":
      return "pending";
    case "reviewed":
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

export function DashboardPage() {
  const { me } = useAuth();
  const navigate = useNavigate();

  const invoices = useQuery({
    queryKey: ["invoices"],
    queryFn: () => listInvoices(),
    refetchInterval: 30_000,
  });
  const vendors = useQuery({ queryKey: ["vendors"], queryFn: listVendors });
  const contracts = useQuery({ queryKey: ["contracts"], queryFn: listContracts });

  const all = invoices.data ?? [];

  const counts = useMemo(() => {
    const c = { pending: 0, ready: 0, attention: 0, paid: 0, rejected: 0 } as Record<StatusBucket, number>;
    for (const inv of all) c[bucketFor(inv)]++;
    return c;
  }, [all]);

  const totalInvoicedMTD = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    return all
      .filter((i) => new Date(i.invoice_date).getTime() >= start && i.status !== "rejected")
      .reduce((sum, i) => sum + Number(i.total || 0), 0);
  }, [all]);

  const monthlyTrend = useMemo(() => {
    const now = new Date();
    const months: { label: string; key: string; total: number; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ label: SHORT_MONTH[d.getMonth()], key: monthKey(d), total: 0, count: 0 });
    }
    for (const inv of all) {
      const d = new Date(inv.invoice_date);
      const k = monthKey(d);
      const slot = months.find((m) => m.key === k);
      if (slot && inv.status !== "rejected") {
        slot.total += Number(inv.total || 0);
        slot.count++;
      }
    }
    return months;
  }, [all]);

  const topVendors = useMemo(() => {
    const map = new Map<string, number>();
    for (const inv of all) {
      if (!inv.vendor_id || inv.status === "rejected") continue;
      map.set(inv.vendor_id, (map.get(inv.vendor_id) || 0) + Number(inv.total || 0));
    }
    const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const max = sorted[0]?.[1] ?? 1;
    return sorted.map(([id, total]) => ({
      vendor: vendors.data?.find((v) => v.id === id)?.legal_name ?? "—",
      total,
      pct: (total / max) * 100,
    }));
  }, [all, vendors.data]);

  const priorities = useMemo(() => {
    const highPriority = all.filter((i) => i.status === "pending" || i.status === "reviewed").length;
    const mappingIssues = all.filter((i) => i.line_items.some((li) => li.not_in_boq)).length;
    const readyToPay = all.filter((i) => i.status === "decided").length;
    return { highPriority, mappingIssues, readyToPay };
  }, [all]);

  const riskCompliance = useMemo(() => {
    let blockers = 0;
    let warnings = 0;
    let advisory = 0;
    const seen = new Map<string, number>();
    for (const inv of all) {
      const key = inv.invoice_number;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    blockers = [...seen.values()].filter((n) => n > 1).length;
    const invoicedByContract = new Map<string, number>();
    for (const inv of all) {
      if (!inv.contract_id || inv.status === "rejected") continue;
      invoicedByContract.set(inv.contract_id, (invoicedByContract.get(inv.contract_id) ?? 0) + Number(inv.total || 0));
    }
    for (const c of contracts.data ?? []) {
      const utilization = (invoicedByContract.get(c.id) ?? 0) / Number(c.value || 1);
      if (utilization > 1) blockers++;
      else if (utilization > 0.85) warnings++;
    }
    if (priorities.mappingIssues > 0) advisory++;
    return { blockers, warnings, advisory, total: blockers + warnings + advisory };
  }, [all, contracts.data, priorities.mappingIssues]);

  const firstName = me?.full_name?.split(" ")[0] ?? me?.username ?? "there";

  const sample = [4, 5, 4, 6, 5, 8, counts.pending];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome to your finance cockpit`}
        description="Real-time visibility across the invoice lifecycle. Intelligent automation. Confident decisions."
        status={
          <div className="flex items-center gap-2">
            <StatusBadge tone="active">All systems operational</StatusBadge>
            <span className="text-xs text-slate-500">Last updated: 2 minutes ago</span>
          </div>
        }
        eyebrow={`Welcome back, ${firstName}`}
      />

      <div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5"
        data-testid="dashboard-kpis"
      >
        <KpiCard
          label="Pending review"
          value={counts.pending}
          tone="brand"
          icon={<Clock size={18} />}
          delta={{ direction: "down", label: "2 vs yesterday" }}
          trend={sample}
          onClick={() => navigate("/invoices?filter=Pending review")}
          testId="kpi-pending"
        />
        <KpiCard
          label="Awaiting payment"
          value={counts.ready}
          tone="violet"
          icon={<ListChecks size={18} />}
          delta={{ direction: "flat", label: "No change" }}
          trend={[2, 3, 2, 4, 3, 4, counts.ready]}
          onClick={() => navigate("/invoices?filter=Awaiting payment")}
          testId="kpi-awaiting"
        />
        <KpiCard
          label="Paid (this month)"
          value={counts.paid}
          tone="success"
          icon={<CheckCircle2 size={18} />}
          delta={{ direction: "flat", label: "No change" }}
          trend={[1, 2, 3, 4, 5, 6, counts.paid]}
          onClick={() => navigate("/invoices?filter=Paid")}
          testId="kpi-paid"
        />
        <KpiCard
          label="Rejected"
          value={counts.rejected}
          tone="danger"
          icon={<XCircle size={18} />}
          delta={{ direction: "flat", label: "No change" }}
          trend={[0, 1, 0, 1, 0, 0, counts.rejected]}
          onClick={() => navigate("/invoices?filter=Rejected")}
          testId="kpi-rejected"
        />
        <KpiCard
          label="Total invoiced (MTD)"
          value={moneyShort(totalInvoicedMTD)}
          tone="brand"
          icon={<DollarSign size={18} />}
          delta={{ direction: "up", label: "18% vs last month" }}
          trend={monthlyTrend.map((m) => m.total || 0)}
          testId="kpi-mtd"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Invoice queue (left + middle) */}
        <Card className="xl:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>Invoice queue</CardTitle>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                {all.length} total
              </span>
            </div>
            <button
              type="button"
              className="text-xs font-medium text-brand hover:underline"
              onClick={() => navigate("/invoices")}
              data-testid="view-all-invoices"
            >
              View all invoices →
            </button>
          </CardHeader>
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">Status</th>
                    <th className="px-5 py-2.5 font-medium">Invoice #</th>
                    <th className="px-5 py-2.5 font-medium">Vendor</th>
                    <th className="px-5 py-2.5 font-medium text-right">Amount</th>
                    <th className="px-5 py-2.5 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {all.slice(0, 8).map((inv) => {
                    const vendor = vendors.data?.find((v) => v.id === inv.vendor_id);
                    const bucket = bucketFor(inv);
                    const toneMap: Record<StatusBucket, "pending" | "ready" | "attention" | "paid" | "rejected"> = {
                      pending: "pending",
                      ready: "ready",
                      attention: "attention",
                      paid: "paid",
                      rejected: "rejected",
                    };
                    const labelMap: Record<StatusBucket, string> = {
                      pending: "Processing",
                      ready: "Ready to approve",
                      attention: "Needs attention",
                      paid: "Paid",
                      rejected: "Rejected",
                    };
                    return (
                      <tr key={inv.id} className="transition hover:bg-slate-50" data-testid="dashboard-invoice-row">
                        <td className="px-5 py-3">
                          <StatusBadge tone={toneMap[bucket]}>{labelMap[bucket]}</StatusBadge>
                        </td>
                        <td className="px-5 py-3 font-mono text-xs text-brand">
                          <button
                            type="button"
                            onClick={() => navigate(`/invoices/${inv.id}`)}
                            className="hover:underline"
                          >
                            {inv.invoice_number}
                          </button>
                        </td>
                        <td className="px-5 py-3 text-slate-700">{vendor?.legal_name ?? "—"}</td>
                        <td className="px-5 py-3 text-right font-medium text-slate-900">
                          {money(inv.total, true)}
                        </td>
                        <td className="px-5 py-3">
                          <button
                            type="button"
                            onClick={() => navigate(`/invoices/${inv.id}`)}
                            className="text-xs font-medium text-brand hover:underline"
                          >
                            {bucket === "ready" ? "Approve" : "Review"} →
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {all.length === 0 && (
                <div className="px-5 py-10 text-center text-sm text-slate-500">
                  No invoices yet. Upload one from the top right to get started.
                </div>
              )}
            </div>
          </CardBody>
        </Card>

        {/* Right column — Risk & today's priorities */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Risk &amp; compliance</CardTitle>
              <button
                type="button"
                className="text-xs font-medium text-brand hover:underline"
                onClick={() => navigate("/audit")}
              >
                View all
              </button>
            </CardHeader>
            <CardBody className="flex items-center gap-5">
              <Donut
                size={130}
                thickness={14}
                segments={[
                  { label: "Blockers", value: riskCompliance.blockers || 0.01, color: "#EF4444" },
                  { label: "Warnings", value: riskCompliance.warnings || 0.01, color: "#F59E0B" },
                  { label: "Advisory", value: riskCompliance.advisory || 0.01, color: "#0091DA" },
                ]}
                centerPrimary={riskCompliance.total}
                centerSecondary="Issues"
              />
              <ul className="flex-1 space-y-2.5 text-sm">
                <RiskRow
                  color="#EF4444"
                  count={riskCompliance.blockers}
                  label="Blockers"
                  hint="Require immediate action"
                />
                <RiskRow
                  color="#F59E0B"
                  count={riskCompliance.warnings}
                  label="Warnings"
                  hint="Needs your attention"
                />
                <RiskRow
                  color="#0091DA"
                  count={riskCompliance.advisory}
                  label="Advisory"
                  hint="Recommended review"
                />
              </ul>
            </CardBody>
            {riskCompliance.blockers > 0 && (
              <div className="m-5 mt-0 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                <span className="font-medium">
                  {riskCompliance.blockers} invoice{riskCompliance.blockers === 1 ? "" : "s"} blocking payment.
                </span>{" "}
                Potential contract breach or duplicate billing.
              </div>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Today&apos;s priorities</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              <PriorityRow
                icon={<AlertTriangle size={16} className="text-amber-700" />}
                title={`Review ${priorities.highPriority} high-priority invoices`}
                description="Require attention"
                count={priorities.highPriority}
                onClick={() => navigate("/invoices?filter=Pending review")}
              />
              <PriorityRow
                icon={<FileText size={16} className="text-amber-700" />}
                title={`Resolve ${priorities.mappingIssues} mapping issues`}
                description="BoQ lines not mapped"
                count={priorities.mappingIssues}
                onClick={() => navigate("/invoices?filter=Needs attention")}
              />
              <PriorityRow
                icon={<CheckCircle2 size={16} className="text-emerald-700" />}
                title={`Complete ${priorities.readyToPay} payments`}
                description="Ready to process"
                count={priorities.readyToPay}
                onClick={() => navigate("/invoices?filter=Awaiting payment")}
              />
            </CardBody>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Invoice volume trend */}
        <Card>
          <CardHeader>
            <CardTitle>Invoice volume trend</CardTitle>
            <span className="text-xs text-slate-500">Last 6 months (SAR)</span>
          </CardHeader>
          <CardBody>
            <VolumeBarChart data={monthlyTrend} />
          </CardBody>
        </Card>

        {/* Top vendors */}
        <Card>
          <CardHeader>
            <CardTitle>Top vendors by spend</CardTitle>
            <button
              type="button"
              className="text-xs font-medium text-brand hover:underline"
              onClick={() => navigate("/vendors")}
            >
              View vendor performance →
            </button>
          </CardHeader>
          <CardBody>
            <ul className="space-y-3">
              {topVendors.length === 0 ? (
                <li className="text-sm text-slate-500">No vendor spend yet.</li>
              ) : (
                topVendors.map((v, i) => (
                  <li key={i} className="space-y-1.5" data-testid="top-vendor-row">
                    <div className="flex items-center justify-between text-sm">
                      <span className="truncate text-slate-700">{v.vendor}</span>
                      <span className="font-medium text-slate-900">{money(v.total)}</span>
                    </div>
                    <ProgressBar value={v.pct} color="#005EB8" height={6} />
                  </li>
                ))
              )}
            </ul>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function RiskRow({
  color,
  count,
  label,
  hint,
}: {
  color: string;
  count: number;
  label: string;
  hint: string;
}) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-1.5 h-2 w-2 rounded-full" style={{ background: color }} />
      <div className="flex-1">
        <p className="text-sm">
          <span className="font-semibold text-slate-900">{count}</span>{" "}
          <span className="text-slate-700">{label}</span>
        </p>
        <p className="text-xs text-slate-500">{hint}</p>
      </div>
    </li>
  );
}

function PriorityRow({
  icon,
  title,
  description,
  count,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5 text-left transition hover:border-brand/30 hover:bg-brand-50/40"
      data-testid="priority-row"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-amber-50">{icon}</span>
        <div>
          <p className="text-sm font-medium text-slate-900">{title}</p>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
      </div>
      <span className="text-xs font-semibold text-slate-700">{count} →</span>
    </button>
  );
}

function VolumeBarChart({ data }: { data: { label: string; total: number; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.total));
  return (
    <div className="space-y-2">
      <div className="flex h-44 items-end gap-3" data-testid="volume-chart">
        {data.map((d) => {
          const h = (d.total / max) * 100;
          return (
            <div key={d.label} className="flex flex-1 flex-col items-center gap-2">
              <div className="flex w-full flex-1 items-end">
                <div
                  className={cn(
                    "w-full rounded-t-md transition",
                    h > 0 ? "bg-brand-medium" : "bg-slate-100",
                  )}
                  style={{ height: `${Math.max(h, 4)}%` }}
                  title={`${d.label}: ${money(d.total)}`}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-3 text-center text-xs text-slate-500">
        {data.map((d) => (
          <div key={d.label} className="flex-1">
            {d.label}
          </div>
        ))}
      </div>
      <p className="pt-1 text-xs text-slate-500">
        Showing total invoiced (excl. rejected) · MTD {shortDate(new Date().toISOString())}
      </p>
    </div>
  );
}
