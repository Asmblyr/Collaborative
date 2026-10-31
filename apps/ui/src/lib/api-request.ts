import { requestJson } from "./http-request";

export async function apiRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await requestJson<{ data: T } | undefined>(
    path,
    method,
    body,
    signal,
  );
  return response?.data as T;
}
