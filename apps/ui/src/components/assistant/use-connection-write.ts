"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ConnectionWriteProposal } from "@asmblyr-collaborative/contracts";
import {
  connectionWriteReadFailure,
  decideConnectionWrite,
  readConnectionWrite,
} from "./connection-write-client";
import {
  canDecideWrite,
  verifiedWriteState,
  type WriteCardState,
} from "./connection-write-state";

export function useConnectionWrite(proposal: ConnectionWriteProposal) {
  const [state, setState] = useState<WriteCardState>({
    status: "checking",
    detail: null,
    attempted: false,
    refreshFailed: false,
  });
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const deciding = useRef(false);
  const attempted = useRef(false);
  const request = useRef<AbortController | null>(null);

  const cancelRequests = useCallback(() => {
    generation.current++;
    request.current?.abort();
  }, []);

  async function refresh() {
    if (deciding.current) {
      return;
    }
    const current = ++generation.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    try {
      const detail = await readConnectionWrite(proposal, controller.signal);
      if (current === generation.current) {
        setState(verifiedWriteState(detail, attempted.current));
      }
    } catch (error) {
      if (current === generation.current && !controller.signal.aborted) {
        setState((previous) => connectionWriteReadFailure(previous, error));
      }
    } finally {
      if (current === generation.current) {
        setBusy(false);
      }
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    const current = ++generation.current;
    request.current = controller;
    setBusy(true);
    void readConnectionWrite(proposal, controller.signal)
      .then((detail) => {
        if (current === generation.current && !controller.signal.aborted) {
          setState(verifiedWriteState(detail, attempted.current));
        }
      })
      .catch((error) => {
        if (current === generation.current && !controller.signal.aborted) {
          setState((previous) => connectionWriteReadFailure(previous, error));
        }
      })
      .finally(() => {
        if (current === generation.current && !controller.signal.aborted) {
          setBusy(false);
        }
      });
    return () => {
      controller.abort();
      cancelRequests();
    };
  }, [proposal, cancelRequests]);

  async function decide(confirm: boolean) {
    if (deciding.current || attempted.current || !canDecideWrite(state)) {
      return;
    }
    const current = ++generation.current;
    request.current?.abort();
    deciding.current = true;
    attempted.current = true;
    setBusy(true);
    setState((previous) => ({
      ...previous,
      status: "submitting",
      attempted: true,
    }));
    try {
      const outcome = await decideConnectionWrite(proposal, state, confirm);
      if (current === generation.current) {
        setState(outcome);
      }
    } catch (error) {
      if (current === generation.current) {
        setState((previous) =>
          connectionWriteReadFailure(
            { ...previous, status: "uncertain" },
            error,
          ),
        );
      }
    } finally {
      deciding.current = false;
      if (current === generation.current) {
        setBusy(false);
      }
    }
  }

  return {
    state,
    busy,
    refresh,
    decide,
    canDecide: !busy && canDecideWrite(state),
  };
}
