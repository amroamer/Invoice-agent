import { api } from "@/api/client";

export type Payment = {
  id: string;
  invoice_id: string;
  amount: string;
  payment_date: string;
  reference: string;
  recorded_by: string;
  created_at: string;
};

export const recordPayment = (
  invoiceId: string,
  body: { amount: number | string; payment_date: string; reference: string },
): Promise<Payment> => api<Payment>(`/payments/${invoiceId}`, { body });

export const listPayments = (invoiceId: string): Promise<Payment[]> =>
  api<Payment[]>(`/payments/${invoiceId}`);
