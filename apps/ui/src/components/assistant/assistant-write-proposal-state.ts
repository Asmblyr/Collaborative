import { HttpError, localizedRequestError } from "@/lib/http-request";
import { originalCopy, type UiCopy } from "@/lib/ui-copy-types";
import { formatFilterDecimal } from "./assistant-filter-format";
import type { AssistantWriteProposalCard } from "./assistant-types";

export type WriteProposalUiStatus =
  | "pending"
  | "confirming"
  | "rejecting"
  | "confirmed"
  | "rejected";

export interface WriteProposalUiState {
  status: WriteProposalUiStatus;
  recordId: string | null;
  error: string | null;
  errorCode: string | null;
}

export interface WriteProposalConfirmResponse {
  status: "confirmed";
  proposalId: string;
  recordId: string | null;
  collection: string;
}

export interface WriteProposalRejectResponse {
  status: "rejected";
  proposalId: string;
}

export function initialWriteProposalState(
  proposal: Pick<AssistantWriteProposalCard, "status" | "recordId">,
): WriteProposalUiState {
  return {
    status: proposal.status,
    recordId: proposal.recordId,
    error: null,
    errorCode: null,
  };
}

export function beginWriteProposalAction(
  state: WriteProposalUiState,
  action: "confirm" | "reject",
): WriteProposalUiState {
  if (state.status !== "pending") {
    return state;
  }
  return {
    ...state,
    status: action === "confirm" ? "confirming" : "rejecting",
    error: null,
    errorCode: null,
  };
}

export function completeWriteProposalConfirm(
  state: WriteProposalUiState,
  response: Pick<WriteProposalConfirmResponse, "recordId">,
): WriteProposalUiState {
  return {
    status: "confirmed",
    recordId: response.recordId ?? state.recordId,
    error: null,
    errorCode: null,
  };
}

export function completeWriteProposalReject(
  state: WriteProposalUiState,
): WriteProposalUiState {
  return {
    status: "rejected",
    recordId: state.recordId,
    error: null,
    errorCode: null,
  };
}

export function resolveWriteProposalError(
  error: unknown,
  copy: UiCopy = originalCopy,
): {
  message: string;
  code: string | null;
  terminalStatus?: "confirmed" | "rejected";
} {
  if (error instanceof HttpError) {
    const code = error.code ?? null;
    if (error.status === 403 || code === "PERMISSION_DENIED") {
      return {
        message: copy("Нет доступа для выполнения этой операции."),
        code: code ?? "PERMISSION_DENIED",
      };
    }
    if (code === "ITEM_CHANGED") {
      return {
        message: copy(
          "Запись была изменена другим пользователем. Запросите новое предложение.",
        ),
        code,
      };
    }
    if (code === "PROPOSAL_EXPIRED") {
      return {
        message: copy("Срок действия предложения истёк. Запросите его заново."),
        code,
      };
    }
    if (code === "PROPOSAL_REJECTED") {
      return {
        message: copy("Предложение уже отменено."),
        code,
        terminalStatus: "rejected",
      };
    }
    if (code === "PROPOSAL_CONFIRMED") {
      return {
        message: copy("Предложение уже подтверждено."),
        code,
        terminalStatus: "confirmed",
      };
    }
    if (code === "PROPOSAL_IN_PROGRESS") {
      return {
        message: copy(
          "Операция уже выполняется. Подождите немного и попробуйте снова.",
        ),
        code,
      };
    }
    if (code === "SCHEMA_CHANGED") {
      return {
        message: copy(
          "Схема коллекции изменилась. Запросите новое предложение.",
        ),
        code,
      };
    }
    if (error.status === 404 || code === "PROPOSAL_NOT_FOUND") {
      return {
        message: copy("Предложение больше недоступно. Возможно, оно устарело."),
        code: code ?? "PROPOSAL_NOT_FOUND",
      };
    }
    return {
      message: localizedRequestError(
        error,
        copy,
        "Не удалось выполнить действие.",
      ),
      code,
    };
  }
  return {
    message: localizedRequestError(
      error,
      copy,
      "Не удалось выполнить действие.",
    ),
    code: null,
  };
}

export function failWriteProposalAction(
  state: WriteProposalUiState,
  error: unknown,
  copy: UiCopy = originalCopy,
): WriteProposalUiState {
  const resolved = resolveWriteProposalError(error, copy);
  return {
    status: resolved.terminalStatus ?? "pending",
    recordId: state.recordId,
    error: resolved.message,
    errorCode: resolved.code,
  };
}

export function formatProposalValue(
  value: unknown,
  copy: UiCopy = originalCopy,
): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (typeof value === "boolean") {
    return value ? copy("Да") : copy("Нет");
  }
  if (typeof value === "number") {
    return formatFilterDecimal(String(value));
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return "—";
    }
    return formatFilterDecimal(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "—";
    }
    const allPrimitive = value.every(
      (entry) =>
        entry === null ||
        typeof entry === "string" ||
        typeof entry === "number" ||
        typeof entry === "boolean",
    );
    if (allPrimitive) {
      return value.map((entry) => formatProposalValue(entry, copy)).join(", ");
    }
    return JSON.stringify(value);
  }
  return JSON.stringify(value);
}
