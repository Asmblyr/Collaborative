import assert from "node:assert/strict";
import test from "node:test";
import {
  HttpError,
  requestErrorMessage,
  requestJson,
} from "../src/lib/http-request";
import { translateCopy } from "@asmblyr-collaborative/contracts/translations";

test("permission errors preserve HTTP details and have a localized access message", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () =>
    Response.json(
      { message: "Forbidden", code: "FORBIDDEN", requestId: "request-403" },
      { status: 403 },
    ),
  );
  await assert.rejects(requestJson("/api/collections", "POST", {}), (error) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 403);
    assert.equal(error.code, "FORBIDDEN");
    assert.equal(error.requestId, "request-403");
    assert.equal(error.message, "Forbidden");
    assert.equal(
      translateCopy(requestErrorMessage(error), "en"),
      "No access to this action or record.",
    );
    return true;
  });
  assert.equal(fetch.mock.callCount(), 1, "Do not retry a denied mutation");
});

test("non-JSON upstream errors retain status and request ID instead of throwing a JSON parse error", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response("<html>Unavailable</html>", {
        status: 503,
        headers: { "x-request-id": "upstream-503" },
      }),
  );
  await assert.rejects(requestJson("/api/collections"), (error) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 503);
    assert.equal(error.requestId, "upstream-503");
    assert.equal(
      translateCopy(requestErrorMessage(error), "en"),
      "The service is temporarily unavailable. Try again later.",
    );
    return true;
  });
});

test("validation and conflict messages survive without retrying writes", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () =>
    Response.json(
      { message: "Field name is reserved", code: "RESERVED" },
      { status: 400 },
    ),
  );
  await assert.rejects(requestJson("/api/collections", "POST", {}), (error) => {
    assert.ok(error instanceof HttpError);
    assert.equal(requestErrorMessage(error), "Field name is reserved");
    return true;
  });
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(requestErrorMessage(new HttpError("Conflict", 409)), "Conflict");
});

test("successful empty DELETE responses do not require a JSON body", async (t) => {
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(null, { status: 204 }),
  );
  assert.equal(await requestJson("/api/folders/example", "DELETE"), undefined);
  assert.equal(fetch.mock.callCount(), 1);
});

test("malformed successful responses are distinguished from network failures", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("not-json", { status: 200 }),
  );
  await assert.rejects(requestJson("/api/collections"), (error) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.code, "INVALID_RESPONSE");
    assert.equal(requestErrorMessage(error), "Некорректный ответ сервера");
    return true;
  });
});

test("timeouts, expired sessions and connection failures have distinct messages", () => {
  assert.equal(
    requestErrorMessage(new HttpError("Unauthorized", 401)),
    "Сессия истекла. Войдите снова.",
  );
  const timeoutMessage = requestErrorMessage(
    new DOMException("timeout", "TimeoutError"),
  );
  assert.equal(
    timeoutMessage,
    requestErrorMessage(new HttpError("Gateway timeout", 504)),
  );
  assert.equal(
    translateCopy(timeoutMessage, "en"),
    "The server did not respond in time. Try again.",
  );
  assert.equal(
    requestErrorMessage(new TypeError("fetch failed")),
    "Не удалось связаться с сервером",
  );
});

test("a network failure never retries a potentially applied mutation", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    throw new TypeError("fetch failed");
  });
  await assert.rejects(
    requestJson("/api/collections/example/settings", "PATCH", { hidden: true }),
    /fetch failed/,
  );
  assert.equal(fetch.mock.callCount(), 1);
});
