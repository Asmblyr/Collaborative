import OpenAI from "openai";
import type { AssistantTurnSummary } from "@asmblyr/contracts";
import {
  responseMetadata,
  type AssistantResponseMetadata,
} from "./telemetry/usage.js";

export class AssistantProviderError extends Error {
  summary?: AssistantTurnSummary;
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly metadata?: AssistantResponseMetadata,
  ) {
    super(message);
  }
}

/** Carries only allowlisted metadata when a provider stream ends prematurely. */
export class AssistantStreamError extends Error {
  constructor(
    cause: unknown,
    readonly metadata: AssistantResponseMetadata,
  ) {
    super("Assistant provider stream failed", { cause });
  }
}

export function checkAssistantSignal(
  timeout: AbortSignal,
  external?: AbortSignal,
): void {
  if (external?.aborted)
    throw new AssistantProviderError(
      499,
      "assistant_cancelled",
      "Запрос отменён",
    );
  if (timeout.aborted)
    throw new AssistantProviderError(
      504,
      "assistant_timeout",
      "Ассистент не успел ответить. Попробуйте ещё раз или уменьшите глубину размышления.",
    );
}

function connectionDenied(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== "object" || depth > 4) return false;
  if ("code" in error && (error.code === "EACCES" || error.code === "EPERM"))
    return true;
  if ("cause" in error && connectionDenied(error.cause, depth + 1)) return true;
  if (error instanceof AggregateError) {
    return error.errors
      .slice(0, 8)
      .some((cause) => connectionDenied(cause, depth + 1));
  }
  return false;
}

export function providerFailure(
  error: unknown,
  api: "responses" | "chat-completions",
  zai: boolean,
  timeout: AbortSignal,
  external?: AbortSignal,
): AssistantProviderError {
  if (error instanceof AssistantStreamError) {
    const failure = providerFailure(error.cause, api, zai, timeout, external);
    return new AssistantProviderError(
      failure.statusCode,
      failure.code,
      failure.message,
      {
        ...error.metadata,
        requestId: failure.metadata?.requestId ?? error.metadata.requestId,
      },
    );
  }
  if (error instanceof AssistantProviderError) return error;
  const metadata =
    error instanceof OpenAI.APIError
      ? responseMetadata({ request_id: error.requestID }, api)
      : undefined;
  if (external?.aborted)
    return new AssistantProviderError(
      499,
      "assistant_cancelled",
      "Запрос отменён",
      metadata,
    );
  if (timeout.aborted || error instanceof OpenAI.APIConnectionTimeoutError) {
    return new AssistantProviderError(
      504,
      "assistant_timeout",
      "Ассистент не успел ответить. Попробуйте ещё раз или уменьшите глубину размышления.",
      metadata,
    );
  }
  if (error instanceof OpenAI.APIConnectionError) {
    if (connectionDenied(error)) {
      return new AssistantProviderError(
        503,
        "assistant_network_denied",
        "Core не может подключиться к AI-провайдеру: сетевое соединение запрещено средой запуска сервиса.",
        metadata,
      );
    }
    return new AssistantProviderError(
      502,
      "assistant_network",
      "Core не смог установить соединение с AI-провайдером. Проверьте сеть и настройки подключения сервиса.",
      metadata,
    );
  }
  if (error instanceof OpenAI.APIError) {
    if (
      error.code === "insufficient_quota" ||
      (zai && String(error.code) === "1113")
    ) {
      return new AssistantProviderError(
        503,
        "assistant_quota",
        "У AI-провайдера недостаточно баланса или нет подходящего пакета. Администратору нужно проверить тариф и адрес API.",
        metadata,
      );
    }
    if (error.status === 429)
      return new AssistantProviderError(
        429,
        "assistant_provider_limit",
        "Достигнут лимит провайдера. Попробуйте позже.",
        metadata,
      );
    if ([400, 401, 403, 404, 422].includes(error.status ?? 0)) {
      return new AssistantProviderError(
        503,
        "assistant_configuration",
        "Проверьте доступ к модели и настройки AI-провайдера в Core.",
        metadata,
      );
    }
  }
  return new AssistantProviderError(
    502,
    "assistant_unavailable",
    "AI-провайдер временно недоступен. Попробуйте позже.",
    metadata,
  );
}
