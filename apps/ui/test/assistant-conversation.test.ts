import assert from "node:assert/strict";
import test from "node:test";
import type { AssistantTurnSummary } from "@asmblyr/contracts";
import { usageLabel } from "../src/components/assistant/assistant-usage";
import {
  conversationInput,
  welcomeMessage,
  type AssistantMessage,
  type AssistantStatus,
} from "../src/components/assistant/assistant-types";
import {
  canApplyProposal,
  contextLabel,
  contextScope,
  type PageContext,
  type FilterProposal,
} from "../src/components/assistant/assistant-context-types";

const status: AssistantStatus = {
  available: true,
  limits: { maxMessages: 5, maxMessageChars: 8000, maxConversationChars: 32 },
};

test("turn summaries distinguish unknown/partial usage and stay out of model history", () => {
  const summary: AssistantTurnSummary = {
    turnId: "turn",
    requestedModel: "requested",
    models: ["actual"],
    modelCalls: 2,
    toolCalls: 1,
    toolErrors: 0,
    durationMs: 1000,
    status: "succeeded",
    errorCode: null,
    usage: {
      inputTokens: 12,
      outputTokens: 0,
      totalTokens: null,
      cachedTokens: null,
      reasoningTokens: null,
    },
    usageSamples: {
      inputTokens: 1,
      outputTokens: 2,
      totalTokens: 0,
      cachedTokens: 0,
      reasoningTokens: 0,
    },
  };
  assert.equal(usageLabel(summary, "inputTokens"), "≥ 12");
  assert.equal(usageLabel(summary, "outputTokens"), "0");
  assert.equal(usageLabel(summary, "totalTokens"), "—");
  const input = conversationInput(
    [
      { id: "1", role: "user", content: "hello" },
      { id: "2", role: "assistant", content: "answer", summary },
    ],
    "next",
    status,
  );
  assert.deepEqual(input, [
    { role: "user", content: "hello" },
    { role: "assistant", content: "answer" },
    { role: "user", content: "next" },
  ]);
});

test("AI context omits the UI greeting and discards complete old turns within both budgets", () => {
  const messages: AssistantMessage[] = [
    welcomeMessage,
    ...Array.from(
      { length: 10 },
      (_, index): AssistantMessage => ({
        id: String(index),
        role: index % 2 ? "assistant" : "user",
        content: `turn ${index}`,
      }),
    ),
  ];
  const sent = conversationInput(messages, "next", status);
  assert.deepEqual(sent, [
    { role: "user", content: "turn 6" },
    { role: "assistant", content: "turn 7" },
    { role: "user", content: "turn 8" },
    { role: "assistant", content: "turn 9" },
    { role: "user", content: "next" },
  ]);
  assert.equal(messages.length, 11);
  assert.deepEqual(conversationInput(messages, "long next prompt", status), [
    { role: "user", content: "turn 8" },
    { role: "assistant", content: "turn 9" },
    { role: "user", content: "long next prompt" },
  ]);
});

test("filter actions stay bound to the original page/workspace and refuse open editors", () => {
  const context: PageContext = {
    page: "items",
    collection: "articles",
    workspaceId: "workspace-one",
    table: {
      page: 1,
      size: 25,
      sort: "id",
      direction: "asc",
      q: "",
      filter: "",
      selectedCount: 0,
      editorOpen: false,
    },
  };
  const proposal: FilterProposal = {
    type: "filter",
    collection: "articles",
    collectionId: "stable-id",
    workspaceId: "workspace-one",
    filter: { logic: "and", children: [] },
  };
  assert.equal(canApplyProposal(context, proposal), true);
  assert.equal(
    contextLabel(context, () => "Статьи"),
    "Статьи",
  );
  assert.equal(contextLabel(context), "articles");
  assert.equal(
    contextLabel(context, () => undefined),
    "articles",
  );
  assert.equal(
    canApplyProposal(
      { ...context, collection: "other_articles" },
      { ...proposal, collectionDisplayName: "Статьи" },
    ),
    false,
  );
  for (const changed of [
    null,
    { ...context, page: "files" },
    { ...context, collection: "users" },
    { ...context, workspaceId: "workspace-two" },
    { ...context, table: { ...context.table!, editorOpen: true } },
  ]) {
    assert.equal(canApplyProposal(changed, proposal), false);
  }
  assert.notEqual(contextScope(context), contextScope(null));
  assert.notEqual(
    contextScope(context),
    contextScope({ ...context, collection: "users" }),
  );
  assert.equal(
    contextScope(context),
    contextScope({
      ...context,
      table: { ...context.table!, selectedCount: 3 },
    }),
  );
});
