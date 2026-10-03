import { requestJson } from "./http-request";

// Access screens consume the full envelope, including invitation metadata.
export function accessRequest<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  return requestJson<T>(`/api${path}`, method, body);
}
