import { api } from "@/api/client";

export type TokenPair = {
  access_token: string;
  refresh_token: string;
  token_type: string;
};

export type Role = "officer" | "admin";

export type Me = {
  id: string;
  email: string;
  username: string;
  full_name: string | null;
  role: Role;
  active: boolean;
  last_login: string | null;
  created_at: string;
};

export async function login(username: string, password: string): Promise<TokenPair> {
  const form = new FormData();
  form.append("username", username);
  form.append("password", password);
  return api<TokenPair>("/auth/login", { form });
}

export async function getMe(): Promise<Me> {
  return api<Me>("/users/me");
}

export async function logout(): Promise<void> {
  await api<void>("/auth/logout", { method: "POST" });
}
