import { api } from "@/api/client";
import type { Scenario } from "@/api/recommendations";

export type Decision = {
  id: string;
  invoice_id: string;
  decided_by: string;
  scenario_accepted: Scenario;
  override_reason: string | null;
  decided_at: string;
};

export const recordDecision = (
  invoiceId: string,
  scenario_accepted: Scenario,
  override_reason?: string | null,
): Promise<Decision> =>
  api<Decision>(`/decisions/${invoiceId}`, {
    body: { scenario_accepted, override_reason: override_reason ?? null },
  });

export const latestDecision = (invoiceId: string): Promise<Decision | null> =>
  api<Decision | null>(`/decisions/${invoiceId}`);
