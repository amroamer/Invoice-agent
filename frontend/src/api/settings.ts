import { api } from "@/api/client";

export type OllamaModelInfo = {
  name: string;
  size?: number | null;
  digest?: string | null;
  modified_at?: string | null;
  parameter_size?: string | null;
  family?: string | null;
};

export type LlmSettings = {
  host: string;
  default_model: string;
  env_default_model: string;
};

export type LlmConnectionTest = {
  ok: boolean;
  host: string;
  latency_ms: number | null;
  model_count: number | null;
  error: string | null;
};

export function getLlmSettings(): Promise<LlmSettings> {
  return api<LlmSettings>("/settings/llm");
}

export function updateLlmSettings(default_model: string): Promise<LlmSettings> {
  return api<LlmSettings>("/settings/llm", { method: "PUT", body: { default_model } });
}

export function listLlmModels(): Promise<OllamaModelInfo[]> {
  return api<OllamaModelInfo[]>("/settings/llm/models");
}

export function testLlmConnection(): Promise<LlmConnectionTest> {
  return api<LlmConnectionTest>("/settings/llm/test", { method: "POST" });
}
