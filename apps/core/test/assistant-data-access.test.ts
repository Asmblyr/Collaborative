import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import {
  parseAssistantDataAccess,
  assistantDataEnabled,
} from "../src/assistant/data-access.js";
import { parseAssistantInput } from "../src/assistant/validation.js";
import {
  parseConversationSubmission,
  conversationScope,
} from "../src/assistant/history-input.js";
import { assistantConfigFromEnv } from "../src/assistant/config.js";
import { buildAssistantInstructions } from "../src/assistant/instructions.js";

const config = assistantConfigFromEnv({
  OPENAI_API_KEY: "test",
  OPENAI_API_MODEL: "test",
})!;
const context = { page: "home", workspaceId: null };

test("data access is explicit, independent of the page, and legacy omission keeps plain chat", () => {
  assert.equal(parseAssistantDataAccess(undefined, null), undefined);
  assert.equal(assistantDataEnabled(null), false);
  assert.equal(assistantDataEnabled(context), true);
  for (const page of [null, context]) {
    for (const enabled of [true, false]) {
      const dataAccess = { enabled, workspaceId: null };
      assert.deepEqual(parseAssistantDataAccess(dataAccess, page), dataAccess);
      assert.equal(assistantDataEnabled(page, dataAccess), enabled);
      const input = parseAssistantInput(
        {
          messages: [{ role: "user", content: "Question" }],
          context: page,
          dataAccess,
        },
        config,
      );
      assert.deepEqual(input.dataAccess, dataAccess);
      const saved = parseConversationSubmission({
        conversationId: randomUUID(),
        messageId: randomUUID(),
        content: "Question",
        context: page,
        dataAccess,
      });
      assert.deepEqual(saved?.dataAccess, dataAccess);
    }
  }
});

test("malformed access never silently enables tools and cannot mismatch the page workspace", () => {
  for (const dataAccess of [
    null,
    true,
    {},
    { enabled: "true", workspaceId: null },
    { enabled: true },
    { enabled: true, workspaceId: "bad" },
    { enabled: true, workspaceId: null, actorId: randomUUID() },
  ]) {
    assert.throws(() => parseAssistantDataAccess(dataAccess, null));
    assert.throws(() =>
      parseAssistantInput(
        { messages: [{ role: "user", content: "Question" }], dataAccess },
        config,
      ),
    );
    assert.throws(() =>
      parseConversationSubmission({
        conversationId: randomUUID(),
        messageId: randomUUID(),
        content: "Question",
        dataAccess,
      }),
    );
  }
  assert.throws(() =>
    parseAssistantDataAccess(
      { enabled: true, workspaceId: randomUUID() },
      context,
    ),
  );
  assert.throws(() =>
    parseAssistantDataAccess(
      { enabled: false, workspaceId: null },
      { page: "home", workspaceId: randomUUID() },
    ),
  );
});

test("conversation scopes isolate tool access and workspace while preserving existing page scopes", () => {
  const record = {
    page: "items",
    workspaceId: null,
    collection: "articles",
    record: { id: "text/key" },
  };
  const on = { enabled: true, workspaceId: null };
  const off = { ...on, enabled: false };
  assert.equal(conversationScope(null), "chat");
  assert.equal(conversationScope(null, off), "chat");
  assert.equal(conversationScope(null, on), "all:data");
  assert.equal(conversationScope(record, on), conversationScope(record));
  assert.equal(
    conversationScope(record, off),
    "all:items:articles:record:text%2Fkey:data-off",
  );
  const workspaceId = randomUUID();
  assert.equal(
    conversationScope(null, { enabled: true, workspaceId }),
    `${workspaceId}:data`,
  );
  assert.equal(
    conversationScope(null, { enabled: false, workspaceId }),
    `${workspaceId}:chat`,
  );
});

test("model instructions distinguish data access without a page and a page without tools", () => {
  const standalone = buildAssistantInstructions(null, {
    workspace: null,
    dataAccessEnabled: true,
    pageContextProvided: false,
  });
  assert.match(standalone, /Контекст страницы не предоставлен/);
  assert.match(standalone, /указывать? её явно|указывай её явно/);
  assert.ok(!standalone.includes("# Снимок страницы"));
  const disabled = buildAssistantInstructions(null, {
    ...context,
    dataAccessEnabled: false,
    pageContextProvided: true,
  });
  assert.match(disabled, /Пользователь выключил доступ/);
  assert.match(buildAssistantInstructions(), /нет доступа к базе данных/);
});
