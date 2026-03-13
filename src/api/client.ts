import { config, requireConfig } from "../config.js";
import type { ATResponse } from "./types.js";

export class ATClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(apiKey?: string) {
    this.baseUrl = config.at.baseUrl;
    this.apiKey = apiKey ?? requireConfig("AT_API_KEY", config.at.apiKey);
  }

  async request<T = unknown>(
    endpoint: string,
    params: Record<string, unknown> | object = {}
  ): Promise<ATResponse<T>> {
    const url = new URL(`${this.baseUrl}/${endpoint}`);
    url.searchParams.set("key", this.apiKey);

    for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(
          key,
          typeof value === "object" ? JSON.stringify(value) : String(value)
        );
      }
    }

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(
        `AT API HTTP ${response.status}: ${response.statusText} for ${endpoint}`
      );
    }

    const data = (await response.json()) as ATResponse<T>;

    if (data.RequestStatus === "Failed") {
      // ResponseMessage may be an object — serialize it so the error is readable
      const msg = typeof data.ResponseMessage === "string"
        ? data.ResponseMessage
        : JSON.stringify(data.ResponseMessage);
      throw new ATAPIError(msg, data.ResponseCode, endpoint);
    }

    return data;
  }

  // Convenience for write operations — enforces dry-run by default
  async write<T = unknown>(
    endpoint: string,
    params: Record<string, unknown> | object,
    execute = false
  ): Promise<ATResponse<T>> {
    return this.request<T>(endpoint, {
      ...params,
      isWritingRequest: execute,
    });
  }
}

export class ATAPIError extends Error {
  constructor(
    message: string,
    public code: number,
    public endpoint: string
  ) {
    super(`[AT-${code}] ${endpoint}: ${message}`);
    this.name = "ATAPIError";
  }
}

// Singleton for shared use
let _client: ATClient | null = null;
export function getClient(): ATClient {
  if (!_client) _client = new ATClient();
  return _client;
}
