import "./support/require-test-database.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { mcpFixture } from "./support/assistant-mcp-fixture.js";
import { createContextTools } from "../src/assistant/context-tools.js";
import { AssistantService } from "../src/assistant/service.js";
import { assistantConfigFromEnv } from "../src/assistant/config.js";
import type { AssistantInput } from "../src/assistant/validation.js";
import type { AssistantTools } from "../src/assistant/tool-contract.js";
import type { Access } from "../src/permissions/access.js";

test("page-free tools preserve ACL/MCP checks, require an explicit collection and recheck permissions", async (t) => {
  const { db, access, names } = await mcpFixture(t);
  const on = { enabled: true, workspaceId: null };
  const off = { ...on, enabled: false };
  let current: Access = access;
  const tools = (await createContextTools(
    db,
    access,
    null,
    async () => current,
    undefined,
    null,
    on,
  ))!;
  try {
    assert.deepEqual(tools.context, {
      workspace: null,
      pageContextProvided: false,
      dataAccessEnabled: true,
    });
    assert.ok(tools.definitions.some((tool) => tool.name === "search_items"));
    assert.ok(
      !tools.definitions.some((tool) => tool.name === "propose_filter"),
    );
    assert.ok(
      "error" in
        (await tools.execute("describe_collection", { collection: null })),
    );
    const schema = await tools.execute("describe_collection", {
      collection: names.posts,
    });
    assert.ok(!JSON.stringify(schema).includes("secret"));
    const result = await tools.execute("search_items", {
      collection: names.posts,
      q: null,
      filter: null,
      fields: ["title"],
      limit: 5,
      page: 1,
      sort: null,
      direction: null,
      terms: null,
      order: null,
    });
    assert.ok(!("error" in result), JSON.stringify(result));
    const read = result as { items: { values: { title: string } }[] };
    assert.deepEqual(
      read.items.map((item) => item.values.title),
      ["Alpha", "Beta"],
    );
    assert.ok(!JSON.stringify(result).includes("hidden-post-value"));
    assert.ok(
      "error" in
        (await tools.execute("read_item", {
          collection: names.posts,
          id: "1",
          fields: ["secret"],
        })),
    );
    for (const collection of [names.denied, names.disabled]) {
      assert.ok(
        "error" in (await tools.execute("describe_collection", { collection })),
      );
    }
    current = { ...access, grants: new Map() };
    assert.ok(
      "error" in
        (await tools.execute("read_item", {
          collection: names.posts,
          id: "1",
          fields: ["title"],
        })),
    );
    assert.equal(
      await createContextTools(db, access, null, async () => access),
      undefined,
    );
    assert.equal(
      await createContextTools(
        db,
        access,
        null,
        async () => access,
        undefined,
        null,
        off,
      ),
      undefined,
    );
    const disabled = (await createContextTools(
      db,
      access,
      {
        page: "items",
        workspaceId: null,
        collection: names.posts,
        record: { id: "1" },
      },
      async () => access,
      undefined,
      null,
      off,
    ))!;
    assert.deepEqual(disabled.definitions, []);
    assert.ok(
      "error" in
        (await disabled.execute("read_item", {
          collection: names.posts,
          id: "1",
          fields: ["title"],
        })),
    );
    assert.ok(!JSON.stringify(disabled.context).includes("Alpha"));
    await assert.rejects(
      createContextTools(
        db,
        access,
        null,
        async () => access,
        undefined,
        null,
        { enabled: true, workspaceId: randomUUID() },
      ),
      { statusCode: 404 },
    );
  } finally {
    await tools.close?.();
  }
});

test("saved turns isolate data modes, keep legacy chat history and bind duplicate IDs to access choices", async (t) => {
  const seen: { input: AssistantInput; tools: AssistantTools | undefined }[] =
    [];
  const assistant = new AssistantService(
    assistantConfigFromEnv({
      OPENAI_API_KEY: "test",
      OPENAI_API_MODEL: "test",
    })!,
    async (input, _signal, _custom, run) => {
      seen.push({ input: structuredClone(input), tools: run?.tools });
      return { content: "Answer", truncated: false };
    },
  );
  const { app, headers, names } = await mcpFixture(t, assistant);
  const created = await app.inject({
    method: "POST",
    url: "/assistant/conversations",
    headers,
    payload: {},
  });
  assert.equal(created.statusCode, 201, created.body);
  const conversationId = created.json().data.id;
  const on = { enabled: true, workspaceId: null };
  const off = { ...on, enabled: false };
  const send = async (
    content: string,
    context: object | null,
    dataAccess?: typeof on,
    messageId = randomUUID(),
  ) => {
    const response = await app.inject({
      method: "POST",
      url: "/assistant/messages",
      headers,
      payload: {
        conversationId,
        messageId,
        content,
        context,
        ...(dataAccess ? { dataAccess } : {}),
      },
    });
    assert.equal(response.statusCode, 200, response.body);
    return seen.at(-1)!;
  };
  await send("Legacy plain question", null);
  assert.equal(seen.at(-1)!.tools, undefined);
  const messageId = randomUUID();
  const first = await send("With data", null, on, messageId);
  assert.ok(first.tools?.definitions.length);
  assert.deepEqual(
    first.input.messages.map((message) => message.content),
    ["With data"],
  );
  const plain = await send("Without data", null, off);
  assert.equal(plain.tools, undefined);
  assert.deepEqual(
    plain.input.messages.map((message) => message.content),
    ["Legacy plain question", "Answer", "Without data"],
  );
  const returned = await send("Data again", null, on);
  assert.deepEqual(
    returned.input.messages.map((message) => message.content),
    ["With data", "Answer", "Data again"],
  );
  const record = {
    page: "items",
    workspaceId: null,
    collection: names.posts,
    record: { id: "1" },
  };
  const pageOnly = await send("Page without reading", record, off);
  assert.deepEqual(pageOnly.tools?.definitions, []);
  const pageData = await send("Read this page", record, on);
  assert.ok(pageData.tools?.definitions.length);
  assert.deepEqual(
    pageData.input.messages.map((message) => message.content),
    ["Read this page"],
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/assistant/messages",
        headers,
        payload: {
          conversationId,
          messageId,
          content: "With data",
          context: null,
          dataAccess: off,
        },
      })
    ).statusCode,
    409,
  );
  const calls = seen.length;
  const duplicate = await app.inject({
    method: "POST",
    url: "/assistant/messages",
    headers,
    payload: {
      conversationId,
      messageId,
      content: "With data",
      context: null,
      dataAccess: on,
    },
  });
  assert.equal(duplicate.statusCode, 200, duplicate.body);
  assert.equal(seen.length, calls);
  const transcript = await app.inject({
    url: `/assistant/conversations/${conversationId}`,
    headers,
  });
  const messages = transcript
    .json()
    .data.messages.filter(
      (message: { role: string }) => message.role === "user",
    );
  assert.deepEqual(
    messages.map((message: { contextScope: string }) => message.contextScope),
    [
      "chat",
      "all:data",
      "chat",
      "all:data",
      `all:items:${names.posts}:record:1:data-off`,
      `all:items:${names.posts}:record:1`,
    ],
  );
  assert.match(messages[2].contextLabel, /без доступа к данным/);
});
