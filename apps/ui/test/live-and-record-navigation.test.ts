import assert from "node:assert/strict";
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
import { searchReturnHref } from "../src/lib/search";

test("mergeRecordHistoryState and stripRecordHistoryState preserve Next.js history state", () => {
  const nextInternalState = {
    __NA: true,
    tree: ["", { children: ["items", {}] }],
    key: "nav-key-1",
  };
  const merged = mergeRecordHistoryState(
    nextInternalState,
    "/items/articles?page=2",
  );
  assert.deepEqual(merged, {
    __NA: true,
    tree: ["", { children: ["items", {}] }],
    key: "nav-key-1",
    asmblyrRecordReturn: "/items/articles?page=2",
  });

  const stripped = stripRecordHistoryState(merged);
  assert.deepEqual(stripped, nextInternalState);
  assert.equal(stripRecordHistoryState(null), null);
  assert.deepEqual(mergeRecordHistoryState(null, "/items/articles"), {
    asmblyrRecordReturn: "/items/articles",
  });
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

  // Subsequent SSE reload when user already edited the preloaded record -> conflict!
  const conflictOutcome = await coordinator.loadRecord({
    recordKey: key,
    isDirty: () => true,
    read: async () => ({ data: { id: "42", title: "Remote v2" } }),
  });
  assert.deepEqual(conflictOutcome, { kind: "conflict" });

  // Clean background reload updates without resetting initialLoad to true.
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

  // Active tab & no modal -> coalesces multiple events into 1 refresh.
  controller.notifyChanged();
  controller.notifyChanged();
  assert.equal(refreshes, 0);
  assert.equal(scheduled.length, 1);
  scheduled.shift()?.();
  assert.equal(refreshes, 1);

  // Hidden tab -> marks pending without scheduling a timer, flushes once on resume.
  hidden = true;
  controller.notifyChanged();
  controller.notifyChanged();
  assert.equal(scheduled.length, 0);
  assert.equal(refreshes, 1);

  // Still deferred by modal when tab becomes visible -> waits until modal closes too.
  deferred = true;
  hidden = false;
  controller.resume();
  assert.equal(refreshes, 1);

  deferred = false;
  controller.resume();
  assert.equal(refreshes, 2);

  // Calling resume again without new events is a no-op.
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
