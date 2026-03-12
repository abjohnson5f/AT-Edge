import { ATResponse } from "../types";

// In production, API is same-origin (served by Express); in dev, Vite proxies to :3001
const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    // Redirect to Google OAuth login, preserving current page
    const returnTo = encodeURIComponent(window.location.pathname);
    window.location.href = `/auth/google?returnTo=${returnTo}`;
    throw new Error("Authentication required");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ ResponseMessage: res.statusText }));
    throw new Error(err.ResponseMessage ?? `API error ${res.status}`);
  }
  return res.json();
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });
  return handleResponse<T>(res);
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  return handleResponse<T>(res);
}
