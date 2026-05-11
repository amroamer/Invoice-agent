import { api } from "@/api/client";

export type HistoricalInvoice = {
  id: string;
  contract_id: string | null;
  vendor_id: string | null;
  invoice_number: string;
  invoice_date: string;
  subtotal: string;
  vat: string;
  total: string;
  currency: string;
  status: string;
  archived: boolean;
  superseded_by_id: string | null;
  created_at: string;
};

export type HistoricalPreviewRow = {
  invoice_number: string;
  vendor_trn: string;
  contract_number: string;
  invoice_date: string;
  subtotal: string;
  vat: string;
  total: string;
  status: string;
  paid_amount: string;
  payment_date: string | null;
  payment_reference: string | null;
  errors: string[];
};

export type HistoricalMappingPreview = {
  invoice_number: string;
  boq_line_number: number;
  quantity: string;
  amount: string;
  errors: string[];
};

export type HistoricalPreview = {
  invoices: HistoricalPreviewRow[];
  mappings: HistoricalMappingPreview[];
  row_errors: number;
  unresolved_contracts: string[];
  unresolved_vendors: string[];
  unresolved_boq_lines: string[];
};

export type HistoricalMappingIn = {
  boq_line_number?: number | null;
  quantity: number | string;
  amount: number | string;
};

export type HistoricalInvoiceIn = {
  invoice_number: string;
  vendor_trn?: string | null;
  contract_number?: string | null;
  invoice_date: string;
  subtotal: number | string;
  vat: number | string;
  total: number | string;
  status?: string;
  paid_amount?: number | string;
  payment_date?: string | null;
  payment_reference?: string | null;
  mappings?: HistoricalMappingIn[];
};

export async function previewHistorical(
  file: File,
  mappingsFile?: File | null,
): Promise<HistoricalPreview> {
  const form = new FormData();
  form.append("file", file);
  if (mappingsFile) form.append("mappings_file", mappingsFile);
  return api<HistoricalPreview>("/historical-invoices/preview", { form });
}

export const commitHistorical = (
  invoices: HistoricalInvoiceIn[],
): Promise<HistoricalInvoice[]> =>
  api<HistoricalInvoice[]>("/historical-invoices/commit", { body: { invoices } });

export const listHistorical = (contractId?: string): Promise<HistoricalInvoice[]> =>
  api<HistoricalInvoice[]>(
    contractId ? `/historical-invoices?contract_id=${contractId}` : "/historical-invoices",
  );

export const deleteHistorical = (id: string): Promise<void> =>
  api<void>(`/historical-invoices/${id}`, { method: "DELETE" });
