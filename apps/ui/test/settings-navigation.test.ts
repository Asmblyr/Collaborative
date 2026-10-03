import assert from "node:assert/strict";
import test from "node:test";
import {
  availableSettings,
  settingsCatalog,
  settingsHref,
} from "../src/components/system-settings/sections";
import { policyDraft } from "../src/components/access/policy-draft";

test("settings navigation contains only editable sections and keeps collection grants separate", () => {
  assert.deepEqual(availableSettings([]), []);
  assert.deepEqual(
    availableSettings(["assistant"]).map((entry) => entry.id),
    ["assistant"],
  );
  assert.equal(
    new Set(settingsCatalog.map((entry) => settingsHref(entry.id))).size,
    settingsCatalog.length,
  );
  assert.deepEqual(
    policyDraft("p", [
      {
        id: "s",
        section: "assistant",
        action: "update",
        fields: ["*"],
        policyIds: ["p"],
      },
      {
        id: "d",
        collection: "articles",
        action: "read",
        fields: ["title"],
        policyIds: ["p"],
      },
    ]),
    [{ collection: "articles", action: "read", fields: ["title"] }],
  );
});
