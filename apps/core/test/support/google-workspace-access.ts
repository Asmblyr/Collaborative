import type { TestContext } from "node:test";
import type { GoogleWorkspaceFixture } from "./google-workspace.js";
import assert from "node:assert/strict";
import { loadAccess } from "../../src/permissions/access.js";
import { exchangeServiceKey } from "../../src/services/tokens.js";
import { serviceSecret, secretHash } from "../../src/services/repository.js";
import {
  startGoogleFlow,
  finishGoogleFlow,
} from "../../src/connections/google/flows.js";

export async function googleAccessCases(
  t: TestContext,
  fixture: GoogleWorkspaceFixture,
) {
  const {
    db,
    settings,
    connections,
    app,
    owner,
    outsider,
    member,
    foreign,
    connect,
    state,
  } = fixture;
  await t.test(
    "unauthenticated/service principals and foreign flow owners cannot connect",
    async () => {
      assert.equal(
        (await app.inject({ url: "/connections/google" })).statusCode,
        401,
      );
      const [service] = await db("asmblyr_service_accounts")
        .insert({ name: "Google test machine" })
        .returning("id");
      try {
        const key = serviceSecret("asm_sk_");
        await db("asmblyr_service_keys").insert({
          service_id: service.id,
          name: "test",
          key_hash: secretHash(key),
          prefix: key.slice(0, 15),
          expires_at: new Date(Date.now() + 3600000),
        });
        const machine = await exchangeServiceKey(db, { key });
        assert.equal(
          (
            await app.inject({
              url: "/connections/google",
              headers: { authorization: `Bearer ${machine.accessToken}` },
            })
          ).statusCode,
          403,
        );
        assert.equal(
          (
            await app.inject({
              method: "POST",
              url: "/google/find-files",
              headers: { authorization: `Bearer ${machine.accessToken}` },
              payload: { query: "", pageToken: null },
            })
          ).statusCode,
          403,
        );
      } finally {
        await db("asmblyr_service_accounts").where({ id: service.id }).delete();
      }
      const flow = await startGoogleFlow(connections, owner!);
      const query = `state=${new URL(flow.url).searchParams.get("state")}&code=test`;
      const other = await loadAccess(db, foreign.authorization);
      await assert.rejects(
        finishGoogleFlow(
          connections,
          other,
          { browserToken: flow.browserToken, query },
          async () => other,
        ),
        { code: "connection_invalid_flow" },
      );
      const own = await loadAccess(db, member.authorization);
      await assert.rejects(
        finishGoogleFlow(
          connections,
          own,
          { browserToken: "wrong", query },
          async () => own,
        ),
        { code: "connection_invalid_flow" },
      );
      assert.equal((await connections.status(outsider!)).connected, false);
    },
  );
  await t.test(
    "state is one-use; tokens and PKCE proof remain encrypted",
    async () => {
      const flow = await connect();
      const access = await loadAccess(db, member.authorization);
      await assert.rejects(
        finishGoogleFlow(
          connections,
          access,
          { browserToken: flow.browserToken, query: flow.query },
          async () => access,
        ),
        { code: "connection_invalid_flow" },
      );
      const stored = JSON.stringify(
        await db("asmblyr_connection_secrets").select(),
      );
      for (const secret of [
        "refresh-private",
        "access-private",
        flow.browserToken,
      ]) {
        assert.equal(stored.includes(secret), false);
      }
      assert.equal(
        JSON.stringify(await settings.snapshot()).includes("client-private"),
        false,
      );
      assert.equal(
        (await connections.status(owner!)).email,
        "google@example.test",
      );
    },
  );
  await t.test(
    "HTTP model tools use the same owner-bound broker; disconnected user cannot invoke",
    async () => {
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: "/google/find-files",
            headers: foreign,
            payload: { query: "", pageToken: null },
          })
        ).statusCode,
        403,
      );
      const result = await app.inject({
        method: "POST",
        url: "/google/read-text",
        headers: member,
        payload: { fileId: "text1" },
      });
      assert.equal(result.statusCode, 200, result.body);
      assert.match(result.json().data.output.content, /untrusted document/);
      assert.equal(result.body.includes("access-private"), false);
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: "/google/find-files",
            headers: member,
            payload: { query: "", pageToken: null, owner: outsider },
          })
        ).statusCode,
        400,
      );
    },
  );
  await t.test(
    "assistant exposes connected tools and a verified approval card without collection grants",
    async () => {
      const response = await app.inject({
        method: "POST",
        url: "/assistant/messages",
        headers: member,
        payload: {
          messages: [{ role: "user", content: "Create a new text file" }],
          context: { page: "home", workspaceId: null },
        },
      });
      assert.equal(response.statusCode, 200, response.body);
      assert.equal(response.json().data.connectionWrites.length, 1);
      assert.equal(
        response.json().data.connectionWrites[0].content,
        "new content",
      );
      assert.equal(state.writes, 0);
      assert.equal(
        (await app.inject({ url: "/assistant/status", headers: foreign }))
          .statusCode,
        403,
      );
    },
  );
}
