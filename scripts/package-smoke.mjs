import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const archives = path.join(root, ".local-data/packages");
// Pnpm 11 may omit npm_execpath or expose a native executable instead of JS.
const pnpm = process.env.npm_execpath ?? "pnpm";
const scriptedPnpm = /\.(?:cjs|mjs|js)$/.test(pnpm);
const registry = process.argv.includes("--registry");
assert.ok(process.argv.slice(2).every((argument) => argument === "--registry"));
async function run(args, cwd = root) {
  const result = await execute(
    scriptedPnpm ? process.execPath : pnpm,
    scriptedPnpm ? [pnpm, ...args] : args,
    {
      cwd,
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  return result.stdout;
}
const allowed = {
  contracts: ["src/", "locales/"],
  sdk: ["dist/"],
  kit: ["dist/", "bin/", "styles/"],
  cli: ["src/"],
};
const dependencies = {};
let version;
await mkdir(archives, { recursive: true });
for (const [name, folders] of Object.entries(allowed)) {
  const metadata = JSON.parse(
    await readFile(path.join(root, "packages", name, "package.json")),
  );
  version ??= metadata.version;
  assert.equal(metadata.version, version);
  assert.equal(metadata.private, undefined);
  assert.equal(metadata.name, `@asmblyr-collaborative/${name}`);
  const archiveName = metadata.name.slice(1).replaceAll("/", "-");
  const tarball = path.join(archives, `${archiveName}-${version}.tgz`);
  await run([
    "--filter",
    metadata.name,
    "pack",
    "--pack-destination",
    archives,
  ]);
  const { stdout: entries } = await execute("tar", ["-tzf", tarball], {
    windowsHide: true,
  });
  for (const entry of entries.trim().split(/\r?\n/)) {
    const file = entry.replace(/^package\//, "");
    const topLevel = ["package.json", "README.md", "LICENSE"].includes(file);
    assert.ok(
      topLevel || folders.some((folder) => file.startsWith(folder)),
      `${name}: unexpected packed file ${file}`,
    );
    assert.doesNotMatch(
      file,
      /(?:^|\/)(?:\.env(?:\.|$)|node_modules|test|\.local-data|\.agents)(?:\/|$)/,
    );
  }
  const { stdout: packedJson } = await execute(
    "tar",
    ["-xOf", tarball, "package/package.json"],
    { windowsHide: true },
  );
  assert.doesNotMatch(packedJson, /workspace:/);
  assert.ok(entries.includes("package/LICENSE"));
  dependencies[metadata.name] = registry
    ? version
    : `file:${tarball.replaceAll("\\", "/")}`;
}

// Outside the workspace: resolution must use the packed files, never source aliases.
const consumer = await mkdtemp(
  path.join(tmpdir(), "asmblyr-package-consumer-"),
);
try {
  const sdkMetadata = JSON.parse(
    await readFile(path.join(root, "packages/sdk/package.json")),
  );
  await writeFile(
    path.join(consumer, "package.json"),
    JSON.stringify(
      {
        name: "asmblyr-package-consumer",
        private: true,
        type: "module",
        dependencies,
        devDependencies: { typescript: sdkMetadata.devDependencies.typescript },
      },
      null,
      2,
    ),
  );
  // Resolve unpublished transitive packages to the same archives. Pnpm 11 reads
  // overrides from workspace settings; the real packed metadata stays intact.
  if (!registry) {
    await writeFile(
      path.join(consumer, "pnpm-workspace.yaml"),
      JSON.stringify({ packages: ["."], overrides: dependencies }),
    );
  }
  await run(["install", "--ignore-scripts", "--no-frozen-lockfile"], consumer);
  assert.match(await run(["exec", "asm", "--help"], consumer), /asm generate/);

  const field = {
    name: "id",
    type: "string",
    nullable: false,
    read: true,
    create: false,
    update: false,
    requiredOnCreate: false,
    filterKind: "scalar",
  };
  const body = {
    version: 1,
    collections: [
      {
        name: "articles",
        mode: "multiple",
        primaryKey: { name: "id", type: "uuid" },
        actions: { read: true, create: true, update: true, delete: true },
        fields: [
          field,
          {
            ...field,
            name: "title",
            create: true,
            update: true,
            requiredOnCreate: true,
            filterKind: "text",
          },
        ],
      },
    ],
    methods: [
      {
        namespace: "calculator",
        id: "calculate",
        path: "/calculator/calculate",
        inputSchema: {
          type: "object",
          properties: { value: { type: "number" } },
          required: ["value"],
          additionalProperties: false,
        },
        outputSchema: {
          type: "object",
          properties: { result: { type: "number" } },
          required: ["result"],
          additionalProperties: false,
        },
      },
    ],
  };
  const snapshot = {
    ...body,
    hash: createHash("sha256").update(JSON.stringify(body)).digest("hex"),
  };
  await writeFile(
    path.join(consumer, "asmblyr.schema.json"),
    JSON.stringify(snapshot),
  );
  await writeFile(
    path.join(consumer, "asmblyr.config.json"),
    JSON.stringify({
      version: 1,
      url: "https://unused.example",
      schemaFile: "asmblyr.schema.json",
      typesFile: "asmblyr.schema.ts",
    }),
  );
  await run(["exec", "asm", "generate"], consumer);
  await run(["exec", "asm", "schema", "check", "--offline"], consumer);
  await writeFile(
    path.join(consumer, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        skipLibCheck: true,
        outDir: "output",
      },
      include: ["*.ts"],
    }),
  );
  await writeFile(
    path.join(consumer, "client.ts"),
    `import { createClient } from "@asmblyr-collaborative/sdk";
import { schema } from "./asmblyr.schema.js";
import "@asmblyr-collaborative/kit/actions";
import type { SchemaSnapshot } from "@asmblyr-collaborative/contracts";
const client = createClient({ baseUrl: "https://unused.example", schema, fetch: async (url) => {
  if (String(url).includes("/calculator/")) return Response.json({ data: { namespace: "calculator", actionId: "calculate", input: { value: 2 }, output: { result: 4 } } });
  return Response.json({ data: [{ id: "one", title: "Packed SDK" }], meta: { total: 1 } });
} });
const rows = await client.Articles.select(a => [a.id, a.title]).where(a => a.title.contains("SDK")).limit(20).exec();
const calculation = await client.plugins.calculator.calculate({ value: 2 });
if (rows[0]?.title !== "Packed SDK" || calculation.result !== 4) throw new Error("Packed client failed");
if (false) {
  // @ts-expect-error: collection must exist
  client.collection("missing");
  // @ts-expect-error: plugin input is required
  client.plugins.calculator.calculate({});
  // @ts-expect-error: selected fields define the response
  (await client.Articles.select(a => [a.id]).exec())[0].title;
}
console.log("Packed runtime and generated types passed");
`,
  );
  await run(["exec", "tsc"], consumer);
  const result = await execute(process.execPath, ["output/client.js"], {
    cwd: consumer,
    windowsHide: true,
  });
  assert.match(result.stdout, /Packed runtime/);
  const exports = JSON.parse(
    await readFile(
      path.join(
        consumer,
        "node_modules/@asmblyr-collaborative/kit/package.json",
      ),
    ),
  ).exports;
  for (const entry of Object.values(exports)) {
    const file = typeof entry === "string" ? entry : entry.default;
    await readFile(
      path.join(consumer, "node_modules/@asmblyr-collaborative/kit", file),
    );
  }
  await import(
    pathToFileURL(
      path.join(
        consumer,
        "node_modules/@asmblyr-collaborative/kit/dist/node/build.js",
      ),
    ).href
  );
  const source = registry ? "npm registry" : "local archives";
  console.log(
    `4 packages ${version} from ${source}: contents, clean install, CLI, generated types and fluent/plugin runtime passed.`,
  );
  console.log(`Archives: ${archives}`);
} finally {
  const target = path.resolve(consumer);
  assert.ok(target.startsWith(path.resolve(tmpdir()) + path.sep));
  await rm(target, { recursive: true, force: true });
}
