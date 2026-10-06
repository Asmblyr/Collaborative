import type {
  ConnectionWriteDetail,
  ConnectionWriteProposal,
  ConnectionWriteStatus,
} from "@asmblyr-collaborative/contracts";

export type WriteCardStatus =
  | ConnectionWriteStatus
  | "checking"
  | "submitting"
  | "unavailable"
  | "check_failed";
export interface WriteCardState {
  status: WriteCardStatus;
  detail: ConnectionWriteDetail | null;
  attempted: boolean;
  refreshFailed: boolean;
}

const statuses = new Set<ConnectionWriteStatus>([
  "pending",
  "executing",
  "cancelled",
  "succeeded",
  "failed",
  "uncertain",
]);
const terminal = new Set<WriteCardStatus>([
  "cancelled",
  "succeeded",
  "failed",
  "uncertain",
  "executing",
]);

export function safeGoogleWriteUrl(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  try {
    const url = new URL(value);
    const allowedPath =
      (url.hostname === "drive.google.com" &&
        /^\/file\/d\/[A-Za-z0-9_-]+\/view$/.test(url.pathname)) ||
      (url.hostname === "docs.google.com" &&
        /^\/spreadsheets\/d\/[A-Za-z0-9_-]+\/edit$/.test(url.pathname));
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      allowedPath
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function parseConnectionWriteDetail(
  value: unknown,
  proposal: ConnectionWriteProposal,
): ConnectionWriteDetail {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid write detail");
  }
  const body = value as ConnectionWriteDetail;
  if (
    body.id !== proposal.id ||
    body.provider !== "google" ||
    body.operation !== proposal.operation ||
    !statuses.has(body.status) ||
    typeof body.target !== "string" ||
    typeof body.title !== "string" ||
    typeof body.content !== "string" ||
    typeof body.expiresAt !== "string" ||
    !Number.isFinite(Date.parse(body.expiresAt)) ||
    (body.failure != null && body.failure !== "target_changed")
  ) {
    throw new Error("Invalid write detail");
  }
  const result = body.result ?? null;
  if (result !== null) {
    const validCount = (count: unknown) =>
      count === null ||
      (typeof count === "number" && Number.isSafeInteger(count) && count >= 0);
    if (
      typeof result !== "object" ||
      !validCount(result.updatedCells) ||
      !validCount(result.updatedRows) ||
      (result.range !== null &&
        (typeof result.range !== "string" || result.range.length > 200))
    ) {
      throw new Error("Invalid write receipt");
    }
  }
  return {
    ...body,
    url: safeGoogleWriteUrl(body.url),
    result: result ? { ...result, url: safeGoogleWriteUrl(result.url) } : null,
    failure: body.failure ?? null,
  };
}

export function verifiedWriteState(
  detail: ConnectionWriteDetail,
  attempted = false,
): WriteCardState {
  return {
    status:
      attempted && detail.status === "pending" ? "uncertain" : detail.status,
    detail,
    attempted,
    refreshFailed: false,
  };
}

export function canDecideWrite(
  state: WriteCardState,
  now = Date.now(),
): boolean {
  return (
    !state.attempted &&
    state.status === "pending" &&
    state.detail?.status === "pending" &&
    Date.parse(state.detail.expiresAt) > now
  );
}

export function writeReadFailure(
  state: WriteCardState,
  unavailable: boolean,
): WriteCardState {
  if (terminal.has(state.status)) {
    return { ...state, refreshFailed: true };
  }
  return {
    ...state,
    status: unavailable ? "unavailable" : "check_failed",
    refreshFailed: true,
  };
}
