import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import type { GoogleWorkspaceFixture } from "./google-workspace.js";
import { loadAccess } from "../../src/permissions/access.js";
import { PluginActions } from "../../src/plugins/actions.js";
import { createActionItems } from "../../src/plugins/action-items.js";
import { capabilityItems } from "../../src/plugins/capabilities.js";
import { personalConnections } from "../../src/connections/broker.js";
import { createContextTools } from "../../src/assistant/context-tools.js";

export async function googleRequestCases(
  t: TestContext,
  fixture: GoogleWorkspaceFixture,
) {
  const { db, connections, app, member, state, plugins } = fixture;
  const access = await loadAccess(db, member.authorization);
  const actions = new PluginActions(
    plugins,
    async (current, scope, plugin) => ({
      actor: { id: current.principal.id, kind: current.principal.kind },
      items: capabilityItems(plugin, createActionItems(db, current, scope)),
      connections: personalConnections(
        connections,
        current.principal.id,
        scope.signal,
      ),
    }),
    undefined,
    (current) => connections.available(current.principal.id),
  );
  const tools = await createContextTools(
    db,
    access,
    { page: "home", workspaceId: null },
    () => loadAccess(db, member.authorization),
    actions,
    connections,
  );
  try {
    await t.test(
      "Drive and Sheets use their fixed service endpoints in HTTP and MCP",
      async () => {
        const sheet = await app.inject({
          method: "POST",
          url: "/google/describe-sheet",
          headers: member,
          payload: { fileId: "sheet1" },
        });
        assert.equal(sheet.statusCode, 200, sheet.body);
        assert.equal(sheet.json().data.output.sheets[0].title, "Sheet1");
        const cells = await tools!.execute("plugin_google__read_cells", {
          fileId: "sheet1",
          range: "Sheet1!A1:C5",
        });
        assert.equal("error" in cells, false, JSON.stringify(cells));
        assert.deepEqual(
          (cells as { output: { values: string[][] } }).output.values,
          [["old"]],
        );
        const files = await tools!.execute("plugin_google__find_files", {
          query: "",
          pageToken: null,
        });
        assert.equal("error" in files, false, JSON.stringify(files));
      },
    );
    await t.test(
      "Google errors remain actionable through MCP without leaking provider messages",
      async () => {
        for (const [status, code] of [
          [400, "connection_google_input_invalid"],
          [403, "connection_google_access_denied"],
          [404, "connection_google_not_found"],
          [429, "connection_google_rate_limited"],
          [500, "connection_google_request_failed"],
        ] as const) {
          state.googleStatus = status;
          const result = await tools!.execute("plugin_google__describe_sheet", {
            fileId: "sheet1",
          });
          assert.equal((result as { code: string }).code, code);
          assert.equal(typeof (result as { error: string }).error, "string");
          for (const secret of [
            "provider-private-error",
            "access-private",
            "refresh-private",
          ]) {
            assert.equal(JSON.stringify(result).includes(secret), false);
          }
        }
      },
    );
  } finally {
    state.googleStatus = 200;
    await tools?.close?.();
  }
}
