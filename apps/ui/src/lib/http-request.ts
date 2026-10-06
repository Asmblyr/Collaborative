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

export async function readJsonResponse<T>(response: Response): Promise<T> {
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
        : (response.headers.get("x-request-id") ?? undefined);
    throw new HttpError(message, response.status, code, requestId);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new HttpError(
      "Некорректный ответ сервера",
      response.status,
      "INVALID_RESPONSE",
      response.headers.get("x-request-id") ?? undefined,
    );
  }
}

export function requestErrorMessage(
  error: unknown,
  fallback = "Не удалось связаться с сервером",
): string {
  if (error instanceof HttpError) {
    if (error.status === 401) {
      return "Сессия истекла. Войдите снова.";
    }
    if (error.status === 403) {
      return "Нет доступа к этому действию или записи.";
    }
    if (error.status === 408 || error.status === 504) {
      return "Сервер не ответил вовремя. Попробуйте ещё раз.";
    }
    if (error.status >= 500) {
      return "Сервис временно недоступен. Попробуйте позже.";
    }
    return error.message;
  }
  if (error instanceof Error && error.name === "TimeoutError") {
    return "Сервер не ответил вовремя. Попробуйте ещё раз.";
  }
  return fallback;
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
  return readJsonResponse<T>(response);
}
