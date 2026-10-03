import assert from "node:assert/strict";
import test from "node:test";
import { renewSession } from "../src/lib/renew-session";

test("concurrent renewals share the entire pending request and the completed result", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let finish!: (response: Response) => void;
  const fetchMock = t.mock.method(globalThis, "fetch", () => new Promise<Response>((resolve) => { finish = resolve; }));
  const first = renewSession("slow-refresh");
  t.mock.timers.tick(6000);
  const second = renewSession("slow-refresh");
  assert.equal(fetchMock.mock.callCount(), 1, "A pending refresh must not be sent twice");
  assert.equal(second, first);
  const pair = { accessToken: "access", refreshToken: "refresh", expiresIn: 900,
    refreshExpiresAt: "2030-01-01T00:00:00.000Z" };
  finish(Response.json(pair));
  assert.deepEqual(await first, pair);
  assert.equal(renewSession("slow-refresh"), first);
  t.mock.timers.tick(5001);
});
