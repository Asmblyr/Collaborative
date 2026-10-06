import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { googleWorkspaceFixture } from "./support/google-workspace.js";
import { GoogleConnections } from "../src/connections/google/connections.js";
import { GoogleWrites } from "../src/connections/google/writes.js";
import { googleWriteResult } from "../src/connections/google/write-result.js";
import type { GoogleWriteInput } from "@asmblyr-collaborative/kit";

test("Google write receipts preserve outcomes, ownership, expiry and one-use execution", async (t) => {
  const fixture = await googleWorkspaceFixture(t);
  await fixture.connect();
  const { proposals, owner, state, app, member, foreign, db } = fixture;
  const input: GoogleWriteInput = {
    operation: "update_cells",
    fileId: "sheet1",
    title: null,
    content: null,
    range: "Sheet1!A1",
    values: [["new"]],
  };
  const get = (id: string, headers = member) =>
    app.inject({
      method: "GET",
      url: `/connections/google/writes/${id}`,
      headers,
    });

  await t.test(
    "success is reviewable without another Google write and exposes a bounded encrypted receipt",
    async () => {
      const proposal = await proposals.propose(owner!, input);
      assert.equal((await proposals.get(owner!, proposal.id)).result, null);
      await proposals.confirm(owner!, proposal.id);
      const before = state.writes;
      const detail = (await get(proposal.id)).json().data;
      assert.equal(detail.status, "succeeded");
      assert.equal(detail.result.updatedCells, 1);
      assert.equal(
        detail.result.url,
        "https://docs.google.com/spreadsheets/d/sheet1/edit",
      );
      assert.equal((await get(proposal.id, foreign)).statusCode, 404);
      await get(proposal.id);
      assert.equal(state.writes, before);
      await assert.rejects(proposals.confirm(owner!, proposal.id), {
        code: "connection_proposal_unavailable",
      });
      assert.equal(state.writes, before);
      const secret = await db("asmblyr_connection_secrets")
        .where({ id: proposal.id })
        .first();
      assert.ok(!JSON.stringify(secret.ciphertext).includes("docs.google.com"));
      assert.equal(secret.expires_at.toISOString(), proposal.expiresAt);
    },
  );

  await t.test(
    "rejection retains a private preview and never executes Google writes",
    async () => {
      const proposal = await proposals.propose(owner!, input);
      const before = state.writes;
      const rejected = await app.inject({
        method: "DELETE",
        url: `/connections/google/writes/${proposal.id}`,
        headers: member,
      });
      assert.equal(rejected.statusCode, 200, rejected.body);
      const detail = (await get(proposal.id)).json().data;
      assert.equal(detail.status, "cancelled");
      assert.equal(detail.content, proposal.content);
      assert.equal(detail.result, null);
      assert.equal((await get(proposal.id, foreign)).statusCode, 404);
      await assert.rejects(proposals.confirm(owner!, proposal.id), {
        code: "connection_proposal_unavailable",
      });
      await assert.rejects(proposals.cancel(owner!, proposal.id), {
        code: "connection_proposal_unavailable",
      });
      assert.equal(state.writes, before);
    },
  );

  await t.test(
    "changed targets differ from uncertain writes and both remain blocked",
    async () => {
      const changed = await proposals.propose(owner!, input);
      const before = state.writes;
      state.sheetValues = [["changed"]];
      await assert.rejects(proposals.confirm(owner!, changed.id), {
        code: "connection_target_changed",
      });
      const detail = (await get(changed.id)).json().data;
      assert.equal(detail.status, "failed");
      assert.equal(detail.failure, "target_changed");
      assert.equal(detail.result, null);
      assert.equal(state.writes, before);
      const uncertain = await proposals.propose(owner!, input);
      state.uncertainWrite = true;
      assert.equal(
        (await proposals.confirm(owner!, uncertain.id)).status,
        "uncertain",
      );
      state.uncertainWrite = false;
      assert.equal((await get(uncertain.id)).json().data.status, "uncertain");
      const writes = state.writes;
      await assert.rejects(proposals.confirm(owner!, uncertain.id), {
        code: "connection_proposal_unavailable",
      });
      assert.equal(state.writes, writes);
    },
  );

  await t.test(
    "executing proposals and expired previews cannot be reactivated",
    async () => {
      const executing = await proposals.propose(owner!, input);
      await db("asmblyr_connection_writes")
        .where({ id: executing.id })
        .update({ status: "executing" });
      assert.equal((await get(executing.id)).json().data.status, "executing");
      await assert.rejects(proposals.confirm(owner!, executing.id), {
        code: "connection_proposal_unavailable",
      });
      const expired = await proposals.propose(owner!, input);
      await db("asmblyr_connection_writes")
        .where({ id: expired.id })
        .update({ expires_at: new Date(0) });
      assert.equal((await get(expired.id)).statusCode, 404);
      await assert.rejects(proposals.cancel(owner!, expired.id), {
        code: "connection_proposal_unavailable",
      });
    },
  );

  await t.test(
    "created file links are built from IDs and arbitrary Google payload is not retained",
    async () => {
      const transport: typeof fetch = async (url, init) => {
        if (
          init?.method === "POST" &&
          String(url).startsWith(
            "https://sheets.googleapis.com/v4/spreadsheets?",
          )
        ) {
          return Response.json({
            spreadsheetId: "created-sheet",
            spreadsheetUrl: "https://unsafe.example",
            privateExtra: "not-retained",
          });
        }
        return fixture.transport(url, init);
      };
      const writes = new GoogleWrites(
        new GoogleConnections(fixture.settings, transport, fixture.protocol),
      );
      const proposal = await writes.propose(owner!, {
        ...input,
        operation: "create_sheet",
        fileId: null,
        title: "Created",
        range: null,
        values: null,
      });
      await writes.confirm(owner!, proposal.id);
      const detail = await proposals.get(owner!, proposal.id);
      assert.equal(
        detail.result?.url,
        "https://docs.google.com/spreadsheets/d/created-sheet/edit",
      );
      assert.ok(!JSON.stringify(detail).includes("not-retained"));
      assert.ok(!JSON.stringify(detail).includes("unsafe.example"));
      assert.deepEqual(
        googleWriteResult(
          { ...input, operation: "append_cells" },
          {
            updates: {
              updatedCells: 4,
              updatedRows: 2,
              updatedRange: "Sheet1!A2:B3",
            },
          },
        ),
        {
          url: "https://docs.google.com/spreadsheets/d/sheet1/edit",
          updatedCells: 4,
          updatedRows: 2,
          range: "Sheet1!A2:B3",
        },
      );
      assert.equal(
        googleWriteResult(
          { ...input, operation: "create_text", fileId: null },
          { id: "https://unsafe.example", updatedCells: -1 },
        ).url,
        null,
      );
    },
  );
});
