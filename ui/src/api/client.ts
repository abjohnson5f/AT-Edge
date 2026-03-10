import { ATResponse } from "../types";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001/api";

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ ResponseMessage: res.statusText }));
    throw new Error(err.ResponseMessage ?? `API error ${res.status}`);
  }
  return res.json();
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ ResponseMessage: res.statusText }));
    throw new Error(err.ResponseMessage ?? `API error ${res.status}`);
  }
  return res.json();
}
