import assert from "node:assert/strict";
import test from "node:test";
import type { AssistantHistoryMessage } from "@asmblyr-collaborative/contracts";
import {
  restoreAssistantMessages,
  prependAssistantHistory,
} from "../src/components/assistant/assistant-history-messages";

test("restoring history preserves text and status without replaying action cards", () => {
  const saved: AssistantHistoryMessage[] = [
    {
      id: "reply",
      role: "assistant",
      content: "Stopped reply",
      activity: [{ kind: "note", text: "Public work note" }],
      status: "cancelled",
      createdAt: "2026-10-05T00:00:00Z",
      contextScope: "chat",
      contextLabel: "",
      truncated: false,
      summary: null,
    },
  ];
  const messages = restoreAssistantMessages(saved);
  assert.equal(messages[0].content, "Stopped reply");
  assert.deepEqual(messages[0].activity, saved[0].activity);
  assert.equal(messages[0].cancelled, true);
  assert.equal(messages[0].connectionWrites, undefined);
  assert.equal(messages[0].pluginResults, undefined);
  assert.equal(messages[0].proposals, undefined);
});

test("loading earlier messages keeps current replies in order without duplicates", () => {
  const older = [
    { id: "a", role: "user" as const, content: "Old" },
    { id: "b", role: "assistant" as const, content: "Answer" },
  ];
  const current = [
    { id: "welcome", role: "assistant" as const, content: "Welcome" },
    older[1],
    { id: "c", role: "user" as const, content: "New" },
  ];
  assert.deepEqual(
    prependAssistantHistory(current, older).map((message) => message.id),
    ["a", "b", "c"],
  );
});
