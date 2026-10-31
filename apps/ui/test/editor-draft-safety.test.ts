import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { isWorkspaceDraftDirty } from "../src/components/workspaces/workspace-editor";
import { isTableViewDraftDirty } from "../src/components/items/table-view-dialog";
import {
  createRecordLoadCoordinator,
  serializeRecordKey,
} from "../src/components/items/record-load-coordinator";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function collectTsxFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsxFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".tsx")) {
      results.push(fullPath);
    }
  }
  return results;
}

function enclosingComponentFunction(node: ts.Node): ts.Node | null {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current)
    ) {
      const parent = current.parent;
      const isDialogRenderProp =
        ts.isJsxExpression(parent) &&
        parent.parent &&
        ts.isJsxElement(parent.parent);
      if (!isDialogRenderProp) {
        return current;
      }
    }
    current = current.parent;
  }
  return null;
}

test("WorkspaceEditor and TableViewDialog track unsaved draft changes accurately", () => {
  assert.equal(
    isWorkspaceDraftDirty(null, {
      name: "",
      description: "",
      selected: new Set(),
    }),
    false,
  );
  assert.equal(
    isWorkspaceDraftDirty(null, {
      name: "Каталог",
      description: "",
      selected: new Set(),
    }),
    true,
    "Entering a workspace name must mark the draft dirty before closing",
  );
  assert.equal(
    isWorkspaceDraftDirty(
      {
        name: "Продажи",
        description: "CRM",
        collections: ["deals", "contacts"],
      },
      {
        name: "Продажи",
        description: "CRM",
        selected: new Set(["contacts", "deals"]),
      },
    ),
    false,
    "Re-selecting the same collections in a different Set order must stay clean",
  );
  assert.equal(
    isWorkspaceDraftDirty(
      {
        name: "Продажи",
        description: "CRM",
        collections: ["deals", "contacts"],
      },
      {
        name: "Продажи",
        description: "CRM",
        selected: new Set(["contacts"]),
      },
    ),
    true,
  );

  assert.equal(
    isTableViewDraftDirty(undefined, {
      name: "",
      scope: "personal",
      isDefault: false,
    }),
    false,
  );
  assert.equal(
    isTableViewDraftDirty(undefined, {
      name: "К публикации",
      scope: "personal",
      isDefault: false,
    }),
    true,
  );
  assert.equal(
    isTableViewDraftDirty(
      { name: "Общий", scope: "collection", isDefault: true },
      { name: "Общий", scope: "collection", isDefault: true },
    ),
    false,
  );
  assert.equal(
    isTableViewDraftDirty(
      { name: "Общий", scope: "collection", isDefault: true },
      { name: "Общий", scope: "collection", isDefault: false },
    ),
    true,
  );
});

