import { coreAddress } from "./session";
import { readJsonResponse } from "./http-request";

/** Server-side reads with the caller's session; browser requests go directly to Core. */
export async function readCoreResource<T>(
  token: string,
  path: string,
  timeoutMs = 5000,
): Promise<T> {
  const response = await fetch(coreAddress(path), {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const result = await readJsonResponse<{ data: T }>(response);
  return result.data;
}
