import { api } from "@/api/client";

export type QueueCounts = {
  pending: number;
  reviewed: number;
  decided: number;
  paid: number;
  partially_paid: number;
  rejected: number;
};

export type DashboardStats = {
  queue_counts: QueueCounts;
  total_contract_value: string;
  total_invoiced: string;
  total_paid: string;
  active_projects: number;
  active_vendors: number;
};

export const dashboardStats = (): Promise<DashboardStats> =>
  api<DashboardStats>("/dashboard/stats");
