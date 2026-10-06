import type { ConnectionWriteProposal } from "@asmblyr-collaborative/contracts";
import { HttpError, requestJson } from "@/lib/http-request";
import {
  canDecideWrite,
  parseConnectionWriteDetail,
  verifiedWriteState,
  writeReadFailure,
  type WriteCardState,
} from "./connection-write-state";

function path(proposal: ConnectionWriteProposal): string {
  return `/api/connections/google/writes/${encodeURIComponent(proposal.id)}`;
}

export async function readConnectionWrite(
  proposal: ConnectionWriteProposal,
  signal?: AbortSignal,
) {
  const timeout = AbortSignal.timeout(8000);
  const response = await requestJson<{ data: unknown }>(
    path(proposal),
    "GET",
    undefined,
    signal ? AbortSignal.any([signal, timeout]) : timeout,
  );
  return parseConnectionWriteDetail(response.data, proposal);
}

export function connectionWriteReadFailure(
  state: WriteCardState,
  error: unknown,
): WriteCardState {
  return writeReadFailure(
    state,
    error instanceof HttpError && error.status === 404,
  );
}

/** Reconciliation is GET-only. A lost confirmation response must never trigger another write. */
export async function decideConnectionWrite(
  proposal: ConnectionWriteProposal,
  state: WriteCardState,
  confirm: boolean,
): Promise<WriteCardState> {
  if (!canDecideWrite(state)) {
    throw new Error("Write decision is unavailable");
  }
  let outcome: WriteCardState = {
    ...state,
    status: "uncertain",
    attempted: true,
    refreshFailed: false,
  };
  try {
    const response = await requestJson<{
      data: { status?: unknown; cancelled?: unknown };
    }>(
      path(proposal) + (confirm ? "/confirm" : ""),
      confirm ? "POST" : "DELETE",
      confirm ? {} : undefined,
      AbortSignal.timeout(60000),
    );
    if (confirm && response.data.status === "succeeded") {
      outcome.status = "succeeded";
    } else if (!confirm && response.data.cancelled === true) {
      outcome.status = "cancelled";
    }
  } catch (error) {
    if (
      error instanceof HttpError &&
      error.code === "connection_target_changed"
    ) {
      outcome = {
        ...outcome,
        status: "failed",
        detail: state.detail
          ? { ...state.detail, status: "failed", failure: "target_changed" }
          : null,
      };
    }
  }
  try {
    const detail = await readConnectionWrite(proposal);
    // Pending can be a read racing a request still in transit; never unlock a second decision.
    if (detail.status !== "pending") {
      return verifiedWriteState(detail, true);
    }
    return outcome;
  } catch (error) {
    return connectionWriteReadFailure(outcome, error);
  }
}
