import { api } from "@/api/client";

export type Vendor = {
  id: string;
  legal_name: string;
  trn: string;
  cr_number: string | null;
  bank_details: Record<string, unknown> | null;
  contact_email: string | null;
  active: boolean;
  created_at: string;
};

export type VendorInput = {
  legal_name: string;
  trn: string;
  cr_number?: string | null;
  bank_details?: Record<string, unknown> | null;
  contact_email?: string | null;
};

export const listVendors = (): Promise<Vendor[]> => api<Vendor[]>("/vendors");
export const getVendor = (id: string): Promise<Vendor> => api<Vendor>(`/vendors/${id}`);
export const createVendor = (body: VendorInput): Promise<Vendor> =>
  api<Vendor>("/vendors", { body });
export const updateVendor = (id: string, body: Partial<VendorInput>): Promise<Vendor> =>
  api<Vendor>(`/vendors/${id}`, { method: "PATCH", body });
export const deactivateVendor = (id: string): Promise<void> =>
  api<void>(`/vendors/${id}`, { method: "DELETE" });
