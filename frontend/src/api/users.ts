import { api } from "@/api/client";
import type { Me, Role } from "@/api/auth";

export type UserInput = {
  email: string;
  username: string;
  full_name?: string | null;
  password: string;
  role?: Role;
};

export const listUsers = (): Promise<Me[]> => api<Me[]>("/users");
export const createUser = (body: UserInput): Promise<Me> => api<Me>("/users", { body });
export const updateUser = (id: string, body: Partial<UserInput> & { active?: boolean }): Promise<Me> =>
  api<Me>(`/users/${id}`, { method: "PATCH", body });
export const deactivateUser = (id: string): Promise<void> =>
  api<void>(`/users/${id}`, { method: "DELETE" });
