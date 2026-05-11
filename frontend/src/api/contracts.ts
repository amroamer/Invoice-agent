import { api } from "@/api/client";

export type Contract = {
  id: string;
  project_id: string;
  vendor_id: string;
  contract_number: string;
  value: string;
  currency: string;
  start_date: string;
  end_date: string;
  retention_pct: string;
  advance_pct: string;
  vat_treatment: "inclusive" | "exclusive" | "exempt";
  status: "active" | "on_hold" | "closed" | "inactive";
  contract_file_path: string | null;
  created_at: string;
};

export type ContractDetail = Contract & {
  cumulative: {
    invoiced_to_date: string;
    paid_to_date: string;
    approved_unpaid: string;
    remaining: string;
    consumed_pct: number;
  };
};

export type ContractInput = {
  project_id: string;
  vendor_id: string;
  contract_number: string;
  value: number;
  currency?: string;
  start_date: string;
  end_date: string;
  retention_pct?: number;
  advance_pct?: number;
  vat_treatment?: Contract["vat_treatment"];
  status?: Contract["status"];
};

export const listContracts = (): Promise<Contract[]> => api<Contract[]>("/contracts");
export const getContract = (id: string): Promise<ContractDetail> =>
  api<ContractDetail>(`/contracts/${id}`);
export const createContract = (body: ContractInput): Promise<Contract> =>
  api<Contract>("/contracts", { body });
export const updateContract = (
  id: string,
  body: Partial<ContractInput>,
): Promise<Contract> => api<Contract>(`/contracts/${id}`, { method: "PATCH", body });
