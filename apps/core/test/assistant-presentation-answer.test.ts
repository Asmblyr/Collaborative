import assert from "node:assert/strict";
import test from "node:test";
import type { AssistantStreamEvent } from "@asmblyr-collaborative/contracts";
import { assistantConfigFromEnv } from "../src/assistant/config.js";
import { createAssistantProvider } from "../src/assistant/provider.js";
import { parseAssistantInput } from "../src/assistant/validation.js";
import { contextToolDefinitions } from "../src/assistant/tool-contract.js";
import { assistantSse, chatChunk } from "./support/assistant-sse.js";

const base = assistantConfigFromEnv({
  OPENAI_API_KEY: "test",
  OPENAI_API_MODEL: "test-model",
})!;
const input = parseAssistantInput(
  { messages: [{ role: "user", content: "Show matching records" }] },
  base,
);
const content = "Found the requested records. The card opens this selection.";
const presented = { presented: true, requiresUserClick: true };

function stepResponse(
  api: "responses" | "chat-completions",
  text: string,
  names: string[],
) {
  if (api === "responses") {
    return Response.json({
      object: "response",
      status: "completed",
      output: [
        {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text }],
        },
        ...names.map((name, i) => ({
          type: "function_call",
          id: `f${i}`,
          call_id: `c${i}`,
          name,
          arguments: '{"resultId":"verified-result"}',
        })),
      ],
    });
  }
  return Response.json({
    choices: [
      {
        finish_reason: names.length ? "tool_calls" : "stop",
        message: {
          role: "assistant",
          content: text,
          tool_calls: names.map((name, i) => ({
            type: "function",
            id: `c${i}`,
            function: { name, arguments: '{"resultId":"verified-result"}' },
          })),
        },
      },
    ],
  });
}

for (const cancel of [false, true]) {
  test(`streamed presentation ${cancel ? "retains a note on cancellation" : "promotes a complete answer after validation"}`, async () => {
    const controller = new AbortController();
    const updates: AssistantStreamEvent[] = [];
    let calls = 0;
    const provider = createAssistantProvider(
      { ...base, api: "chat-completions" },
      async () => {
        assert.equal(++calls, 1);
        const stream = assistantSse();
        stream.send(chatChunk({ content }));
        stream.send(
          chatChunk(
            {
              tool_calls: [
                {
                  index: 0,
                  id: "present",
                  type: "function",
                  function: {
                    name: "present_selection",
                    arguments: '{"resultId":"verified-result"}',
                  },
                },
              ],
            },
            "tool_calls",
          ),
        );
        stream.end();
        return stream.response;
      },
    );
    const pending = provider(input, controller.signal, null, {
      record: (call) => call(),
      onText: (event) => updates.push(event),
      onActivity: (activity) => updates.push({ type: "activity", activity }),
      tools: {
        context: {},
        definitions: contextToolDefinitions,
        proposals: [],
        execute: async () => {
          assert.ok(
            updates.some(
              (event) => event.type === "text-delta" && event.provisional,
            ),
          );
          if (cancel) {
            controller.abort();
          }
          return presented;
        },
      },
    });
    if (cancel) {
      await assert.rejects(pending, { code: "assistant_cancelled" });
      assert.ok(
        updates.some(
          (event) =>
            event.type === "activity" && event.activity.text === content,
        ),
      );
      assert.ok(
        !updates.some(
          (event) => event.type === "text-delta" && !event.provisional,
        ),
      );
    } else {
      const answer = await pending;
      assert.equal(answer.content, content);
      assert.deepEqual(updates.at(-1), {
        type: "text-delta",
        delta: content,
        reset: true,
      });
      assert.ok(!updates.some((event) => event.type === "activity"));
    }
    assert.equal(calls, 1);
  });
}

for (const api of ["responses", "chat-completions"] as const) {
  test(`${api}: verified presentation keeps the complete answer without a second generation`, async () => {
    let calls = 0;
    const notes: object[] = [];
    const executed: string[] = [];
    const provider = createAssistantProvider({ ...base, api }, async () => {
      assert.equal(
        ++calls,
        1,
        "an unnecessary final request would fail or time out",
      );
      return stepResponse(api, content, [
        "present_selection",
        "present_plugin_result",
      ]);
    });
    const answer = await provider(input, undefined, null, {
      record: (call) => call(),
      onActivity: (note) => notes.push(note),
      tools: {
        context: {},
        definitions: contextToolDefinitions,
        proposals: [],
        execute: async (name) => {
          executed.push(name);
          return presented;
        },
      },
    });
    assert.equal(answer.content, content);
    assert.equal(answer.truncated, false);
    assert.equal(calls, 1);
    assert.deepEqual(executed, ["present_selection", "present_plugin_result"]);
    assert.deepEqual(notes, []);
  });

  for (const scenario of ["failed", "mixed", "empty"] as const) {
    test(`${api}: ${scenario} presentation requires a model continuation`, async () => {
      let calls = 0;
      const notes: object[] = [];
      const provider = createAssistantProvider({ ...base, api }, async () => {
        calls++;
        if (calls > 1) {
          return stepResponse(api, "Verified final reply", []);
        }
        const text = scenario === "empty" ? "" : content;
        const names =
          scenario === "mixed"
            ? ["present_selection", "search_items"]
            : ["present_selection"];
        return stepResponse(api, text, names);
      });
      const answer = await provider(input, undefined, null, {
        record: (call) => call(),
        onActivity: (note) => notes.push(note),
        tools: {
          context: {},
          definitions: contextToolDefinitions,
          proposals: [],
          execute: async (name) => {
            if (scenario === "failed") {
              return {
                ...presented,
                error: "Unavailable",
                code: "REQUEST_UNAVAILABLE",
              };
            }
            if (name === "search_items") {
              return { items: [] };
            }
            return presented;
          },
        },
      });
      assert.equal(answer.content, "Verified final reply");
      assert.equal(calls, 2);
      const expectedNotes =
        scenario === "empty" ? [] : [{ kind: "note", text: content }];
      assert.deepEqual(notes, expectedNotes);
    });
  }
}
