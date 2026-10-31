import type { UiCopy } from "./ui-copy-types";

const ACTION_FAILED_MESSAGE = "Не удалось выполнить действие";
const INVALID_RESPONSE_MESSAGE = "Некорректный ответ сервера";
const NETWORK_FAILED_MESSAGE = "Не удалось связаться с сервером";

export type RequestFailureKind =
  | "unauthorized"
  | "forbidden"
  | "conflict"
  | "timeout"
  | "unavailable"
  | "invalid_response"
  | "client_error"
  | "network";

export interface ClassifiedRequestFailure {
  kind: RequestFailureKind;
  status?: number;
  code?: string;
  requestId?: string;
  serverMessage?: string;
}

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

export function classifyRequestError(error: unknown): ClassifiedRequestFailure {
  if (error instanceof HttpError) {
    const serverMessage =
      error.message !== ACTION_FAILED_MESSAGE &&
      error.message !== INVALID_RESPONSE_MESSAGE
        ? error.message
        : undefined;

    if (error.code === "INVALID_RESPONSE") {
      return {
        kind: "invalid_response",
        status: error.status,
        code: error.code,
        requestId: error.requestId,
      };
    }
    if (error.status === 401) {
      return {
        kind: "unauthorized",
        status: error.status,
        code: error.code,
        requestId: error.requestId,
        serverMessage,
      };
    }
    if (error.status === 403) {
      return {
        kind: "forbidden",
        status: error.status,
        code: error.code,
        requestId: error.requestId,
        serverMessage,
      };
    }
    if (error.status === 409) {
      return {
        kind: "conflict",
        status: error.status,
        code: error.code,
        requestId: error.requestId,
        serverMessage,
      };
    }
    if (error.status === 408 || error.status === 504) {
      return {
        kind: "timeout",
        status: error.status,
        code: error.code,
        requestId: error.requestId,
        serverMessage,
      };
    }
    if (error.status >= 500) {
      return {
        kind: "unavailable",
        status: error.status,
        code: error.code,
        requestId: error.requestId,
        serverMessage,
      };
    }
    return {
      kind: "client_error",
      status: error.status,
      code: error.code,
      requestId: error.requestId,
      serverMessage,
    };
  }

  if (error instanceof Error && error.name === "TimeoutError") {
    return { kind: "timeout" };
  }

  return { kind: "network" };
}

export async function readJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const result: unknown = await response.json().catch(() => null);
    const error = result && typeof result === "object" ? result : {};
    const message =
      "message" in error && typeof error.message === "string"
        ? error.message
        : ACTION_FAILED_MESSAGE;
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
      INVALID_RESPONSE_MESSAGE,
      response.status,
      "INVALID_RESPONSE",
      response.headers.get("x-request-id") ?? undefined,
    );
  }
}

export function requestErrorMessage(
  error: unknown,
  fallback = NETWORK_FAILED_MESSAGE,
): string {
  const classified = classifyRequestError(error);
  if (classified.kind === "unauthorized") {
    return "Сессия истекла. Войдите снова.";
  }
  if (classified.kind === "forbidden") {
    return "Нет доступа к этому действию или записи.";
  }
  if (classified.kind === "timeout") {
    return "Сервер не ответил вовремя. Попробуйте ещё раз.";
  }
  if (classified.kind === "unavailable") {
    return "Сервис временно недоступен. Попробуйте позже.";
  }
  if (classified.kind === "invalid_response") {
    return INVALID_RESPONSE_MESSAGE;
  }
  if (error instanceof HttpError) {
    return error.message;
  }
  return fallback;
}

export function localizedRequestError(
  error: unknown,
  copy: UiCopy,
  fallback = NETWORK_FAILED_MESSAGE,
): string {
  const classified = classifyRequestError(error);
  if (classified.kind === "unauthorized") {
    return copy("Сессия истекла. Войдите снова.");
  }
  if (classified.kind === "forbidden") {
    return copy("Нет доступа к этому действию или записи.");
  }
  if (classified.kind === "timeout") {
    return copy("Сервер не ответил вовремя. Попробуйте ещё раз.");
  }
  if (classified.kind === "unavailable") {
    return copy("Сервис временно недоступен. Попробуйте позже.");
  }
  if (classified.kind === "invalid_response") {
    return copy("Некорректный ответ сервера");
  }
  if (classified.serverMessage) {
    return classified.serverMessage;
  }
  if (error instanceof HttpError) {
    return copy("Не удалось выполнить действие");
  }
  if (
    error instanceof Error &&
    error.message &&
    !(error instanceof TypeError)
  ) {
    return error.message;
  }
  return copy(fallback);
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
