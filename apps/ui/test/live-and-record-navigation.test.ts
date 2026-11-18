import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { createCollectionLiveController } from "../src/components/items/collection-live-controller";
import {
  createRecordLoadCoordinator,
  serializeRecordKey,
} from "../src/components/items/record-load-coordinator";
import { matchingPreloadedRecord } from "../src/components/items/use-item-record-editor";
import {
  mergeRecordHistoryState,
  stripRecordHistoryState,
} from "../src/components/items/use-record-location";
import {
  isIntraWorkspaceShallowPop,
  shallowHistoryState,
} from "../src/lib/history-state";
import { searchReturnHref } from "../src/lib/search";

function collectSourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectSourceFiles(fullPath));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

test("shallowHistoryState preserves Next.js __NA/tree while updating record return state", () => {
  const nextInternalState = {
    __NA: true,
    __PRIVATE_NEXTJS_INTERNALS_TREE: {
      tree: ["", { children: ["items", {}] }],
      renderedSearch: "",
    },
  };

  const openState = mergeRecordHistoryState(
    nextInternalState,
    "/items/articles?page=2&workspace=sales",
  );
  assert.deepEqual(openState, {
    __NA: true,
    __PRIVATE_NEXTJS_INTERNALS_TREE: {
      tree: ["", { children: ["items", {}] }],
      renderedSearch: "",
    },
    asmblyrRecordReturn: "/items/articles?page=2&workspace=sales",
  });

  const preservedState = shallowHistoryState(openState);
  assert.deepEqual(preservedState, openState);

  const closedState = stripRecordHistoryState(openState);
  assert.deepEqual(closedState, nextInternalState);

  assert.deepEqual(
    shallowHistoryState(null, { asmblyrRecordReturn: "/items/a" }),
    {
      __NA: true,
      asmblyrRecordReturn: "/items/a",
    },
  );
});

test("isIntraWorkspaceShallowPop intercepts only same-table record modals and /settings tabs", () => {
  assert.equal(
    isIntraWorkspaceShallowPop(
      { pathname: "/items/articles/42", search: "?workspace=all&page=2" },
      { pathname: "/items/articles", search: "?page=2&workspace=all" },
    ),
    true,
  );
  assert.equal(
    isIntraWorkspaceShallowPop(
      { pathname: "/items/articles", search: "?workspace=all" },
      {
        pathname: "/items/articles/42",
        search: "?workspace=all&panel=comments",
      },
    ),
    true,
  );
  // Pagination or cross-collection or cross-route Back/Forward must propagate to Next.js
  assert.equal(
    isIntraWorkspaceShallowPop(
      { pathname: "/items/articles", search: "?page=2&workspace=all" },
      { pathname: "/items/articles", search: "?workspace=all" },
    ),
    false,
  );
  assert.equal(
    isIntraWorkspaceShallowPop(
      { pathname: "/items/articles/42", search: "?workspace=all" },
      { pathname: "/search", search: "?q=test&workspace=all" },
    ),
    false,
  );
  assert.equal(
    isIntraWorkspaceShallowPop(
      { pathname: "/settings", search: "?tab=profile&workspace=all" },
      { pathname: "/settings", search: "?tab=appearance&workspace=all" },
    ),
    true,
  );
  assert.equal(
    isIntraWorkspaceShallowPop(
      { pathname: "/settings", search: "?tab=profile&workspace=sales" },
      { pathname: "/settings", search: "?tab=profile&workspace=all" },
    ),
    false,
  );
});

test("UI components route shallow URL updates through history-state.ts instead of raw pushState", () => {
  const srcRoot = path.resolve(import.meta.dirname, "../src");
  const allowed = new Set([
    path.normalize("lib/history-state.ts"),
    path.normalize("components/auth/invitation-form.tsx"),
  ]);
  const offenders: string[] = [];
  for (const filePath of collectSourceFiles(srcRoot)) {
    const rel = path.relative(srcRoot, filePath);
    if (allowed.has(rel)) {
      continue;
    }
    const content = readFileSync(filePath, "utf8");
    if (/history\.(?:pushState|replaceState)\s*\(/.test(content)) {
      offenders.push(rel);
    }
  }
  assert.deepEqual(offenders, []);
});

test("preloaded SSR record initializes conflict baseline without disabling subsequent conflict checks", async () => {
  const preloaded = matchingPreloadedRecord({
    id: "42",
    initialRecord: {
      id: "42",
      data: { id: "42", title: "SSR v1" },
      label: "SSR v1",
    },
  });
  assert.deepEqual(preloaded, {
    id: "42",
    data: { id: "42", title: "SSR v1" },
    label: "SSR v1",
  });
  assert.equal(
    matchingPreloadedRecord({
      id: "99",
      initialRecord: { id: "42", data: { id: "42" } },
    }),
    null,
  );
  assert.equal(
    matchingPreloadedRecord({
      id: "42",
      itemEndpoint: "/api/custom/42",
      initialRecord: { id: "42", data: { id: "42" } },
    }),
    null,
  );

  const key = serializeRecordKey("articles", "42");
  const coordinator = createRecordLoadCoordinator(key);

  const conflictOutcome = await coordinator.loadRecord({
    recordKey: key,
    isDirty: () => true,
    read: async () => ({ data: { id: "42", title: "Remote v2" } }),
  });
  assert.deepEqual(conflictOutcome, { kind: "conflict" });

  const cleanOutcome = await coordinator.loadRecord({
    recordKey: key,
    isDirty: () => false,
    read: async () => ({ data: { id: "42", title: "Remote v2" } }),
  });
  assert.deepEqual(cleanOutcome, {
    kind: "loaded",
    initialLoad: false,
    result: { data: { id: "42", title: "Remote v2" } },
  });
});

test("createCollectionLiveController defers refreshes on hidden tab or open modal and flushes once on resume", () => {
  let hidden = false;
  let deferred = false;
  let refreshes = 0;
  const scheduled: (() => void)[] = [];

  const controller = createCollectionLiveController({
    debounceMs: 200,
    isHidden: () => hidden,
    isDeferred: () => deferred,
    onRefresh: () => {
      refreshes += 1;
    },
    schedule: (fn) => {
      scheduled.push(fn);
      return 1 as unknown as ReturnType<typeof setTimeout>;
    },
    cancel: () => {
      scheduled.length = 0;
    },
  });

  controller.notifyChanged();
  controller.notifyChanged();
  assert.equal(refreshes, 0);
  assert.equal(scheduled.length, 1);
  scheduled.shift()?.();
  assert.equal(refreshes, 1);

  hidden = true;
  controller.notifyChanged();
  controller.notifyChanged();
  assert.equal(scheduled.length, 0);
  assert.equal(refreshes, 1);

  deferred = true;
  hidden = false;
  controller.resume();
  assert.equal(refreshes, 1);

  deferred = false;
  controller.resume();
  assert.equal(refreshes, 2);

  controller.resume();
  assert.equal(refreshes, 2);
});

test("searchReturnHref preserves query and valid workspace while dropping invalid params", () => {
  assert.equal(searchReturnHref({}), "/search");
  assert.equal(
    searchReturnHref({ q: "  договор ", workspace: "sales" }),
    "/search?q=%D0%B4%D0%BE%D0%B3%D0%BE%D0%B2%D0%BE%D1%80&workspace=sales",
  );
  assert.equal(
    searchReturnHref({ q: ["ignored"], workspace: "x".repeat(129) }),
    "/search",
  );
});
