import { api } from "@/api/client";

export type MatchSignal = {
  name: string;
  weight: number;
  score: number;
  note: string;
};

export type MatchCandidate = {
  match_id: string;
  contract_id: string;
  project_id: string;
  contract_number: string;
  project_name: string;
  vendor_name: string;
  confidence: number;
  signals: MatchSignal[];
  remaining_budget: string;
  invoiced_to_date: string;
};

export type BoqMappingSuggestion = {
  invoice_line_item_id: string;
  invoice_line_number: number | null;
  boq_item_id: string | null;
  boq_line_number: number | null;
  confidence: number;
  reason: string;
};

export const fetchCandidates = (invoiceId: string): Promise<MatchCandidate[]> =>
  api<MatchCandidate[]>(`/matching/${invoiceId}/candidates`, { method: "POST" });

export const confirmMatch = (invoiceId: string, matchId: string): Promise<unknown> =>
  api(`/matching/${invoiceId}/confirm`, { body: { match_id: matchId } });

export const unlockMatch = (invoiceId: string): Promise<void> =>
  api<void>(`/matching/${invoiceId}/unlock`, { method: "POST" });

export const proposeBoqMapping = (invoiceId: string): Promise<BoqMappingSuggestion[]> =>
  api<BoqMappingSuggestion[]>(`/matching/${invoiceId}/map-boq`, { method: "POST" });

export const applyBoqMapping = (
  invoiceId: string,
  body: BoqMappingSuggestion[],
): Promise<BoqMappingSuggestion[]> =>
  api<BoqMappingSuggestion[]>(`/matching/${invoiceId}/apply-boq-mapping`, { body });
