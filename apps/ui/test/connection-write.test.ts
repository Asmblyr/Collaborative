import assert from "node:assert/strict";
import test from "node:test";
import type {
  ConnectionWriteDetail,
  ConnectionWriteStatus,
} from "@asmblyr-collaborative/contracts";
import {
  canDecideWrite,
  parseConnectionWriteDetail,
  safeGoogleWriteUrl,
  verifiedWriteState,
  writeReadFailure,
} from "../src/components/assistant/connection-write-state";
import {
  decideConnectionWrite,
  readConnectionWrite,
} from "../src/components/assistant/connection-write-client";

const proposal = {
  id: "00000000-0000-4000-8000-000000000001",
  provider: "google" as const,
  operation: "update_cells" as const,
  target: "Test · Sheet1!A1",
  title: "Test",
  content: "[[1]]",
  expiresAt: new Date(Date.now() + 1200000).toISOString(),
};
const detail = (status: ConnectionWriteStatus): ConnectionWriteDetail => ({
  ...proposal,
  status,
  url: "https://docs.google.com/spreadsheets/d/test/edit",
  result: null,
  failure: null,
});

test("only a verified, unexpired, untouched pending proposal permits a decision", () => {
  assert.equal(canDecideWrite(verifiedWriteState(detail("pending"))), true);
  for (const status of [
    "executing",
    "cancelled",
    "succeeded",
    "failed",
    "uncertain",
  ] as const) {
    assert.equal(canDecideWrite(verifiedWriteState(detail(status))), false);
  }
  assert.equal(
    canDecideWrite(
      verifiedWriteState({
        ...detail("pending"),
        expiresAt: new Date(0).toISOString(),
      }),
    ),
    false,
  );
  assert.equal(
    canDecideWrite(verifiedWriteState(detail("pending"), true)),
    false,
  );
  assert.equal(verifiedWriteState(detail("pending"), true).status, "uncertain");
  const completed = verifiedWriteState(detail("succeeded"), true);
  assert.equal(writeReadFailure(completed, true).status, "succeeded");
  assert.equal(writeReadFailure(completed, true).refreshFailed, true);
  assert.equal(
    canDecideWrite(
      writeReadFailure(verifiedWriteState(detail("pending")), false),
    ),
    false,
  );
});

test("write detail identity/status and receipt values are checked; links stay on Google", () => {
  assert.throws(() =>
    parseConnectionWriteDetail(
      { ...detail("pending"), id: "foreign" },
      proposal,
    ),
  );
  assert.throws(() =>
    parseConnectionWriteDetail(
      { ...detail("pending"), status: "unknown" },
      proposal,
    ),
  );
  assert.throws(() =>
    parseConnectionWriteDetail(
      { ...detail("pending"), result: { updatedCells: -1 } },
      proposal,
    ),
  );
  for (const url of [
    "javascript:alert(1)",
    "https://docs.google.com.evil.test/spreadsheets/d/test/edit",
    "https://user@docs.google.com/spreadsheets/d/test/edit",
    "https://docs.google.com:444/spreadsheets/d/test/edit",
    "https://docs.google.com/redirect",
  ]) {
    assert.equal(safeGoogleWriteUrl(url), null);
  }
  assert.equal(
    safeGoogleWriteUrl(detail("pending").url),
    detail("pending").url,
  );
  assert.equal(
    parseConnectionWriteDetail(
      { ...detail("pending"), url: "https://unsafe.example" },
      proposal,
    ).url,
    null,
  );
  const legacy = { ...proposal, status: "pending" };
  assert.equal(parseConnectionWriteDetail(legacy, proposal).result, null);
});

test("lost confirmation responses reconcile by GET and never cause a second mutation", async (t) => {
  const methods: string[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: string, init: RequestInit) => {
      methods.push(init.method!);
      if (init.method === "POST") {
        throw new Error("lost response");
      }
      return Response.json({ data: detail("succeeded") });
    },
  );
  const outcome = await decideConnectionWrite(
    proposal,
    verifiedWriteState(detail("pending")),
    true,
  );
  assert.equal(outcome.status, "succeeded");
  assert.equal(outcome.attempted, true);
  await readConnectionWrite(proposal);
  await assert.rejects(decideConnectionWrite(proposal, outcome, true));
  assert.deepEqual(methods, ["POST", "GET", "GET"]);
});

test("failed reconciliation stays uncertain, while changed targets and rejection retain their known outcomes", async (t) => {
  let mode = "lost";
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: string, init: RequestInit) => {
      if (mode === "lost") {
        throw new Error("offline");
      }
      if (init.method === "GET") {
        if (mode === "stale-pending") {
          return Response.json({ data: detail("pending") });
        }
        throw new Error("status offline");
      }
      if (mode === "changed") {
        return Response.json(
          { code: "connection_target_changed", message: "changed" },
          { status: 409 },
        );
      }
      return Response.json({ data: { cancelled: true } });
    },
  );
  const pending = verifiedWriteState(detail("pending"));
  assert.equal(
    (await decideConnectionWrite(proposal, pending, true)).status,
    "uncertain",
  );
  mode = "changed";
  const changed = await decideConnectionWrite(proposal, pending, true);
  assert.equal(changed.status, "failed");
  assert.equal(changed.detail?.failure, "target_changed");
  mode = "rejected";
  assert.equal(
    (await decideConnectionWrite(proposal, pending, false)).status,
    "cancelled",
  );
  mode = "stale-pending";
  const rejected = await decideConnectionWrite(proposal, pending, false);
  assert.equal(rejected.status, "cancelled");
  assert.equal(canDecideWrite(rejected), false);
});
