import { ApiError, responseError } from "./error.js";
import type { ClientOptions, RequestOptions } from "./options.js";

export interface Transport {
  get<Result>(
    path: string,
    query?: URLSearchParams,
    options?: RequestOptions,
  ): Promise<Result>;
  write<Result>(
    method: "POST" | "PATCH" | "DELETE",
    path: string,
    body?: object,
    options?: RequestOptions,
  ): Promise<Result>;
}

function apiRoot(value: string): string {
  if (typeof value !== "string" || !value || value !== value.trim()) {
    throw new TypeError(
      "baseUrl must be an absolute HTTP URL or a root-relative path",
    );
  }
  const relative = value.startsWith("/") && !value.startsWith("//");
  const url = new URL(value, relative ? "http://asmblyr.local" : undefined);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    value.includes("\\")
  ) {
    throw new TypeError(
      "baseUrl must be an HTTP API root without credentials, query or fragment",
    );
  }
  return (relative ? url.pathname : url.href).replace(/\/+$/, "");
}

function validateTimeout(timeoutMs: number): number {
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 0 ||
    timeoutMs > 2_147_483_647
  ) {
    throw new TypeError(
      "timeoutMs must be a nonnegative integer up to 2147483647",
    );
  }
  return timeoutMs;
}

export function createTransport(options: ClientOptions): Transport {
  const root = apiRoot(options.baseUrl);
  const defaultTimeout = validateTimeout(options.timeoutMs ?? 10_000);
  const baseHeaders = new Headers(options.headers);
  const {
    accessToken,
    credentials = "same-origin",
    fetch: customFetch,
  } = options;
  const send = customFetch ?? ((input, init) => globalThis.fetch(input, init));

  async function request<Result>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    query?: URLSearchParams,
    body?: object,
    options: RequestOptions = {},
  ): Promise<Result> {
    options.signal?.throwIfAborted();
    const timeoutMs = validateTimeout(options.timeoutMs ?? defaultTimeout);
    const headers = new Headers(baseHeaders);
    headers.set("accept", "application/json");
    const payload = body === undefined ? undefined : JSON.stringify(body);
    if (payload !== undefined) headers.set("content-type", "application/json");
    const token =
      typeof accessToken === "function" ? await accessToken() : accessToken;
    if (token !== undefined) headers.set("authorization", `Bearer ${token}`);
    const signals: AbortSignal[] = [];
    if (options.signal) signals.push(options.signal);
    if (timeoutMs) signals.push(AbortSignal.timeout(timeoutMs));
    const signal = signals.length ? AbortSignal.any(signals) : undefined;
    signal?.throwIfAborted();
    const suffix = query?.size ? `?${query}` : "";
    const response = await send(`${root}${path}${suffix}`, {
      method,
      body: payload,
      headers,
      credentials,
      cache: "no-store",
      signal,
      // A redirect must not forward caller credentials to another API.
      redirect: "error",
    });
    if (!response.ok) {
      const failure = await responseError(response);
      signal?.throwIfAborted();
      throw failure;
    }
    if (response.status === 204) return undefined as Result;
    try {
      return (await response.json()) as Result;
    } catch (error) {
      if (signal?.aborted || !(error instanceof SyntaxError)) throw error;
      throw new ApiError(
        "API returned invalid JSON",
        response.status,
        "INVALID_RESPONSE",
      );
    }
  }
  return {
    get: (path, query, options) =>
      request("GET", path, query, undefined, options),
    write: (method, path, body, options) =>
      request(method, path, undefined, body, options),
  };
}
