const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/InvoiceAgent/api";
const TOKEN_KEY = "invoice_agent_access_token";
const REFRESH_KEY = "invoice_agent_refresh_token";

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setTokens(access: string, refresh: string): void {
  localStorage.setItem(TOKEN_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
    public body: unknown,
  ) {
    super(detail);
  }
}

type Options = {
  method?: string;
  body?: unknown;
  form?: FormData;
  headers?: Record<string, string>;
};

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let body: BodyInit | undefined;
  if (options.form) {
    body = options.form;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? (body ? "POST" : "GET"),
    headers,
    body,
  });

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const detail =
      (json && typeof json === "object" && "detail" in json && String(json.detail)) ||
      res.statusText;
    throw new ApiError(res.status, detail, json);
  }
  return json as T;
}
