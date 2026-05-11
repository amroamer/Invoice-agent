import { api } from "@/api/client";

export type Scenario = "happy" | "conditional" | "do_not_pay";

export type Recommendation = {
  id: string;
  invoice_id: string;
  scenario: Scenario;
  confidence: number;
  justification: string;
  deduction_amount: string | null;
  clarification_email: string | null;
  generated_at: string;
};

export type GenerateResponse = {
  recommendations: Recommendation[];
  finding_count: number;
  blocker_count: number;
  warning_count: number;
};

export const generateRecommendations = (invoiceId: string): Promise<GenerateResponse> =>
  api<GenerateResponse>(`/recommendations/${invoiceId}/generate`, { method: "POST" });

export const listRecommendations = (invoiceId: string): Promise<Recommendation[]> =>
  api<Recommendation[]>(`/recommendations/${invoiceId}`);
