export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export async function requestJson<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    method,
    cache: "no-store",
    signal,
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  if (!response.ok) {
    const result: unknown = await response.json().catch(() => null);
    const error = result && typeof result === "object" ? result : {};
    const message =
      "message" in error && typeof error.message === "string"
        ? error.message
        : "Не удалось выполнить действие";
    const code =
      "code" in error && typeof error.code === "string"
        ? error.code
        : undefined;
    const requestId =
      "requestId" in error && typeof error.requestId === "string"
        ? error.requestId
        : undefined;
    throw new HttpError(message, response.status, code, requestId);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
