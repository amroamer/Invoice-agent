import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Briefcase,
  FileText,
  Plus,
  PieChart,
  Search,
  TrendingDown,
} from "lucide-react";
import { useMemo, useState } from "react";

import { listContracts } from "@/api/contracts";
import { createProject, listProjects, type ProjectInput } from "@/api/projects";
import { Card, CardBody } from "@/components/ui/Card";
import { Donut } from "@/components/ui/Donut";
import { KpiCard } from "@/components/ui/KpiCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { useAuth } from "@/hooks/useAuth";
import { money } from "@/lib/format";

const blankForm: ProjectInput = {
  name: "",
  client_entity: "",
  description: "",
  start_date: null,
  end_date: null,
  status: "active",
};

function statusTone(s: string): StatusTone {
  if (s === "active") return "active";
  if (s === "on_hold") return "review";
  if (s === "closed") return "neutral";
  return "neutral";
}

export function ProjectsPage() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const isAdmin = me?.role === "admin";

  const projects = useQuery({ queryKey: ["projects"], queryFn: listProjects });
  const contracts = useQuery({ queryKey: ["contracts"], queryFn: listContracts });

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<ProjectInput>(blankForm);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [clientFilter, setClientFilter] = useState("");

  const mutate = useMutation({
    mutationFn: createProject,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      setForm(blankForm);
      setShowCreate(false);
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const data = projects.data ?? [];

  const filtered = useMemo(() => {
    return data.filter((p) => {
      if (statusFilter && p.status !== statusFilter) return false;
      if (clientFilter && p.client_entity !== clientFilter) return false;
      if (q) {
        const hay = `${p.name} ${p.client_entity}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [data, q, statusFilter, clientFilter]);

  const kpis = useMemo(() => {
    const active = data.filter((p) => p.status === "active");
    const totalInvoicedMTD = active.reduce((s, p) => s + Number(p.invoiced_to_date || 0), 0);
    const remaining = active.reduce((s, p) => s + Number(p.remaining || 0), 0);
    const atRisk = active.filter((p) => {
      const tcv = Number(p.total_contract_value || 0);
      const inv = Number(p.invoiced_to_date || 0);
      return tcv > 0 && inv / tcv > 0.85;
    });
    return { activeCount: active.length, atRiskCount: atRisk.length, totalInvoicedMTD, remaining };
  }, [data]);

  const clients = useMemo(() => Array.from(new Set(data.map((p) => p.client_entity))).sort(), [data]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Project Portfolio"
        description="Manage client projects, budgets, contracts, and invoicing performance in one place."
        actions={
          isAdmin && (
            <button
              type="button"
              onClick={() => setShowCreate((s) => !s)}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-medium px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand"
              data-testid="new-project-btn"
            >
              <Plus size={16} /> New project
            </button>
          )
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="projects-kpis">
        <KpiCard
          label="Active projects"
          value={kpis.activeCount}
          tone="brand"
          icon={<Briefcase size={18} />}
          delta={{ direction: "flat", label: "No change vs last month" }}
          trend={[3, 4, 4, 4, 4, 4, kpis.activeCount]}
          testId="kpi-active-projects"
        />
        <KpiCard
          label="At risk projects"
          value={kpis.atRiskCount}
          tone="warning"
          icon={<AlertTriangle size={18} />}
          delta={{ direction: kpis.atRiskCount > 0 ? "up" : "flat", label: "1 vs last month" }}
          trend={[0, 1, 0, 1, 1, 1, kpis.atRiskCount]}
          testId="kpi-at-risk"
        />
        <KpiCard
          label="Invoiced to date (MTD)"
          value={`SAR ${(kpis.totalInvoicedMTD / 1000).toFixed(0)}K`}
          tone="success"
          icon={<FileText size={18} />}
          delta={{ direction: "up", label: "18% vs last month" }}
          trend={[1, 2, 3, 4, 5, 6, 7]}
          testId="kpi-invoiced-mtd"
        />
        <KpiCard
          label="Remaining budget"
          value={`SAR ${(kpis.remaining / 1_000_000).toFixed(2)}M`}
          tone="violet"
          icon={<TrendingDown size={18} />}
          delta={{ direction: "down", label: "8% vs last month" }}
          trend={[7, 6, 5, 5, 4, 4, 3]}
          testId="kpi-remaining"
        />
      </div>

      {showCreate && isAdmin && (
        <Card>
          <CardBody>
            <h2 className="mb-3 text-sm font-semibold">New project</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Field
                label="Name"
                value={form.name}
                onChange={(v) => setForm({ ...form, name: v })}
                testId="project-name"
              />
              <Field
                label="Client entity"
                value={form.client_entity}
                onChange={(v) => setForm({ ...form, client_entity: v })}
                testId="project-client"
              />
              <Field
                label="Description"
                value={form.description ?? ""}
                onChange={(v) => setForm({ ...form, description: v })}
                testId="project-desc"
              />
            </div>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => mutate.mutate(form)}
                disabled={!form.name || !form.client_entity || mutate.isPending}
                className="rounded-md bg-brand-medium px-4 py-2 text-sm font-medium text-white hover:bg-brand disabled:opacity-50"
                data-testid="project-submit"
              >
                {mutate.isPending ? "Creating…" : "Create project"}
              </button>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="relative min-w-[220px] flex-1">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search projects"
                className="h-10 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                data-testid="projects-search"
              />
            </div>
            <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={[
              { value: "", label: "All statuses" },
              { value: "active", label: "Active" },
              { value: "on_hold", label: "On hold" },
              { value: "closed", label: "Closed" },
            ]} />
            <FilterSelect label="Client" value={clientFilter} onChange={setClientFilter} options={[
              { value: "", label: "All clients" },
              ...clients.map((c) => ({ value: c, label: c })),
            ]} />
            <button className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <PieChart size={14} /> More filters
            </button>
            <button className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Export
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm" data-testid="projects-table">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Project name</th>
                  <th className="px-5 py-2.5 font-medium">Client</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 font-medium text-right">Budget (SAR)</th>
                  <th className="px-5 py-2.5 font-medium">Invoiced (SAR)</th>
                  <th className="px-5 py-2.5 font-medium text-right">Remaining (SAR)</th>
                  <th className="px-5 py-2.5 font-medium">Contracts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {projects.isLoading ? (
                  <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-slate-500">Loading…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-slate-500">No projects match.</td></tr>
                ) : (
                  filtered.map((p) => {
                    const tcv = Number(p.total_contract_value || 0);
                    const inv = Number(p.invoiced_to_date || 0);
                    const remaining = Number(p.remaining || 0);
                    const pct = tcv > 0 ? Math.round((inv / tcv) * 100) : 0;
                    const contractCount = (contracts.data ?? []).filter((c) => c.project_id === p.id).length;
                    const overrun = pct >= 100;
                    return (
                      <tr key={p.id} className="transition hover:bg-slate-50" data-testid="project-row">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-50 text-brand"><Briefcase size={16} /></span>
                            <div>
                              <p className="font-medium text-slate-900">{p.name}</p>
                              <p className="font-mono text-[11px] text-slate-500">{p.id.slice(0, 8).toUpperCase()}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-slate-700">{p.client_entity}</td>
                        <td className="px-5 py-3">
                          <StatusBadge tone={overrun ? "review" : statusTone(p.status)}>
                            {overrun ? "At risk" : p.status === "on_hold" ? "On hold" : p.status[0].toUpperCase() + p.status.slice(1)}
                          </StatusBadge>
                        </td>
                        <td className="px-5 py-3 text-right text-slate-900">{money(tcv, true)}</td>
                        <td className="px-5 py-3">
                          <div className="space-y-1 min-w-[160px]">
                            <span className="text-slate-900">{money(inv, true)}</span>
                            <ProgressBar value={pct} color={overrun ? "#EF4444" : pct > 85 ? "#F59E0B" : "#005EB8"} />
                            <span className="text-[11px] text-slate-500">{pct}%</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right text-emerald-700">{money(remaining, true)}</td>
                        <td className="px-5 py-3 text-slate-700">{contractCount}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Showing 1 to {filtered.length} of {filtered.length} projects</span>
            <Donut
              size={0}
              segments={[]}
              className="hidden"
            />
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
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  testId?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-500">{label}</label>
      <input
        type="text"
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
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-500">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 rounded-md border border-slate-300 bg-white px-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
