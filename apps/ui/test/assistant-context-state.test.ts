import assert from "node:assert/strict";
import test from "node:test";
import {
  assistantContextBoundaries,
  assistantContextState,
} from "../src/components/assistant/assistant-context-state";
import {
  contextScope,
  type PageContext,
} from "../src/components/assistant/assistant-context-types";
import {
  welcomeMessage,
  type AssistantMessage,
} from "../src/components/assistant/assistant-types";

const first: PageContext = {
  page: "items",
  workspaceId: null,
  collection: "articles",
  record: { id: "1" },
};
const second = { ...first, record: { id: "2" } };
const question = (
  id: string,
  context: PageContext | null,
): AssistantMessage => ({
  id,
  role: "user",
  content: "Question",
  contextScope: contextScope(context),
  contextLabel: id,
});

test("context notice distinguishes the next question from the submitted request", () => {
  const messages = [welcomeMessage, question("Record one", first)];
  assert.deepEqual(assistantContextState(messages, first, false), {
    changed: false,
    activeLabel: null,
  });
  assert.deepEqual(assistantContextState(messages, second, true), {
    changed: true,
    activeLabel: "Record one",
  });
  assert.deepEqual(assistantContextState(messages, second, false), {
    changed: true,
    activeLabel: null,
  });
  assert.equal(assistantContextState(messages, null, false).changed, true);
  assert.equal(assistantContextState(messages, first, true).changed, false);
  assert.equal(
    assistantContextState(
      [...messages, question("Record two", second)],
      second,
      true,
    ).changed,
    false,
  );
  assert.equal(messages.length, 2);
});

test("table conditions preserve history while workspace and context mode change it", () => {
  const table: PageContext = {
    page: "items",
    workspaceId: "one",
    collection: "articles",
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
  const messages = [question("Table", table)];
  const changedFilter = {
    ...table,
    table: { ...table.table!, q: "coffee", filter: "changed", page: 2 },
  };
  assert.equal(
    assistantContextState(messages, changedFilter, false).changed,
    false,
  );
  assert.equal(
    assistantContextState(messages, { ...table, workspaceId: "two" }, false)
      .changed,
    true,
  );
  assert.equal(assistantContextState(messages, first, false).changed, true);
  assert.equal(
    assistantContextState([question("Chat", null)], null, false).changed,
    false,
  );
});

test("transcript boundaries survive restoration and do not infer a legacy or missing prefix", () => {
  const messages: AssistantMessage[] = [
    welcomeMessage,
    question("one", first),
    {
      id: "reply-one",
      role: "assistant",
      content: "Reply",
      contextScope: contextScope(first),
    },
    question("follow-up", first),
    question("two", second),
    question("back-to-one", first),
    question("chat", null),
    { id: "legacy", role: "user", content: "Old question" },
    question("after-legacy", first),
  ];
  assert.deepEqual(
    [...assistantContextBoundaries(messages)],
    ["two", "back-to-one", "chat"],
  );
  assert.deepEqual(
    [...assistantContextBoundaries(structuredClone(messages))],
    ["two", "back-to-one", "chat"],
  );
  assert.equal(assistantContextBoundaries(messages.slice(4)).has("two"), false);
  assert.equal(
    assistantContextState([welcomeMessage], second, false).changed,
    false,
  );
  assert.equal(
    assistantContextState(
      [{ id: "legacy", role: "user", content: "Unknown scope" }],
      second,
      true,
    ).changed,
    false,
  );
});
