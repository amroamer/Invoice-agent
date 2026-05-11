import { api, getAccessToken, ApiError } from "@/api/client";

export type AuditEntry = {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  payload_json: Record<string, unknown> | null;
  ip: string | null;
  timestamp: string;
};

export type LlmCall = {
  id: string;
  invoice_id: string | null;
  agent: string;
  model: string;
  prompt_hash: string;
  response: string | null;
  latency_ms: number;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  timestamp: string;
};

export type ActionBreakdownEntry = {
  action: string;
  count: number;
};

export type AuditFilters = {
  action?: string;
  entity_type?: string;
  user_id?: string;
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
};

function qs(params: Record<string, string | number | undefined>): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    s.set(k, String(v));
  }
  const out = s.toString();
  return out ? `?${out}` : "";
}

export const listAuditLogs = (f: AuditFilters = {}): Promise<AuditEntry[]> =>
  api<AuditEntry[]>(`/audit/logs${qs(f)}`);

export const listLlmCalls = (f: { agent?: string; invoice_id?: string; limit?: number } = {}): Promise<LlmCall[]> =>
  api<LlmCall[]>(`/audit/llm-calls${qs(f)}`);

export const actionBreakdown = (since?: string): Promise<ActionBreakdownEntry[]> =>
  api<ActionBreakdownEntry[]>(`/audit/actions${qs({ since })}`);

export async function downloadAuditCsv(f: AuditFilters = {}): Promise<void> {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api";
  const token = getAccessToken();
  const url = `${base}/audit/logs.csv${qs({ ...f, limit: 10000 })}`;
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new ApiError(res.status, res.statusText, null);
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = "audit_logs.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(href);
}
