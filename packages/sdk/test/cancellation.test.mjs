import assert from "node:assert/strict";
import { setTimeout } from "node:timers/promises";
import test from "node:test";
import { createClient } from "../dist/index.js";

test("an already aborted call never requests credentials or sends HTTP", async () => {
  const controller = new AbortController();
  controller.abort();
  const client = createClient({
    baseUrl: "/api",
    accessToken: () => assert.fail("token accessed"),
    fetch: () => assert.fail("HTTP sent"),
  });
  await assert.rejects(client.users.me({ signal: controller.signal }), {
    name: "AbortError",
  });
});

test("HTTP waits honor cancellation and timeout without retrying", async () => {
  let calls = 0;
  const client = createClient({
    baseUrl: "/api",
    timeoutMs: 15,
    fetch: async (_url, { signal }) => {
      calls++;
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      });
    },
  });
  const controller = new AbortController();
  const aborted = client.items.list(
    "articles",
    {},
    { signal: controller.signal },
  );
  controller.abort();
  await assert.rejects(aborted, { name: "AbortError" });
  await Promise.all([
    assert.rejects(client.users.me(), { name: "TimeoutError" }),
    setTimeout(30), // Keep the loop alive for AbortSignal.timeout's unref'ed timer.
  ]);
  assert.equal(calls, 2);
});

test("cancellation during an error body remains cancellation, not an API error", async () => {
  const controller = new AbortController();
  const client = createClient({
    baseUrl: "/api",
    timeoutMs: 0,
    fetch: async (_url, { signal }) =>
      new Response(
        new ReadableStream({
          start(stream) {
            signal.addEventListener(
              "abort",
              () => stream.error(signal.reason),
              { once: true },
            );
          },
        }),
        { status: 503 },
      ),
  });
  const pending = client.users.me({ signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
});
