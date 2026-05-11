import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Plus, Search, ShieldCheck, Star, Users as UsersIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { createVendor, listVendors, type Vendor, type VendorInput } from "@/api/vendors";
import { Card, CardBody } from "@/components/ui/Card";
import { KpiCard } from "@/components/ui/KpiCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useAuth } from "@/hooks/useAuth";

const blank: VendorInput = { legal_name: "", trn: "", cr_number: "", contact_email: "" };

function deriveCategory(v: Vendor): "Advisory" | "Consulting" | "Implementation" | "Audit" {
  const name = v.legal_name.toLowerCase();
  if (name.includes("advisory") || name.includes("advisors")) return "Advisory";
  if (name.includes("implement")) return "Implementation";
  if (name.includes("audit")) return "Audit";
  return "Consulting";
}

function deriveCompliance(v: Vendor): "compliant" | "review" | "noncompliant" {
  if (!v.active) return "noncompliant";
  if (!v.trn || v.trn.length < 12) return "review";
  return "compliant";
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export function VendorsPage() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const isAdmin = me?.role === "admin";

  const vendors = useQuery({ queryKey: ["vendors"], queryFn: listVendors });
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<VendorInput>(blank);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [complianceFilter, setComplianceFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");

  const mutate = useMutation({
    mutationFn: createVendor,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendors"] });
      setForm(blank);
      setShowCreate(false);
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const data = vendors.data ?? [];
  const enriched = useMemo(
    () => data.map((v) => ({ ...v, category: deriveCategory(v), compliance: deriveCompliance(v) })),
    [data],
  );

  const filtered = useMemo(
    () =>
      enriched.filter((v) => {
        if (q && !`${v.legal_name} ${v.trn} ${v.cr_number ?? ""} ${v.contact_email ?? ""}`.toLowerCase().includes(q.toLowerCase()))
          return false;
        if (complianceFilter && v.compliance !== complianceFilter) return false;
        if (categoryFilter && v.category !== categoryFilter) return false;
        if (activeFilter === "yes" && !v.active) return false;
        if (activeFilter === "no" && v.active) return false;
        return true;
      }),
    [enriched, q, complianceFilter, categoryFilter, activeFilter],
  );

  const kpis = useMemo(() => {
    const active = enriched.filter((v) => v.active);
    const pending = enriched.filter((v) => v.compliance === "review");
    const alerts = enriched.filter((v) => v.compliance === "noncompliant");
    const preferred = enriched.filter((v) => v.compliance === "compliant" && v.category === "Consulting").slice(0, 2);
    return { active: active.length, pending: pending.length, alerts: alerts.length, preferred: preferred.length };
  }, [enriched]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendor Management"
        description="Manage vendor information, onboarding, and compliance in one place."
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
              onClick={() => setShowCreate((s) => !s)}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-medium px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand"
              data-testid="add-vendor-btn"
            >
              <Plus size={16} /> Add vendor
            </button>
          )
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="vendors-kpis">
        <KpiCard label="Active vendors" value={kpis.active} tone="brand" icon={<UsersIcon size={18} />} delta={{ direction: "flat", label: "No change" }} testId="kpi-active-vendors" />
        <KpiCard label="Pending onboarding" value={kpis.pending} tone="violet" icon={<Clock size={18} />} delta={{ direction: "flat", label: "No change" }} testId="kpi-pending-vendors" />
        <KpiCard label="Compliance alerts" value={kpis.alerts} tone="danger" icon={<ShieldCheck size={18} />} delta={{ direction: kpis.alerts > 0 ? "up" : "flat", label: "1 vs last month" }} testId="kpi-alerts" />
        <KpiCard label="Preferred vendors" value={kpis.preferred} tone="success" icon={<Star size={18} />} delta={{ direction: "up", label: "2 vs last month" }} testId="kpi-preferred" />
      </div>

      {showCreate && isAdmin && (
        <Card>
          <CardBody>
            <h2 className="mb-3 text-sm font-semibold">New vendor</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <Field label="Legal name" value={form.legal_name} onChange={(v) => setForm({ ...form, legal_name: v })} testId="vendor-legal-name" />
              <Field label="TRN (VAT #)" value={form.trn} onChange={(v) => setForm({ ...form, trn: v })} testId="vendor-trn" />
              <Field label="CR number" value={form.cr_number ?? ""} onChange={(v) => setForm({ ...form, cr_number: v })} testId="vendor-cr" />
              <Field label="Contact email" value={form.contact_email ?? ""} onChange={(v) => setForm({ ...form, contact_email: v })} testId="vendor-email" />
            </div>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowCreate(false)} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button
                onClick={() => mutate.mutate(form)}
                disabled={!form.legal_name || form.trn.length < 12 || mutate.isPending}
                className="rounded-md bg-brand-medium px-4 py-2 text-sm font-medium text-white hover:bg-brand disabled:opacity-50"
                data-testid="vendor-submit"
              >
                {mutate.isPending ? "Creating…" : "Create vendor"}
              </button>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="relative min-w-[260px] flex-1">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search vendors by name, TRN, CR # or email"
                className="h-10 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                data-testid="vendors-search"
              />
            </div>
            <FilterSelect label="Compliance status" value={complianceFilter} onChange={setComplianceFilter} options={[
              { value: "", label: "All" },
              { value: "compliant", label: "Compliant" },
              { value: "review", label: "Review due" },
              { value: "noncompliant", label: "Non-compliant" },
            ]} />
            <FilterSelect label="Category" value={categoryFilter} onChange={setCategoryFilter} options={[
              { value: "", label: "All" },
              { value: "Advisory", label: "Advisory" },
              { value: "Consulting", label: "Consulting" },
              { value: "Implementation", label: "Implementation" },
              { value: "Audit", label: "Audit" },
            ]} />
            <FilterSelect label="Active status" value={activeFilter} onChange={setActiveFilter} options={[
              { value: "", label: "All" },
              { value: "yes", label: "Active" },
              { value: "no", label: "Inactive" },
            ]} />
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => {
                setQ("");
                setComplianceFilter("");
                setCategoryFilter("");
                setActiveFilter("");
              }}
              data-testid="vendors-clear"
            >
              Clear
            </button>
            <button className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">Export</button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm" data-testid="vendors-table">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Legal name</th>
                  <th className="px-5 py-2.5 font-medium">TRN (VAT #)</th>
                  <th className="px-5 py-2.5 font-medium">CR number</th>
                  <th className="px-5 py-2.5 font-medium">Contact email</th>
                  <th className="px-5 py-2.5 font-medium">Category</th>
                  <th className="px-5 py-2.5 font-medium">Compliance status</th>
                  <th className="px-5 py-2.5 font-medium">Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {vendors.isLoading ? (
                  <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-slate-500">Loading…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-slate-500">No vendors match.</td></tr>
                ) : (
                  filtered.map((v) => (
                    <tr key={v.id} className="transition hover:bg-slate-50" data-testid="vendor-row">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand">
                            {initials(v.legal_name)}
                          </span>
                          <span className="font-medium text-slate-900">{v.legal_name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-slate-700">{v.trn}</td>
                      <td className="px-5 py-3 font-mono text-xs text-slate-700">{v.cr_number ?? "—"}</td>
                      <td className="px-5 py-3 text-slate-700">{v.contact_email ?? "—"}</td>
                      <td className="px-5 py-3">
                        <StatusBadge tone="pending" withDot={false}>{v.category}</StatusBadge>
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge tone={v.compliance === "compliant" ? "compliant" : v.compliance === "review" ? "review" : "noncompliant"} withDot={false}>
                          {v.compliance === "compliant" ? "Compliant" : v.compliance === "review" ? "Review due" : "Non-compliant"}
                        </StatusBadge>
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge tone={v.active ? "active" : "neutral"} withDot={false}>
                          {v.active ? "Yes" : "No"}
                        </StatusBadge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Showing 1 to {filtered.length} of {filtered.length} vendors</span>
          </div>
        </CardBody>
      </Card>

      <div className="rounded-xl border border-brand-50 bg-brand-50/40 px-4 py-3 text-sm text-slate-700">
        <span className="font-medium text-brand">Tip:</span> Keep vendor information up to date to ensure smooth invoice processing and compliance.
      </div>
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
