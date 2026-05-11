import { api, getAccessToken, ApiError } from "@/api/client";

export type InvoiceSource = "uploaded" | "historical";
export type InvoiceStatus =
  | "pending"
  | "reviewed"
  | "decided"
  | "paid"
  | "partially_paid"
  | "rejected";

export type InvoiceLineItem = {
  id: string;
  line_number: number | null;
  boq_item_id: string | null;
  description: string;
  uom: string | null;
  quantity: string;
  unit_price: string;
  line_total: string;
  mapping_confidence: number | null;
  not_in_boq: boolean;
};

export type Invoice = {
  id: string;
  contract_id: string | null;
  vendor_id: string | null;
  invoice_number: string;
  invoice_date: string;
  subtotal: string;
  vat: string;
  total: string;
  currency: string;
  source: InvoiceSource;
  status: InvoiceStatus;
  archived: boolean;
  original_file_path: string | null;
  created_at: string;
  line_items: InvoiceLineItem[];
};

export type InvoiceUploadResponse = {
  invoice_id: string;
  task_id: string | null;
  original_name: string;
  size_bytes: number;
};

export type Extraction = {
  id: string;
  invoice_id: string;
  extracted_json: {
    fields?: Record<string, unknown>;
    line_items?: Array<{
      line_number?: number;
      description?: string;
      uom?: string | null;
      quantity?: string;
      unit_price?: string;
      line_total?: string;
    }>;
    error?: string;
    ocr_method?: string;
    ocr_page_count?: number;
  };
  confidence_json: Record<string, number> | null;
  model: string;
  extracted_at: string;
};

export type InvoiceLineItemIn = {
  id?: string | null;
  line_number?: number | null;
  boq_item_id?: string | null;
  description: string;
  uom?: string | null;
  quantity: number | string;
  unit_price: number | string;
  line_total: number | string;
  not_in_boq?: boolean;
};

export type InvoiceUpdateIn = {
  invoice_number?: string;
  invoice_date?: string;
  subtotal?: number | string;
  vat?: number | string;
  total?: number | string;
  currency?: string;
  vendor_id?: string | null;
  line_items?: InvoiceLineItemIn[];
  fields?: Record<string, unknown>;
};

export async function uploadInvoice(file: File): Promise<InvoiceUploadResponse> {
  const form = new FormData();
  form.append("file", file);
  return api<InvoiceUploadResponse>("/invoices/upload", { form });
}

export type InvoiceListFilters = {
  status?: InvoiceStatus[];
  source?: InvoiceSource;
  project_id?: string;
  contract_id?: string;
  vendor_id?: string;
  date_from?: string;
  date_to?: string;
  q?: string;
};

export const listInvoices = (params: InvoiceListFilters = {}): Promise<Invoice[]> => {
  const qs = new URLSearchParams();
  for (const s of params.status ?? []) qs.append("status", s);
  if (params.source) qs.set("source", params.source);
  if (params.project_id) qs.set("project_id", params.project_id);
  if (params.contract_id) qs.set("contract_id", params.contract_id);
  if (params.vendor_id) qs.set("vendor_id", params.vendor_id);
  if (params.date_from) qs.set("date_from", params.date_from);
  if (params.date_to) qs.set("date_to", params.date_to);
  if (params.q) qs.set("q", params.q);
  const qStr = qs.toString();
  return api<Invoice[]>(`/invoices${qStr ? `?${qStr}` : ""}`);
};

export const getInvoice = (id: string): Promise<Invoice> => api<Invoice>(`/invoices/${id}`);

export const getExtraction = (id: string): Promise<Extraction | null> =>
  api<Extraction | null>(`/invoices/${id}/extraction`);

export const reExtract = (id: string): Promise<InvoiceUploadResponse> =>
  api<InvoiceUploadResponse>(`/invoices/${id}/re-extract`, { method: "POST" });

export const updateInvoice = (id: string, body: InvoiceUpdateIn): Promise<Invoice> =>
  api<Invoice>(`/invoices/${id}`, { method: "PATCH", body });

export async function fetchInvoiceFile(id: string): Promise<{ blob: Blob; contentType: string }> {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api";
  const token = getAccessToken();
  const res = await fetch(`${base}/invoices/${id}/file`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) {
    throw new ApiError(res.status, res.statusText, null);
  }
  const blob = await res.blob();
  return { blob, contentType: res.headers.get("content-type") ?? "application/octet-stream" };
}
