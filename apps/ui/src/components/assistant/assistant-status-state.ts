import type { AssistantSettings, AssistantStatus } from "./assistant-types";

export type AssistantStatusFailure = "session" | "access" | "request";
export interface AssistantStatusState {
  phase: "loading" | "ready" | "disabled" | "denied" | "error";
  status: AssistantStatus | null;
  failure?: AssistantStatusFailure;
}
export type AssistantStatusEvent =
  | { type: "loading" }
  | { type: "loaded"; status: AssistantStatus }
  | { type: "failed"; failure: AssistantStatusFailure };

export const initialAssistantStatus: AssistantStatusState = {
  phase: "loading",
  status: null,
};

export function assistantStatusState(
  state: AssistantStatusState,
  event: AssistantStatusEvent,
): AssistantStatusState {
  if (event.type === "loading") {
    return { ...state, phase: "loading" };
  }
  if (event.type === "loaded") {
    return {
      phase: event.status.available ? "ready" : "disabled",
      status: event.status,
    };
  }
  return {
    ...state,
    phase: event.failure === "request" ? "error" : "denied",
    failure: event.failure,
  };
}

export function showAssistantWidget(
  state: AssistantStatusState,
  open: boolean,
): boolean {
  return (
    open || Boolean(state.status?.available) || state.failure === "request"
  );
}

/** Keep user preferences on failures; sanitize only against confirmed configuration. */
export function supportedAssistantSettings(
  previous: AssistantSettings,
  status: AssistantStatus,
): AssistantSettings {
  return {
    ...(previous.reasoningEffort &&
    status.settings?.reasoningOptions.includes(previous.reasoningEffort)
      ? { reasoningEffort: previous.reasoningEffort }
      : {}),
    ...(status.settings?.thinking === "optional" &&
    previous.thinking !== undefined
      ? { thinking: previous.thinking }
      : {}),
  };
}
