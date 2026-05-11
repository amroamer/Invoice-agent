import { api } from "@/api/client";

export type Project = {
  id: string;
  name: string;
  client_entity: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  status: "active" | "on_hold" | "closed" | "inactive";
  total_contract_value: string;
  invoiced_to_date: string;
  paid_to_date: string;
  remaining: string;
  open_invoice_count: number;
  created_at: string;
};

export type ProjectInput = {
  name: string;
  client_entity: string;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: Project["status"];
};

export const listProjects = (): Promise<Project[]> => api<Project[]>("/projects");
export const getProject = (id: string): Promise<Project> => api<Project>(`/projects/${id}`);
export const createProject = (body: ProjectInput): Promise<Project> =>
  api<Project>("/projects", { body });
export const updateProject = (id: string, body: Partial<ProjectInput>): Promise<Project> =>
  api<Project>(`/projects/${id}`, { method: "PATCH", body });
export const deleteProject = (id: string): Promise<void> =>
  api<void>(`/projects/${id}`, { method: "DELETE" });