test("no component calls useEditorDraft or useEditorState outside the EditorDialog it renders", () => {
  const srcRoot = path.resolve(import.meta.dirname, "../src");
  const files = collectTsxFiles(srcRoot);
  const violations: string[] = [];

  for (const filePath of files) {
    const sourceText = readFileSync(filePath, "utf8");
    if (
      !sourceText.includes("EditorDialog") ||
      (!sourceText.includes("useEditorDraft") &&
        !sourceText.includes("useEditorState"))
    ) {
      continue;
    }

    const sourceFile = ts.createSourceFile(
      filePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const dialogScopes = new Set<ts.Node>();
    const lifecycleHookCalls: { scope: ts.Node; hook: string; line: number }[] =
      [];

    function visit(node: ts.Node) {
      if (
        (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
        node.tagName.getText(sourceFile) === "EditorDialog"
      ) {
        const scope = enclosingComponentFunction(node);
        if (scope) {
          dialogScopes.add(scope);
        }
      }
      if (ts.isCallExpression(node)) {
        const callee = node.expression.getText(sourceFile);
        if (callee === "useEditorDraft" || callee === "useEditorState") {
          const scope = enclosingComponentFunction(node);
          if (scope) {
            const { line } = sourceFile.getLineAndCharacterOfPosition(
              node.getStart(sourceFile),
            );
            lifecycleHookCalls.push({ scope, hook: callee, line: line + 1 });
          }
        }
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    for (const call of lifecycleHookCalls) {
      if (dialogScopes.has(call.scope)) {
        violations.push(
          `${path.relative(srcRoot, filePath)}:${call.line} calls ${call.hook} in the same component that mounts <EditorDialog>`,
        );
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("keep-open save stays locked until reload finishes and rejects late responses over new edits", async () => {
  const coordinator = createRecordLoadCoordinator();
  const key = serializeRecordKey("articles", "42");

  const initialOutcome = await coordinator.loadRecord({
    recordKey: key,
    isDirty: () => false,
    read: async () => ({ data: { id: "42", title: "v1" } }),
  });
  assert.deepEqual(initialOutcome, {
    kind: "loaded",
    initialLoad: true,
    result: { data: { id: "42", title: "v1" } },
  });

  // Start a stale background reload before the user clicks "Save".
  const staleRead = deferred<{ data: { id: string; title: string } }>();
  let staleSignal: AbortSignal | undefined;
  const staleLoadPromise = coordinator.loadRecord({
    recordKey: key,
    isDirty: () => false,
    read: (signal) => {
      staleSignal = signal;
      return staleRead.promise;
    },
  });

  const commitDeferred = deferred<string>();
  const reloadDeferred = deferred<{ data: { id: string; title: string } }>();
  let saveResolved = false;

  const savePromise = coordinator
    .runKeepOpenSave({
      recordKey: (savedId) => serializeRecordKey("articles", savedId),
      commit: () => commitDeferred.promise,
      read: () => reloadDeferred.promise,
    })
    .then((outcome) => {
      saveResolved = true;
      return outcome;
    });

  assert.equal(
    staleSignal?.aborted,
    true,
    "Starting save must abort any in-flight background load immediately",
  );
  assert.equal(coordinator.isSaving(), true);

  // Even if the stale fetch ignores AbortSignal and resolves late, it must be ignored.
  staleRead.resolve({ data: { id: "42", title: "stale-v1" } });
  assert.deepEqual(await staleLoadPromise, { kind: "ignored" });

  // Commit finishes on the server, while post-save reload is still in flight.
  commitDeferred.resolve("42");
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(
    saveResolved,
    false,
    "Keep-open save must not unlock before post-save reload completes",
  );
  assert.equal(coordinator.isSaving(), true);

  // SSE-triggered background reload arriving during save+reload is ignored.
  assert.deepEqual(
    await coordinator.loadRecord({
      recordKey: key,
      isDirty: () => false,
      read: async () => ({ data: { id: "42", title: "sse-duplicate" } }),
    }),
    { kind: "ignored" },
  );

  // Post-save reload finishes -> save resolves atomically with fresh snapshot.
  reloadDeferred.resolve({ data: { id: "42", title: "v2" } });
  const saveOutcome = await savePromise;
  assert.equal(saveResolved, true);
  assert.equal(coordinator.isSaving(), false);
  assert.deepEqual(saveOutcome, {
    kind: "reloaded",
    id: "42",
    result: { data: { id: "42", title: "v2" } },
  });

  // Now a background SSE reload starts, and the user types a new edit before it finishes.
  const backgroundRead = deferred<{ data: { id: string; title: string } }>();
  let formDirty = false;
  const backgroundPromise = coordinator.loadRecord({
    recordKey: key,
    isDirty: () => formDirty,
    read: () => backgroundRead.promise,
  });

  formDirty = true;
  backgroundRead.resolve({ data: { id: "42", title: "v2-late" } });
  const backgroundOutcome = await backgroundPromise;

  assert.deepEqual(
    backgroundOutcome,
    { kind: "conflict" },
    "Late reload after keep-open save must never overwrite new user input",
  );
});

test("post-save reload failure reports reload-failed without losing commit state", async () => {
  const coordinator = createRecordLoadCoordinator();
  const key = serializeRecordKey("articles", "7");

  const outcome = await coordinator.runKeepOpenSave({
    recordKey: (savedId) => serializeRecordKey("articles", savedId),
    commit: async () => "7",
    read: async () => {
      throw new Error("Gateway timeout");
    },
  });

  assert.equal(outcome.kind, "reload-failed");
  assert.equal(outcome.id, "7");
  assert.equal(coordinator.isSaving(), false);

  const recovery = await coordinator.loadRecord({
    recordKey: key,
    isDirty: () => false,
    read: async () => ({ data: { id: "7", title: "Recovered" } }),
  });
  assert.deepEqual(recovery, {
    kind: "loaded",
    initialLoad: true,
    result: { data: { id: "7", title: "Recovered" } },
  });
});
