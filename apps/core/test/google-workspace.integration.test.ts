import "./support/require-test-database.js";
import test from "node:test";
import { googleWorkspaceFixture } from "./support/google-workspace.js";
import { googleAccessCases } from "./support/google-workspace-access.js";
import { googleWritesCases } from "./support/google-workspace-writes.js";
import { googleLifecycleCases } from "./support/google-workspace-lifecycle.js";
import { googleRequestCases } from "./support/google-workspace-requests.js";

// One sequential scenario checks identity, approval and lifecycle against the same grant.
test("Google Workspace: owner-bound OAuth, encrypted tokens, tool parity and one-use human approval", async (t) => {
  const fixture = await googleWorkspaceFixture(t);
  await googleAccessCases(t, fixture);
  await googleRequestCases(t, fixture);
  await googleWritesCases(t, fixture);
  await googleLifecycleCases(t, fixture);
});
