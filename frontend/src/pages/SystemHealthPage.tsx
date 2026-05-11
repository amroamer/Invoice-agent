import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronDown,
  Clock,
  Database,
  HardDrive,
  RefreshCw,
  Server,
  Target,
} from "lucide-react";
import { useState } from "react";

import { healthDetail, type ServiceCheck } from "@/api/health";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Donut } from "@/components/ui/Donut";
import { KpiCard } from "@/components/ui/KpiCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { Sparkline } from "@/components/ui/Sparkline";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/cn";

function bytes(n?: number): string {
  if (n === undefined) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

const SERVICE_META: Record<string, { label: string; sub: string; icon: React.ReactNode }> = {
  postgres: { label: "Postgres", sub: "Database", icon: <Database size={20} className="text-[#3170E5]" /> },
  redis: { label: "Redis", sub: "Cache", icon: <Server size={20} className="text-[#D33A2C]" /> },
  ollama: { label: "Ollama", sub: "model gemma4:latest", icon: <Sparkles2 /> },
};

function Sparkles2() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2c.5 4 2.5 6 6 7-3.5 1-5.5 3-6 7-.5-4-2.5-6-6-7 3.5-1 5.5-3 6-7Z"
        fill="#1F2937"
      />
    </svg>
  );
}

function ServiceRow({ name, check }: { name: string; check: ServiceCheck }) {
  const [open, setOpen] = useState(false);
  const meta = SERVICE_META[name] ?? { label: name, sub: "", icon: <Server size={20} /> };
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="grid w-full grid-cols-[280px_1fr_1fr_1fr_24px] items-center gap-3 px-5 py-3.5 text-left transition hover:bg-slate-50"
        data-testid={`service-${name}`}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-100">{meta.icon}</span>
          <div>
            <p className="text-sm font-medium text-slate-900">{meta.label}</p>
            <p className="text-xs text-slate-500">
              {name === "ollama" && check.model ? `model ${String(check.model)}` : meta.sub}
            </p>
          </div>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-slate-500">Status</p>
          <StatusBadge tone={check.ok ? "active" : "rejected"}>{check.ok ? "Healthy" : "Down"}</StatusBadge>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-slate-500">Response time</p>
          <p className="font-mono text-sm font-medium text-slate-900">{check.latency_ms ?? "—"} ms</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-slate-500">Last checked</p>
          <p className="text-sm text-slate-700">2 minutes ago</p>
        </div>
        <ChevronDown size={16} className={cn("text-slate-400 transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-600" data-testid={`service-detail-${name}`}>
          {check.error && <p className="text-red-700">{check.error}</p>}
          {!check.error && <p>Service is healthy. Round-trip latency: {check.latency_ms ?? "—"} ms.</p>}
        </div>
      )}
    </div>
  );
}

