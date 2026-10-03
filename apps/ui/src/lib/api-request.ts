import { requestJson } from "./http-request";

export async function apiRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await requestJson<{ data: T } | undefined>(
    path,
    method,
    body,
  );
  return response?.data as T;
}
