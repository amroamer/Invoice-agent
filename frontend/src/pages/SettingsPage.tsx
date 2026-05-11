import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import {
  getLlmSettings,
  listLlmModels,
  testLlmConnection,
  updateLlmSettings,
  type LlmConnectionTest,
  type OllamaModelInfo,
} from "@/api/settings";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { useAuth } from "@/hooks/useAuth";

function formatSize(bytes?: number | null): string {
  if (!bytes && bytes !== 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export function SettingsPage() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const isAdmin = me?.role === "admin";

  const llm = useQuery({ queryKey: ["llm-settings"], queryFn: getLlmSettings });
  const models = useQuery({ queryKey: ["llm-models"], queryFn: listLlmModels });

  const [pendingModel, setPendingModel] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<LlmConnectionTest | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const selectedModel = pendingModel ?? llm.data?.default_model ?? "";

  const test = useMutation({
    mutationFn: testLlmConnection,
    onSuccess: (r) => setTestResult(r),
    onError: (e: Error) =>
      setTestResult({ ok: false, host: llm.data?.host ?? "", latency_ms: null, model_count: null, error: e.message }),
  });

  const save = useMutation({
    mutationFn: (m: string) => updateLlmSettings(m),
    onSuccess: () => {
      setSaveError(null);
      setPendingModel(null);
      qc.invalidateQueries({ queryKey: ["llm-settings"] });
    },
    onError: (e: Error) => setSaveError(e.message),
  });

  const modelOptions = useMemo<OllamaModelInfo[]>(() => models.data ?? [], [models.data]);
  const isDirty = pendingModel !== null && pendingModel !== llm.data?.default_model;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">Settings</h1>

      <Card className="mb-6">
        <CardBody>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Ollama connection</h2>
              <p className="text-xs text-slate-500">Shared host-level Ollama service</p>
            </div>
            <Button
              variant="secondary"
              onClick={() => test.mutate()}
              disabled={test.isPending}
            >
              {test.isPending ? "Testing…" : "Test connection"}
            </Button>
          </div>
          <dl className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Host</dt>
              <dd className="mt-1 font-mono text-slate-900">{llm.data?.host ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Active model</dt>
              <dd className="mt-1 font-medium text-slate-900">{llm.data?.default_model ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Env default</dt>
              <dd className="mt-1 text-slate-700">{llm.data?.env_default_model ?? "—"}</dd>
            </div>
          </dl>
          {testResult && (
            <div
              className={
                "mt-4 rounded-md border px-3 py-2 text-sm " +
                (testResult.ok
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-red-200 bg-red-50 text-red-800")
              }
            >
              {testResult.ok ? (
                <>
                  Connected to <span className="font-mono">{testResult.host}</span> ·{" "}
                  {testResult.model_count} model{testResult.model_count === 1 ? "" : "s"} ·{" "}
                  {testResult.latency_ms} ms
                </>
              ) : (
                <>Connection failed: {testResult.error}</>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      <Card className="mb-6">
        <CardBody>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Default LLM</h2>
              <p className="text-xs text-slate-500">
                The model used by extraction, matching, and recommendation agents.
              </p>
            </div>
            {isAdmin && (
              <div className="flex items-center gap-2">
                {isDirty && (
                  <button
                    type="button"
                    className="text-xs text-slate-500 hover:text-slate-800"
                    onClick={() => setPendingModel(null)}
                  >
                    Reset
                  </button>
                )}
                <Button
                  onClick={() => pendingModel && save.mutate(pendingModel)}
                  disabled={!isDirty || save.isPending}
                >
                  {save.isPending ? "Saving…" : "Save"}
                </Button>
              </div>
            )}
          </div>
          <select
            className="h-10 w-full max-w-md rounded-md border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-50 disabled:text-slate-500"
            value={selectedModel}
            disabled={!isAdmin || models.isLoading}
            onChange={(e) => setPendingModel(e.target.value)}
          >
            {!modelOptions.find((m) => m.name === selectedModel) && selectedModel && (
              <option value={selectedModel}>{selectedModel} (not in shared service)</option>
            )}
            {modelOptions.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name}
                {m.parameter_size ? ` · ${m.parameter_size}` : ""}
              </option>
            ))}
          </select>
          {saveError && <p className="mt-2 text-sm text-red-600">{saveError}</p>}
          {!isAdmin && (
            <p className="mt-2 text-xs text-slate-500">Only administrators can change the default model.</p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Available models</h2>
            <button
              type="button"
              className="text-xs text-slate-500 hover:text-slate-800"
              onClick={() => models.refetch()}
              disabled={models.isFetching}
            >
              {models.isFetching ? "Refreshing…" : "Refresh"}
            </button>
          </div>
          {models.isLoading ? (
            <p className="text-slate-500">Loading…</p>
          ) : models.isError ? (
            <p className="text-sm text-red-600">{(models.error as Error).message}</p>
          ) : modelOptions.length === 0 ? (
            <p className="text-sm text-slate-500">No models available on the shared Ollama service.</p>
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>Name</Th>
                  <Th>Family</Th>
                  <Th>Params</Th>
                  <Th className="text-right">Size</Th>
                  <Th>Modified</Th>
                </Tr>
              </Thead>
              <Tbody>
                {modelOptions.map((m) => (
                  <Tr key={m.digest ?? m.name}>
                    <Td>
                      <span className="font-mono text-slate-900">{m.name}</span>
                      {m.name === llm.data?.default_model && (
                        <span className="ml-2 rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
                          Active
                        </span>
                      )}
                    </Td>
                    <Td>{m.family ?? "—"}</Td>
                    <Td>{m.parameter_size ?? "—"}</Td>
                    <Td className="text-right">{formatSize(m.size)}</Td>
                    <Td>{formatDate(m.modified_at)}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
