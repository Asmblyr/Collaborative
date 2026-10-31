import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { CORE_VERSION } from "../src/version.js";
import {
  parseRegistryPackage,
  type RegistryPackage,
} from "../src/plugins/registry-manifest.js";
import { resolveRegistryPackages } from "../src/plugins/registry-resolver.js";
import { parseExtensionListQuery } from "../src/plugins/registry-query.js";
import {
  loadPlugins,
  readConfiguredRegistryPackages,
} from "../src/plugins/load.js";

function fixture(
  name: string,
  dependencies: Record<string, string> = {},
): RegistryPackage {
  return parseRegistryPackage(
    {
      name,
      version: "1.2.0",
      asmblyr: { manifest: { version: 1, namespace: name, dependencies } },
    },
    name,
  );
}

test("npm names inherited from Object.prototype remain valid dependency keys", () => {
  const dependency = fixture("constructor");
  const consumer = fixture("consumer", { constructor: "^1.0.0" });
  const result = resolveRegistryPackages([consumer, dependency], "0.0.0");
  assert.deepEqual(result.order, ["constructor", "consumer"]);
  assert.equal(result.issues.constructor, undefined);
  assert.equal(result.issues.consumer, undefined);
  assert.throws(
    () => fixture("constructor", { constructor: "*" }),
    /cannot depend on itself/,
  );
  const incompatible = {
    ...dependency,
    manifest: {
      ...dependency.manifest,
      compatibility: { collaborative: ">=99.0.0" },
    },
  };
  assert.match(
    resolveRegistryPackages([incompatible], "0.0.0").issues.constructor[0],
    /Requires Collaborative/,
  );
});

test("a constructor-named package failure reaches onFailure instead of aborting Core startup", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "asmblyr-registry-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const projectFile = path.join(directory, "package.json");
  await writeFile(
    projectFile,
    JSON.stringify({
      version: "99.0.0",
      asmblyr: { plugins: ["constructor"] },
    }),
  );
  const failures = new Map<string, string>();
  const plugins = await loadPlugins(pathToFileURL(projectFile), {
    registryPackages: [fixture("constructor")],
    onFailure: (name, error) => failures.set(name, error),
  });
  assert.deepEqual(plugins, []);
  assert.match(failures.get("constructor")!, /Cannot find module/);
});

test("host project versions cannot override the installed Core compatibility", async (t) => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "asmblyr-registry-version-"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  const projectFile = path.join(directory, "package.json");
  await writeFile(
    projectFile,
    JSON.stringify({
      version: "99.0.0",
      asmblyr: { plugins: ["future-core"] },
    }),
  );
  const entry = parseRegistryPackage(
    {
      name: "future-core",
      version: "1.0.0",
      asmblyr: {
        manifest: { version: 1, compatibility: { collaborative: ">=98.0.0" } },
      },
    },
    "future-core",
  );
  const failures = new Map<string, string>();
  const plugins = await loadPlugins(pathToFileURL(projectFile), {
    registryPackages: [entry],
    onFailure: (name, error) => failures.set(name, error),
  });
  assert.deepEqual(plugins, []);
  assert.equal(
    failures.get(entry.name),
    `Requires Collaborative >=98.0.0; current ${CORE_VERSION}`,
  );
  const supported = {
    ...entry,
    manifest: {
      ...entry.manifest,
      compatibility: { collaborative: ">=0.1.0-0" },
    },
  };
  assert.equal(
    resolveRegistryPackages([supported], CORE_VERSION).issues[entry.name],
    undefined,
  );
});

test("registry manifest validates versions, ranges and identity", () => {
  assert.equal(fixture("alpha").version, "1.2.0");
  assert.throws(() =>
    parseRegistryPackage(
      {
        name: "alpha",
        version: "latest",
        asmblyr: { manifest: { version: 1 } },
      },
      "alpha",
    ),
  );
  assert.throws(() =>
    parseRegistryPackage(
      {
        name: "alpha",
        version: "1.0.0",
        asmblyr: { manifest: { version: 1, dependencies: { beta: "latest" } } },
      },
      "alpha",
    ),
  );
  assert.throws(() =>
    parseRegistryPackage(
      {
        name: "alpha",
        version: "1.0.0",
        asmblyr: { manifest: { version: 1 } },
      },
      "beta",
    ),
  );
});

test("resolver orders dependencies and diagnoses absence, ranges, cycles and Core compatibility", () => {
  const alpha = fixture("alpha", { beta: "^1.0.0" });
  const beta = fixture("beta");
  assert.deepEqual(resolveRegistryPackages([alpha, beta], "0.0.0").order, [
    "beta",
    "alpha",
  ]);
  assert.match(
    resolveRegistryPackages([alpha], "0.0.0").issues.alpha[0],
    /Missing/,
  );
  assert.match(
    resolveRegistryPackages(
      [fixture("alpha", { beta: "^2.0.0" }), beta],
      "0.0.0",
    ).issues.alpha[0],
    /requires/,
  );
  assert.match(
    resolveRegistryPackages([alpha, fixture("beta", { alpha: "*" })], "0.0.0")
      .issues.beta[0],
    /cycle/,
  );
  const incompatible = parseRegistryPackage(
    {
      name: "gamma",
      version: "1.0.0",
      asmblyr: {
        manifest: { version: 1, compatibility: { collaborative: ">=2.0.0" } },
      },
    },
    "gamma",
  );
  assert.match(
    resolveRegistryPackages([incompatible], "0.0.0").issues.gamma[0],
    /Requires Collaborative/,
  );
  const duplicateNamespace = parseRegistryPackage(
    {
      name: "other",
      version: "1.0.0",
      asmblyr: { manifest: { version: 1, namespace: "alpha" } },
    },
    "other",
  );
  assert.match(
    resolveRegistryPackages([fixture("alpha"), duplicateNamespace], "0.0.0")
      .issues.other[0],
    /Namespace alpha/,
  );
});

test("registry list query rejects malformed and duplicate parameter values", () => {
  assert.deepEqual(parseExtensionListQuery({}), {
    page: 1,
    limit: 20,
    search: "",
    status: "",
    category: "",
    sort: "title",
  });
  for (const value of [
    { limit: "101" },
    { page: "1e3" },
    { page: ["1", "2"] },
    { status: "unknown" },
    { sort: "arbitrary" },
    { unexpected: "x" },
  ]) {
    assert.throws(() => parseExtensionListQuery(value), { statusCode: 400 });
  }
});

test("startup excludes a disabled trusted package before importing its routes", async () => {
  const plugins = await loadPlugins(
    new URL("../../../package.json", import.meta.url),
    {
      disabledPackages: ["@asmblyr-collaborative/plugin-comments"],
    },
  );
  assert.ok(plugins.some((plugin) => plugin.namespace === "google"));
  assert.ok(!plugins.some((plugin) => plugin.namespace === "comments"));
});

test("startup isolates invalid trusted packages and reports the failure", async () => {
  const project = new URL("../../../package.json", import.meta.url);
  const configured = await readConfiguredRegistryPackages(project);
  const comments = configured.find(
    (entry) => entry.name === "@asmblyr-collaborative/plugin-comments",
  )!;
  const failures = new Map<string, string>();
  const plugins = await loadPlugins(project, {
    registryPackages: [
      { ...comments, validationIssue: "Unsupported manifest" },
    ],
    onFailure: (name, error) => failures.set(name, error),
  });
  assert.equal(plugins.length, 0);
  assert.equal(failures.get(comments.name), "Unsupported manifest");
});
