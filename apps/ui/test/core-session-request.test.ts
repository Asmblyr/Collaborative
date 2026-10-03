import assert from "node:assert/strict";
import test from "node:test";
import { requestCoreWithSession } from "../src/lib/core-session-request";
import { renewSession, SessionExpiredError } from "../src/lib/renew-session";
import type { TokenPair } from "../src/lib/session";

const pair: TokenPair = {
  accessToken: "new-access",
  refreshToken: "new-refresh",
  expiresIn: 900,
  refreshExpiresAt: "2030-01-01T00:00:00.000Z",
};
const request = {
  method: "PATCH",
  body: '{"title":"Draft"}',
  timeoutMs: 10000,
};
const unexpectedRenewal = () => assert.fail("Unexpected session renewal");

test("refreshes a missing access cookie before sending a mutation", async (t) => {
  let calls = 0;
  let renewed: TokenPair | undefined;
  t.mock.method(globalThis, "fetch", async (url: URL, init: RequestInit) => {
    calls += 1;
    if (url.pathname === "/auth/refresh") {
      assert.equal(
        init.body,
        JSON.stringify({ refreshToken: "missing-access" }),
      );
      return Response.json(pair);
    }
    assert.deepEqual(
      renewed,
      pair,
      "Persist rotation before attempting the mutation",
    );
    assert.equal(
      new Headers(init.headers).get("authorization"),
      "Bearer new-access",
    );
    assert.equal(init.body, request.body);
    assert.equal(init.method, "PATCH");
    return new Response(null, { status: 204 });
  });
  const response = await requestCoreWithSession(
    "/items/articles/1",
    request,
    { refreshToken: "missing-access" },
    (value) => {
      renewed = value;
    },
  );
  assert.equal(response.status, 204);
  assert.equal(calls, 2);
});

test("retries an expired access token once with the same body", async (t) => {
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: URL, init: RequestInit) => {
    if (url.pathname === "/auth/refresh") {
      calls.push("refresh");
      return Response.json(pair);
    }
    const auth = new Headers(init.headers).get("authorization")!;
    calls.push(auth);
    assert.equal(init.body, request.body);
    return Response.json({}, { status: auth === "Bearer expired" ? 401 : 200 });
  });
  const response = await requestCoreWithSession(
    "/items/articles/1",
    request,
    { accessToken: "expired", refreshToken: "expired-access" },
    () => {},
  );
  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["Bearer expired", "refresh", "Bearer new-access"]);
});

test("does not repeat successful, forbidden or failed mutations", async (t) => {
  let status = 200;
  const fetchMock = t.mock.method(globalThis, "fetch", async () =>
    Response.json({}, { status }),
  );
  for (status of [200, 403, 409, 500, 503]) {
    const response = await requestCoreWithSession(
      "/items/articles/1",
      request,
      { accessToken: "access", refreshToken: "unused" },
      unexpectedRenewal,
    );
    assert.equal(response.status, status);
  }
  assert.equal(fetchMock.mock.callCount(), 5);
});

test("does not retry a mutation after a network error", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("network error");
  });
  await assert.rejects(
    requestCoreWithSession(
      "/items/articles/1",
      request,
      { accessToken: "access", refreshToken: "unused" },
      unexpectedRenewal,
    ),
    /network error/,
  );
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("retains the rotated pair if the subsequent mutation cannot reach Core", async (t) => {
  let renewed: TokenPair | undefined;
  t.mock.method(globalThis, "fetch", async (url: URL) => {
    if (url.pathname === "/auth/refresh") return Response.json(pair);
    throw new Error("network error");
  });
  await assert.rejects(
    requestCoreWithSession(
      "/items/articles/1",
      request,
      { refreshToken: "rotate-then-offline" },
      (value) => {
        renewed = value;
      },
    ),
    /network error/,
  );
  assert.deepEqual(renewed, pair);
});

test("stops after one renewal even if the new access token is rejected", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async (url: URL) =>
    url.pathname === "/auth/refresh"
      ? Response.json(pair)
      : Response.json({}, { status: 401 }),
  );
  const response = await requestCoreWithSession(
    "/items/articles/1",
    request,
    { accessToken: "expired", refreshToken: "revoked-during-request" },
    () => {},
  );
  assert.equal(response.status, 401);
  assert.equal(fetchMock.mock.callCount(), 3);
});

test("distinguishes expired credentials from an unavailable refresh service", async (t) => {
  let status = 401;
  const fetchMock = t.mock.method(globalThis, "fetch", async () =>
    Response.json({}, { status }),
  );
  for (status of [400, 401])
    await assert.rejects(
      renewSession(`invalid-${status}`),
      SessionExpiredError,
    );
  status = 503;
  await assert.rejects(
    renewSession("temporarily-offline"),
    (error: Error) =>
      !(error instanceof SessionExpiredError) &&
      error.message === "Core API unavailable",
  );
  fetchMock.mock.mockImplementation(async () => Response.json(pair));
  assert.deepEqual(
    await renewSession("temporarily-offline"),
    pair,
    "A failure must allow a later retry",
  );
});

test("does not contact Core when neither session cookie exists", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () =>
    assert.fail("Unexpected request"),
  );
  await assert.rejects(
    requestCoreWithSession("/items/articles", request, {}, unexpectedRenewal),
    SessionExpiredError,
  );
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("cancels the upstream request when the caller disconnects without retrying", async (t) => {
  const controller = new AbortController();
  const fetchMock = t.mock.method(
    globalThis,
    "fetch",
    async (_url: URL, init: RequestInit) => {
      assert.ok(init.signal);
      controller.abort();
      assert.equal(init.signal.aborted, true);
      throw new DOMException("Aborted", "AbortError");
    },
  );
  await assert.rejects(
    requestCoreWithSession(
      "/assistant/messages",
      { ...request, signal: controller.signal },
      { accessToken: "access", refreshToken: "unused" },
      unexpectedRenewal,
    ),
    { name: "AbortError" },
  );
  assert.equal(fetchMock.mock.callCount(), 1);
});
