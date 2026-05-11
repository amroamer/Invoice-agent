import { api } from "@/api/client";

export type BoqItem = {
  id: string;
  contract_id: string;
  line_number: number;
  description: string;
  uom: string;
  quantity: string;
  unit_price: string;
  line_total: string;
  active: boolean;
  created_at: string;
};

export type BoqPreviewRow = {
  line_number: number;
  description: string;
  uom: string;
  quantity: string;
  unit_price: string;
  line_total: string;
  errors: string[];
};

export type BoqPreview = {
  rows: BoqPreviewRow[];
  row_errors: number;
  sum_line_total: string;
  contract_value: string | null;
  tolerance_pct: number;
  within_tolerance: boolean | null;
};

export type BoqLineCumulative = {
  id: string;
  line_number: number;
  description: string;
  uom: string;
  original_quantity: string;
  original_unit_price: string;
  original_line_total: string;
  cumulative_quantity_invoiced: string;
  cumulative_amount_invoiced: string;
  cumulative_amount_paid: string;
  remaining_quantity: string;
  remaining_value: string;
  consumed_pct: number;
  color: "green" | "yellow" | "red";
};

export type BoqLineHistoryEntry = {
  invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  quantity: string;
  amount: string;
};

export async function previewBoq(contractId: string, file: File): Promise<BoqPreview> {
  const form = new FormData();
  form.append("file", file);
  return api<BoqPreview>(`/boq/${contractId}/preview`, { form });
}

export function commitBoq(
  contractId: string,
  rows: Array<{
    line_number: number;
    description: string;
    uom: string;
    quantity: number | string;
    unit_price: number | string;
    line_total?: number | string | null;
  }>,
): Promise<BoqItem[]> {
  return api<BoqItem[]>(`/boq/${contractId}/commit`, { body: { rows } });
}

export const listBoq = (contractId: string): Promise<BoqItem[]> =>
  api<BoqItem[]>(`/boq/${contractId}`);

export const boqCumulative = (contractId: string): Promise<BoqLineCumulative[]> =>
  api<BoqLineCumulative[]>(`/boq/${contractId}/cumulative`);

export const boqLineHistory = (boqItemId: string): Promise<BoqLineHistoryEntry[]> =>
  api<BoqLineHistoryEntry[]>(`/boq/line/${boqItemId}/history`);