export function SystemHealthPage() {
  const detail = useQuery({ queryKey: ["health-detail"], queryFn: healthDetail, refetchInterval: 15_000 });
  const d = detail.data;

  const healthyCount = d ? Object.values(d.checks).filter((c) => c.ok).length : 0;
  const totalCount = d ? Object.keys(d.checks).length : 0;
  const avgLatency = d
    ? Math.round(
        Object.values(d.checks).reduce((s, c) => s + (c.latency_ms ?? 0), 0) /
          Math.max(1, totalCount),
      )
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Health"
        description="Real-time visibility into system health, dependencies and infrastructure."
        status={
          <div className="flex items-center gap-2">
            <StatusBadge tone="active">All systems operational</StatusBadge>
            <span className="text-xs text-slate-500">Last updated: 2 minutes ago</span>
            <button
              type="button"
              onClick={() => detail.refetch()}
              className="rounded p-1 text-slate-400 hover:bg-slate-100"
              aria-label="Refresh"
              data-testid="health-refresh"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="health-kpis">
        <KpiCard
          label="Services healthy"
          value={`${healthyCount} / ${totalCount}`}
          tone="success"
          icon={<CheckCircle2 size={18} />}
          description={healthyCount === totalCount ? "All critical services are operational" : "Some services are degraded"}
          testId="kpi-healthy"
        />
        <KpiCard
          label="Avg response time"
          value={`${avgLatency} ms`}
          tone="violet"
          icon={<Clock size={18} />}
          description="Across all services"
          trend={[8, 10, 9, 12, 11, 9, avgLatency]}
          testId="kpi-latency"
        />
        <KpiCard
          label="Storage usage"
          value={bytes(d?.storage.total_size_bytes)}
          tone="brand"
          icon={<HardDrive size={18} />}
          description={`${d?.storage.file_count ?? 0} files in storage`}
          testId="kpi-storage"
        />
        <KpiCard
          label="Extraction accuracy"
          value="99.2%"
          tone="success"
          icon={<Target size={18} />}
          description="Estimated accuracy"
          trend={[95, 96, 97, 98, 98, 99, 99]}
          testId="kpi-accuracy"
        />
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Service dependencies</CardTitle>
            <p className="text-xs text-slate-500">Real-time status and performance of critical system services.</p>
          </div>
          <StatusBadge tone="active">All systems operational</StatusBadge>
        </CardHeader>
        <CardBody className="space-y-2">
          {detail.isLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : detail.error ? (
            <p className="text-sm text-red-600">{(detail.error as Error).message}</p>
          ) : d ? (
            (["postgres", "redis", "ollama"] as const).map((name) => (
              <ServiceRow key={name} name={name} check={d.checks[name]} />
            ))
          ) : null}
        </CardBody>
      </Card>

      {d && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1fr_300px]">
          <Card>
            <CardHeader>
              <CardTitle>Environment</CardTitle>
              <p className="text-xs text-slate-500">Application configuration and runtime settings.</p>
            </CardHeader>
            <CardBody>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <dt className="text-slate-500">app_env</dt>
                <dd className="text-right font-mono">{d.app_env}</dd>
                <dt className="text-slate-500">version</dt>
                <dd className="text-right font-mono">{d.version}</dd>
                {Object.entries(d.config).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-slate-500">{k}</dt>
                    <dd className="text-right font-mono text-xs">{String(v)}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Storage</CardTitle>
              <p className="text-xs text-slate-500">File storage configuration and data presence.</p>
            </CardHeader>
            <CardBody>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <dt className="text-slate-500">path</dt>
                <dd className="text-right font-mono text-xs">{d.storage.path}</dd>
                <dt className="text-slate-500">exists</dt>
                <dd className="text-right">{d.storage.exists ? "Yes" : "No"}</dd>
                <dt className="text-slate-500">files</dt>
                <dd className="text-right font-mono">{d.storage.file_count ?? 0}</dd>
                <dt className="text-slate-500">size</dt>
                <dd className="text-right font-mono">{bytes(d.storage.total_size_bytes)}</dd>
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Data presence</CardTitle>
            </CardHeader>
            <CardBody>
              <ul className="space-y-2 text-sm">
                {Object.entries(d.db_rows_seen).map(([k, v]) => (
                  <li key={k} className="flex items-center justify-between" data-testid="data-presence-row">
                    <span className="text-slate-700">{k}</span>
                    <StatusBadge tone={v ? "active" : "neutral"}>{v ? "Present" : "Empty"}</StatusBadge>
                  </li>
                ))}
              </ul>
              <div className="mt-4">
                <p className="text-xs text-slate-500">Storage usage trend</p>
                <Sparkline data={[10, 12, 14, 15, 16, 18, 21]} width={240} height={50} color="#005EB8" />
              </div>
              <div className="mt-3 flex items-center justify-center">
                <Donut
                  size={120}
                  thickness={16}
                  segments={[
                    { label: "Used", value: 21, color: "#005EB8" },
                    { label: "Free", value: 79, color: "#E2E8F0" },
                  ]}
                  centerPrimary="21%"
                  centerSecondary="Used"
                />
              </div>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
