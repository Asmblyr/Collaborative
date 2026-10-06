import assert from "node:assert/strict";
import test from "node:test";
import {
  contextScope,
  contextLabel,
  retryDataAccess,
  type PageContext,
} from "../src/components/assistant/assistant-context-types";
import { assistantContextState } from "../src/components/assistant/assistant-context-state";
import { originalCopy } from "../src/lib/ui-copy-types";
import type { AssistantMessage } from "../src/components/assistant/assistant-types";

test("context notices and labels reflect data access independently of page sharing", () => {
  const context: PageContext = {
    page: "items",
    workspaceId: null,
    collection: "articles",
    record: { id: "1" },
  };
  const on = { enabled: true, workspaceId: null };
  const off = { ...on, enabled: false };
  const messages: AssistantMessage[] = [
    {
      id: "first",
      role: "user",
      content: "Question",
      contextScope: contextScope(null, on),
      contextLabel: "Without a page",
    },
  ];
  assert.equal(contextScope(null, on), "all:data");
  assert.equal(contextScope(null, off), "chat");
  assert.equal(assistantContextState(messages, null, false, on).changed, false);
  assert.equal(assistantContextState(messages, null, false, off).changed, true);
  assert.equal(
    assistantContextState(messages, null, true, off).activeLabel,
    "Without a page",
  );
  assert.equal(contextScope(context, on), contextScope(context));
  assert.equal(
    contextScope(context, off),
    "all:items:articles:record:1:data-off",
  );
  assert.equal(
    contextLabel(null, undefined, originalCopy, on),
    "Без контекста страницы",
  );
  assert.match(
    contextLabel(context, undefined, originalCopy, off),
    /без доступа к данным/,
  );
});

test("page-free conversations do not mix workspace histories or collapse record scopes", () => {
  assert.equal(
    contextScope(null, { enabled: true, workspaceId: "workspace-one" }),
    "workspace-one:data",
  );
  assert.equal(
    contextScope(null, { enabled: false, workspaceId: "workspace-one" }),
    "workspace-one:chat",
  );
  const page: PageContext = {
    page: "items",
    workspaceId: null,
    collection: "articles",
    record: { id: "text/key" },
  };
  assert.equal(
    contextScope(page, { enabled: false, workspaceId: null }),
    "all:items:articles:record:text%2Fkey:data-off",
  );
});

test("retry never restores disabled tools and keeps the original page workspace", () => {
  const context: PageContext = {
    page: "home",
    workspaceId: "original-workspace",
  };
  const on = { enabled: true, workspaceId: context.workspaceId };
  const off = { enabled: false, workspaceId: "new-workspace" };
  assert.deepEqual(retryDataAccess(context, on, off), {
    enabled: false,
    workspaceId: "original-workspace",
  });
  assert.deepEqual(retryDataAccess(null, on, off), {
    enabled: false,
    workspaceId: "original-workspace",
  });
  assert.deepEqual(retryDataAccess(context, undefined, off), {
    enabled: false,
    workspaceId: "original-workspace",
  });
  assert.deepEqual(retryDataAccess(context, { ...on, enabled: false }, on), {
    ...on,
    enabled: false,
  });
  assert.equal(retryDataAccess(context, on, on), on);
});
