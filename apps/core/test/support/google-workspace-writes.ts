import type { TestContext } from "node:test";
import type { GoogleWorkspaceFixture } from "./google-workspace.js";
import assert from "node:assert/strict";
import { initialValues } from "../../src/integrations/types.js";
import { GoogleClient } from "../../src/connections/google/client.js";
import type { GoogleWriteInput } from "@asmblyr-collaborative/kit";

export async function googleWritesCases(
  t: TestContext,
  fixture: GoogleWorkspaceFixture,
) {
  const {
    db,
    settings,
    connections,
    proposals,
    app,
    owner,
    adminId,
    member,
    foreign,
    state,
  } = fixture;
  await t.test(
    "proposal alone does not write; foreign confirmation and duplicate confirmation fail",
    async () => {
      const input: GoogleWriteInput = {
        operation: "update_cells",
        fileId: "sheet1",
        title: null,
        content: null,
        range: "Sheet1!A1",
        values: [["new"]],
      };
      const proposal = await proposals.propose(owner!, input);
      assert.equal(state.writes, 0);
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: `/connections/google/writes/${proposal.id}/confirm`,
            headers: foreign,
            payload: {},
          })
        ).statusCode,
        404,
      );
      const success = await app.inject({
        method: "POST",
        url: `/connections/google/writes/${proposal.id}/confirm`,
        headers: member,
        payload: {},
      });
      assert.equal(success.statusCode, 200, success.body);
      assert.equal(success.json().data.status, "succeeded");
      assert.equal(state.writes, 1);
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: `/connections/google/writes/${proposal.id}/confirm`,
            headers: member,
            payload: {},
          })
        ).statusCode,
        404,
      );
      assert.equal(state.writes, 1);
      const stale = await proposals.propose(owner!, input);
      state.sheetValues = [["changed elsewhere"]];
      await assert.rejects(proposals.confirm(owner!, stale.id), {
        code: "connection_target_changed",
      });
      assert.equal(state.writes, 1);
    },
  );
  await t.test(
    "uncertain writes cannot be retried; invalid ranges and oversized output are rejected",
    async () => {
      const proposal = await proposals.propose(owner!, {
        operation: "create_text",
        fileId: null,
        title: "Test",
        range: null,
        content: "test",
        values: null,
      });
      state.uncertainWrite = true;
      assert.equal(
        (await proposals.confirm(owner!, proposal.id)).status,
        "uncertain",
      );
      state.uncertainWrite = false;
      await assert.rejects(proposals.confirm(owner!, proposal.id), {
        code: "connection_proposal_unavailable",
      });
      await assert.rejects(
        new GoogleClient(connections, owner!).cells({
          fileId: "sheet1",
          range: "A:Z",
        }),
        { code: "connection_range_required" },
      );
      await assert.rejects(
        new GoogleClient(connections, owner!).cells({
          fileId: "sheet1",
          range: "A1:Z1000",
        }),
        { code: "connection_range_too_large" },
      );
      state.oversizedResponse = true;
      await assert.rejects(
        new GoogleClient(connections, owner!).list({
          query: "",
          pageToken: null,
        }),
        { code: "connection_result_too_large" },
      );
      state.oversizedResponse = false;
      await assert.rejects(proposals.cancel(owner!, "invalid-id"), {
        code: "connection_proposal_unavailable",
      });
    },
  );
  await t.test(
    "creating and appending Sheets use the Sheets endpoint and require human confirmation",
    async () => {
      const before = state.writes;
      const created = await proposals.propose(owner!, {
        operation: "create_sheet",
        fileId: null,
        title: "New sheet",
        content: null,
        range: null,
        values: null,
      });
      assert.equal(state.writes, before);
      assert.equal(
        (await proposals.confirm(owner!, created.id)).status,
        "succeeded",
      );
      const appended = await proposals.propose(owner!, {
        operation: "append_cells",
        fileId: "sheet1",
        title: null,
        content: null,
        range: "Sheet1!A1",
        values: [["next row"]],
      });
      assert.equal(state.writes, before + 1);
      assert.equal(
        (await proposals.confirm(owner!, appended.id)).status,
        "succeeded",
      );
      assert.equal(state.writes, before + 2);
    },
  );
  await t.test(
    "provider rotation includes OAuth credentials and pending proposals",
    async () => {
      const pending = await proposals.propose(owner!, {
        operation: "create_text",
        fileId: null,
        title: "Rotate",
        content: "private proposal",
        range: null,
        values: null,
      });
      await settings.save(
        "encryption",
        {
          revision: (await settings.row()).revision,
          value: {
            provider: "yandex-kms",
            keyId: "test-key",
            serviceAccountId: "test-sa",
          },
        },
        adminId!,
      );
      assert.equal(
        (await connections.accessToken(owner!)).token,
        "access-private",
      );
      assert.equal(
        (await proposals.get(owner!, pending.id)).content,
        "private proposal",
      );
      const encrypted = JSON.stringify(
        await db("asmblyr_connection_secrets").select(),
      );
      assert.equal(encrypted.includes("private proposal"), false);
      await settings.save(
        "encryption",
        {
          revision: (await settings.row()).revision,
          value: initialValues.encryption,
        },
        adminId!,
      );
    },
  );
}
