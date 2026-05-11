import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  CloudUpload,
  DollarSign,
  Eye,
  FileSpreadsheet,
  Upload,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  commitHistorical,
  deleteHistorical,
  listHistorical,
  previewHistorical,
  type HistoricalInvoiceIn,
  type HistoricalPreview,
} from "@/api/historical";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { KpiCard } from "@/components/ui/KpiCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { useAuth } from "@/hooks/useAuth";
import { money, shortDate } from "@/lib/format";

function statusTone(s: string): StatusTone {
  if (s === "paid") return "paid";
  if (s === "partially_paid") return "review";
  if (s === "pending") return "pending";
  if (s === "rejected") return "rejected";
  return "neutral";
}

export function HistoricalInvoicesPage() {
  const { me } = useAuth();
  const isAdmin = me?.role === "admin";
  const qc = useQueryClient();

  const historical = useQuery({ queryKey: ["historical-invoices"], queryFn: () => listHistorical() });

  const [file, setFile] = useState<File | null>(null);
  const [mappingsFile, setMappingsFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<HistoricalPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const previewMut = useMutation({
    mutationFn: () => previewHistorical(file!, mappingsFile),
    onSuccess: (p) => {
      setPreview(p);
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const commitMut = useMutation({
    mutationFn: () => {
      const invoiceMap: Record<string, HistoricalInvoiceIn> = {};
      for (const row of preview?.invoices ?? []) {
        invoiceMap[row.invoice_number] = {
          invoice_number: row.invoice_number,
          vendor_trn: row.vendor_trn || null,
          contract_number: row.contract_number || null,
          invoice_date: row.invoice_date,
          subtotal: row.subtotal,
          vat: row.vat,
          total: row.total,
          status: row.status,
          paid_amount: row.paid_amount,
          payment_date: row.payment_date,
          payment_reference: row.payment_reference,
          mappings: [],
        };
      }
      for (const m of preview?.mappings ?? []) {
        const inv = invoiceMap[m.invoice_number];
        if (!inv) continue;
        inv.mappings!.push({
          boq_line_number: m.boq_line_number,
          quantity: m.quantity,
          amount: m.amount,
        });
      }
      return commitHistorical(Object.values(invoiceMap));
    },
    onSuccess: () => {
      setPreview(null);
      setFile(null);
      setMappingsFile(null);
      qc.invalidateQueries({ queryKey: ["historical-invoices"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const archive = useMutation({
    mutationFn: deleteHistorical,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["historical-invoices"] }),
  });

  const blocked =
    !preview ||
    preview.row_errors > 0 ||
    preview.unresolved_contracts.length > 0 ||
    preview.unresolved_vendors.length > 0;

  const data = historical.data ?? [];

  const filtered = useMemo(
    () =>
      data.filter((i) => {
        if (statusFilter && i.status !== statusFilter) return false;
        if (q && !`${i.invoice_number}`.toLowerCase().includes(q.toLowerCase())) return false;
        return true;
      }),
    [data, statusFilter, q],
  );

  const kpis = useMemo(() => {
    const total = data.length;
    const paidValue = data
      .filter((i) => i.status === "paid")
      .reduce((s, i) => s + Number(i.total || 0), 0);
    const paidCount = data.filter((i) => i.status === "paid").length;
    const exceptions = data.filter((i) => i.status === "pending" || i.status === "partially_paid").length;
    return { total, paidValue, paidCount, exceptions };
  }, [data]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Historical Invoices & Archive"
        description="Browse committed invoices, review archived records, and manage bulk imports."
        actions={
          isAdmin && (
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-medium px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand"
              data-testid="historical-upload-btn"
            >
              <CloudUpload size={16} /> Upload invoice files
            </button>
          )
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="historical-kpis">
        <KpiCard label="Archived invoices" value={kpis.total} tone="violet" icon={<Archive size={18} />} description="Total invoices archived" testId="kpi-archived" />
        <KpiCard label="Bulk imports this month" value={data.filter((d) => new Date(d.created_at).getMonth() === new Date().getMonth()).length} tone="brand" icon={<CloudUpload size={18} />} description="Last import: 2 days ago" testId="kpi-bulk" />
        <KpiCard label="Paid value (archive)" value={`SAR ${(kpis.paidValue / 1000).toFixed(0)}K`} tone="success" icon={<DollarSign size={18} />} description={`Across ${kpis.paidCount} paid invoices`} testId="kpi-paid-value" />
        <KpiCard label="Exceptions found" value={kpis.exceptions} tone="danger" icon={<AlertTriangle size={18} />} description="Require your attention" testId="kpi-exceptions" />
      </div>

      {isAdmin && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Bulk upload invoices &amp; mappings</CardTitle>
              <p className="text-xs text-slate-500">
                Upload invoice files and an optional mappings file. Committed invoices are immutable — edits create a new version.
              </p>
            </div>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr_280px]">
              <DropZone
                icon={<FileSpreadsheet size={26} />}
                title="Upload invoices"
                hint=".xlsx or .csv"
                file={file}
                onPick={(f) => {
                  setFile(f);
                  setPreview(null);
                }}
                accept=".xlsx,.xlsm,.csv,.tsv"
                testId="upload-invoices"
              />
              <DropZone
                icon={<FileSpreadsheet size={26} />}
                title="Upload mappings"
                hint=".csv or .xlsx with 'mappings' sheet"
                optional
                file={mappingsFile}
                onPick={(f) => {
                  setMappingsFile(f);
                  setPreview(null);
                }}
                accept=".csv,.tsv,.xlsx,.xlsm"
                testId="upload-mappings"
              />
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="mb-2 text-sm font-semibold text-slate-900">Import tips</p>
                <ul className="space-y-1.5 text-xs text-slate-700">
                  <li className="flex gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-600" /> Accepted files: .xlsx, .csv</li>
                  <li className="flex gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-600" /> Max file size: 25 MB per file</li>
                  <li className="flex gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-600" /> Committed invoices are immutable</li>
                  <li className="flex gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-600" /> Duplicate checks are performed automatically</li>
                </ul>
                <a href="#" className="mt-3 inline-block text-xs font-medium text-brand hover:underline">Learn more about imports ›</a>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => previewMut.mutate()}
                disabled={!file || previewMut.isPending}
                className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                data-testid="preview-import"
              >
                <Eye size={14} /> {previewMut.isPending ? "Parsing…" : "Preview import"}
              </button>
              <button
                type="button"
                onClick={() => commitMut.mutate()}
                disabled={blocked || commitMut.isPending}
                className="inline-flex items-center gap-2 rounded-md bg-brand-medium px-4 py-2 text-sm font-medium text-white hover:bg-brand disabled:opacity-50"
                data-testid="start-import"
              >
                <Upload size={14} /> {commitMut.isPending ? "Importing…" : preview ? `Start import (${preview.invoices.length})` : "Start import"}
              </button>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
            {preview && (
              <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                {preview.unresolved_contracts.length > 0 && (
                  <p className="text-red-600">
                    Unknown contract #s: {preview.unresolved_contracts.join(", ")}
                  </p>
                )}
                {preview.unresolved_vendors.length > 0 && (
                  <p className="text-red-600">
                    Unknown vendor TRNs: {preview.unresolved_vendors.join(", ")}
                  </p>
                )}
                <p className="text-slate-600">
                  {preview.invoices.length} invoice row(s), {preview.mappings.length} mapping row(s), {preview.row_errors} row error(s)
                </p>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="relative min-w-[260px] flex-1">
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search invoice #, vendor, or source"
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                data-testid="historical-search"
              />
            </div>
            <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={[
              { value: "", label: "All status" },
              { value: "paid", label: "Paid" },
              { value: "partially_paid", label: "Partially paid" },
              { value: "pending", label: "Pending" },
              { value: "rejected", label: "Rejected" },
            ]} />
            <button className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">Columns</button>
            <button className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">Export</button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm" data-testid="historical-table">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Invoice #</th>
                  <th className="px-5 py-2.5 font-medium">Date</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 font-medium text-right">Subtotal (SAR)</th>
                  <th className="px-5 py-2.5 font-medium text-right">VAT (SAR)</th>
                  <th className="px-5 py-2.5 font-medium text-right">Total (SAR)</th>
                  <th className="px-5 py-2.5 font-medium">Source</th>
                  {isAdmin && <th className="px-5 py-2.5 font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {historical.isLoading ? (
                  <tr><td colSpan={isAdmin ? 8 : 7} className="px-5 py-10 text-center text-sm text-slate-500">Loading…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={isAdmin ? 8 : 7} className="px-5 py-10 text-center text-sm text-slate-500">No invoices.</td></tr>
                ) : (
                  filtered.map((i) => (
                    <tr key={i.id} className="transition hover:bg-slate-50" data-testid="historical-row">
                      <td className="px-5 py-3 font-mono text-xs text-brand">{i.invoice_number}</td>
                      <td className="px-5 py-3 text-xs text-slate-500">{shortDate(i.invoice_date)}</td>
                      <td className="px-5 py-3">
                        <StatusBadge tone={statusTone(i.status)} withDot={false}>{i.status === "partially_paid" ? "Partially paid" : i.status[0].toUpperCase() + i.status.slice(1)}</StatusBadge>
                      </td>
                      <td className="px-5 py-3 text-right text-slate-900">{money(i.subtotal, true)}</td>
                      <td className="px-5 py-3 text-right text-slate-900">{money(i.vat, true)}</td>
                      <td className="px-5 py-3 text-right font-medium text-slate-900">{money(i.total, true)}</td>
                      <td className="px-5 py-3 text-xs text-slate-500">Bulk import {shortDate(i.invoice_date)}</td>
                      {isAdmin && (
                        <td className="px-5 py-3">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => archive.mutate(i.id)}
                              disabled={archive.isPending}
                              className="rounded p-1 text-slate-500 hover:bg-slate-100"
                              title="Archive"
                              data-testid="historical-archive"
                            >
                              <Archive size={14} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Showing 1 to {filtered.length} of {filtered.length} invoices</span>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function DropZone({
  icon,
  title,
  hint,
  optional,
  file,
  onPick,
  accept,
  testId,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  optional?: boolean;
  file: File | null;
  onPick: (f: File | null) => void;
  accept: string;
  testId?: string;
}) {
  return (
    <label
      className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand/30 bg-brand-50/30 px-4 py-8 text-center transition hover:border-brand/60 hover:bg-brand-50/60"
      data-testid={testId}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand">{icon}</span>
      <p className="text-sm font-medium text-slate-900">
        {title} {optional && <span className="font-normal text-slate-500">(optional)</span>}
      </p>
      <p className="text-xs text-slate-500">{hint}</p>
      <p className="text-xs text-brand underline">
        {file ? file.name : "Drag &amp; drop or click to browse"}
      </p>
      <input
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
    </label>
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
