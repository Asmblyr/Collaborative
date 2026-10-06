import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { googleWorkspaceFixture } from "./support/google-workspace.js";
import { loadAccess } from "../src/permissions/access.js";
import { createContextTools } from "../src/assistant/context-tools.js";

test("Google reads and approval proposals work without page context but tool access remains explicit and owner-bound", async (t) => {
  const fixture = await googleWorkspaceFixture(t);
  await fixture.connect();
  const on = { enabled: true, workspaceId: null };
  const off = { ...on, enabled: false };
  // The fixture provider describes a sheet, reads cells and prepares a write through
  // real plugin handlers against a mock Google transport; no Google write executes.
  const response = await fixture.app.inject({
    method: "POST",
    url: "/assistant/messages",
    headers: fixture.member,
    payload: {
      messages: [
        { role: "user", content: "Inspect the sheet and propose a new file" },
      ],
      context: null,
      dataAccess: on,
    },
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().data.connectionWrites.length, 1);
  assert.equal(fixture.state.writes, 0);
  assert.ok(!response.body.includes("access-private"));
  assert.equal(
    (
      await fixture.app.inject({
        method: "POST",
        url: "/assistant/messages",
        headers: fixture.foreign,
        payload: {
          messages: [{ role: "user", content: "Use the other account" }],
          context: null,
          dataAccess: on,
        },
      })
    ).statusCode,
    403,
  );
  const access = await loadAccess(fixture.db, fixture.member.authorization);
  const reload = () => loadAccess(fixture.db, fixture.member.authorization);
  assert.equal(
    await createContextTools(
      fixture.db,
      access,
      null,
      reload,
      undefined,
      fixture.connections,
      off,
    ),
    undefined,
  );
  const pageOnly = (await createContextTools(
    fixture.db,
    access,
    { page: "home", workspaceId: null },
    reload,
    undefined,
    fixture.connections,
    off,
  ))!;
  assert.deepEqual(pageOnly.definitions, []);
  assert.ok(
    "error" in
      (await pageOnly.execute("plugin_google__read_cells", {
        fileId: "sheet1",
        range: "Sheet1!A1",
      })),
  );
  assert.equal(fixture.state.writes, 0);
});
