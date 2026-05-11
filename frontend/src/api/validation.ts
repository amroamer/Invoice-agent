import { api } from "@/api/client";

export type FindingSeverity = "info" | "warning" | "blocker";

export type Finding = {
  id: string;
  invoice_id: string;
  rule_code: string;
  severity: FindingSeverity;
  message: string;
  reference_json: Record<string, unknown> | null;
  created_at: string;
};

export const runValidation = (invoiceId: string): Promise<Finding[]> =>
  api<Finding[]>(`/validation/${invoiceId}/run`, { method: "POST" });

export const listFindings = (invoiceId: string): Promise<Finding[]> =>
  api<Finding[]>(`/validation/${invoiceId}/findings`);
