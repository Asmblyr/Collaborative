import assert from "node:assert/strict";
import test from "node:test";
import {
  AssistantStatusRequestError,
  parseAssistantStatus,
  requestAssistantStatus,
} from "../src/components/assistant/assistant-status-request";
import {
  assistantStatusState,
  initialAssistantStatus,
  showAssistantWidget,
  supportedAssistantSettings,
} from "../src/components/assistant/assistant-status-state";
import type { AssistantStatus } from "../src/components/assistant/assistant-types";

const available: AssistantStatus = {
  available: true,
  model: "test-model",
  limits: {
    maxMessages: 31,
    maxMessageChars: 8000,
    maxConversationChars: 32000,
  },
  settings: {
    reasoningOptions: ["low", "high"],
    defaultEffort: "low",
    thinking: "optional",
    defaultThinking: false,
  },
};

test("technical failure keeps the widget and last configuration through retry", () => {
  const ready = assistantStatusState(initialAssistantStatus, {
    type: "loaded",
    status: available,
  });
  const failed = assistantStatusState(ready, {
    type: "failed",
    failure: "request",
  });
  assert.equal(failed.phase, "error");
  assert.equal(failed.status, available);
  assert.equal(showAssistantWidget(failed, false), true);
  const loading = assistantStatusState(failed, { type: "loading" });
  assert.equal(showAssistantWidget(loading, false), true);
  assert.equal(loading.status, available);
  const restored = assistantStatusState(loading, {
    type: "loaded",
    status: available,
  });
  assert.equal(restored.phase, "ready");
  assert.equal(restored.failure, undefined);
  assert.equal(ready.phase, "ready");
});

test("initial errors differ from confirmed disabled and denied states without closing an open chat", () => {
  assert.equal(showAssistantWidget(initialAssistantStatus, false), false);
  const failed = assistantStatusState(initialAssistantStatus, {
    type: "failed",
    failure: "request",
  });
  assert.equal(showAssistantWidget(failed, false), true);
  assert.equal(
    showAssistantWidget(
      assistantStatusState(failed, { type: "loading" }),
      false,
    ),
    true,
  );
  const disabled = assistantStatusState(failed, {
    type: "loaded",
    status: { available: false },
  });
  assert.equal(disabled.phase, "disabled");
  assert.equal(disabled.failure, undefined);
  assert.equal(showAssistantWidget(disabled, false), false);
  assert.equal(showAssistantWidget(disabled, true), true);
  for (const failure of ["session", "access"] as const) {
    const denied = assistantStatusState(initialAssistantStatus, {
      type: "failed",
      failure,
    });
    assert.equal(denied.phase, "denied");
    assert.equal(showAssistantWidget(denied, false), false);
    assert.equal(showAssistantWidget(denied, true), true);
  }
});

test("confirmed capabilities preserve supported preferences and remove unavailable options", () => {
  const preferences = { reasoningEffort: "high" as const, thinking: true };
  assert.deepEqual(
    supportedAssistantSettings(preferences, available),
    preferences,
  );
  const replacement: AssistantStatus = {
    ...available,
    settings: {
      ...available.settings!,
      reasoningOptions: [],
      defaultEffort: null,
      thinking: "required",
    },
  };
  assert.deepEqual(supportedAssistantSettings(preferences, replacement), {});
  assert.deepEqual(preferences, { reasoningEffort: "high", thinking: true });
});

test("invalid status payloads are failures instead of silently disabling the assistant", () => {
  assert.deepEqual(parseAssistantStatus({ data: available }), available);
  assert.deepEqual(parseAssistantStatus({ data: { available: false } }), {
    available: false,
  });
  for (const invalid of [
    null,
    {},
    { data: {} },
    { data: { available: "false" } },
    { data: { available: true } },
    { data: { ...available, model: [] } },
    {
      data: {
        ...available,
        limits: { ...available.limits, maxMessageChars: 0 },
      },
    },
    {
      data: {
        ...available,
        settings: { ...available.settings, reasoningOptions: null },
      },
    },
    {
      data: {
        ...available,
        settings: { ...available.settings, defaultEffort: "max" },
      },
    },
    {
      data: {
        ...available,
        settings: { ...available.settings, thinking: ["optional"] },
      },
    },
  ]) {
    assert.throws(
      () => parseAssistantStatus(invalid),
      AssistantStatusRequestError,
    );
  }
});

test("status HTTP failures distinguish expired session, denied access and server failure", async () => {
  for (const [status, failure] of [
    [401, "session"],
    [403, "access"],
    [503, "request"],
    [502, "request"],
  ] as const) {
    const fetchStatus: typeof fetch = async () =>
      Response.json(
        { message: "private diagnostics must not be shown" },
        { status },
      );
    await assert.rejects(
      requestAssistantStatus(new AbortController().signal, fetchStatus),
      (error: unknown) => {
        assert.ok(error instanceof AssistantStatusRequestError);
        assert.equal(error.failure, failure);
        assert.ok(!error.message.includes("private diagnostics"));
        return true;
      },
    );
  }
  const malformed: typeof fetch = async () =>
    new Response("<html>unavailable</html>");
  await assert.rejects(
    requestAssistantStatus(new AbortController().signal, malformed),
    SyntaxError,
  );
});

test("status requests are uncached, use the cancellation signal and recover after a network failure", async () => {
  const controller = new AbortController();
  const failedFetch: typeof fetch = async (url, options) => {
    assert.equal(url, "/api/assistant/status");
    assert.equal(options?.cache, "no-store");
    assert.equal(options?.signal, controller.signal);
    return new Promise<Response>((_, reject) => {
      options.signal!.addEventListener(
        "abort",
        () => reject(options.signal!.reason),
        { once: true },
      );
    });
  };
  const pending = requestAssistantStatus(controller.signal, failedFetch);
  controller.abort(new DOMException("Timed out", "TimeoutError"));
  await assert.rejects(pending, { name: "TimeoutError" });
  const networkFailure: typeof fetch = async () => {
    throw new TypeError("Network failed");
  };
  await assert.rejects(
    requestAssistantStatus(new AbortController().signal, networkFailure),
    TypeError,
  );
  const healthyFetch: typeof fetch = async () =>
    Response.json({ data: available });
  assert.deepEqual(
    await requestAssistantStatus(new AbortController().signal, healthyFetch),
    available,
  );
});
