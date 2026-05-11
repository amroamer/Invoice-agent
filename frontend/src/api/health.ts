import { api } from "@/api/client";

export type ServiceCheck = {
  ok: boolean;
  latency_ms?: number;
  error?: string;
  model?: string;
  model_present?: boolean;
  models?: string[];
  [k: string]: unknown;
};

export type Readiness = {
  ok: boolean;
  checks: {
    postgres: ServiceCheck;
    redis: ServiceCheck;
    ollama: ServiceCheck;
  };
};

export type HealthDetail = Readiness & {
  app_env: string;
  version: string;
  storage: {
    exists: boolean;
    path: string;
    file_count?: number;
    total_size_bytes?: number;
  };
  db_rows_seen: Record<string, boolean>;
  config: Record<string, unknown>;
};

export const liveness = (): Promise<{ status: string }> =>
  api<{ status: string }>("/health");

export const readiness = (): Promise<Readiness> => api<Readiness>("/health/ready");

export const healthDetail = (): Promise<HealthDetail> => api<HealthDetail>("/health/detail");

// Aliases (legacy names) — kept so nothing else breaks if imported elsewhere.
export const getReadiness = readiness;
export const getHealthDetail = healthDetail;
export type CheckResult = ServiceCheck;
export type ReadyResponse = Readiness;
