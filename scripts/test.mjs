import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const core = path.join(root, "apps/core");
const require = createRequire(path.join(core, "package.json"));
const knex = require("knex");
const { parse } = require("dotenv");

async function executeTests(app, files, environment = {}) {
  if (!files.length) return;

  const child = spawn(
    process.execPath,
    [
      require.resolve("tsx/cli"),
      ...(app === "ui" ? ["--tsconfig", "tsconfig.test.json"] : []),
      "--test",
      "--test-concurrency=1",
      ...files,
    ],
    {
      cwd: path.join(root, "apps", app),
      env: { ...process.env, ...environment },
      stdio: "inherit",
      windowsHide: true,
    },
  );
  const stop = () => child.kill();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    const code = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", resolve);
    });
    if (code !== 0)
      throw new Error(`${app} tests failed (${code ?? "interrupted"})`);
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}

async function withTestDatabase(run) {
  let local = {};
  try {
    local = parse(await readFile(path.join(core, ".env")));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const connection =
    process.env.TEST_DATABASE_ADMIN_URL ??
    process.env.DATABASE_URL ??
    local.DATABASE_URL;
  if (!connection)
    throw new Error("Set TEST_DATABASE_ADMIN_URL to local PostgreSQL");

  const adminUrl = new URL(connection);
  const isolatedCiService =
    process.env.CI === "true" &&
    process.env.TEST_DATABASE_ADMIN_URL &&
    adminUrl.hostname === "postgres";
  if (
    !["127.0.0.1", "localhost", "[::1]"].includes(adminUrl.hostname) &&
    !isolatedCiService
  ) {
    throw new Error(
      "Tests require local PostgreSQL; refusing to use a remote database",
    );
  }

  const name = `asmblyr_test_${randomUUID().replaceAll("-", "")}`;
  const databaseUrl = new URL(adminUrl);
  databaseUrl.pathname = `/${name}`;
  const admin = knex({ client: "pg", connection: adminUrl.toString() });
  let database;
  let created = false;

  try {
    await admin.raw("CREATE DATABASE ??", [name]);
    created = true;
    database = knex({ client: "pg", connection: databaseUrl.toString() });
    await database.migrate.latest({
      directory: path.join(core, "migrations"),
      loadExtensions: [".cjs"],
      schemaName: "public",
      tableName: "asmblyr_migrations",
    });
    await run({
      DATABASE_URL: databaseUrl.toString(),
      ASMBLYR_TEST_DATABASE: name,
    });
  } finally {
    try {
      await database?.destroy();
      if (created) await admin.raw("DROP DATABASE ?? WITH (FORCE)", [name]);
    } finally {
      await admin.destroy();
    }
  }
}

async function testFiles(app) {
  const names = await readdir(path.join(root, "apps", app, "test"));
  return names
    .filter((name) => name.endsWith(".test.ts"))
    .sort()
    .map((name) => `test/${name}`);
}

async function main() {
  const suite = process.argv[2] ?? "all";
  const suites = [
    "all",
    "core-all",
    "core-unit",
    "core-integration",
    "core-assistant",
    "core-sso",
    "core-oauth",
    "core-lavinmq",
    "core-plugins",
    "core-sdk",
    "core-presence",
    "core-beta",
    "core-settings",
    "core-security",
    "core-row-permissions",
    "ui-unit",
  ];
  if (!suites.includes(suite)) throw new Error(`Unknown suite: ${suite}`);

  if (suite !== "ui-unit") {
    const files = (await testFiles("core")).filter(
      (name) => !name.endsWith("-ui.integration.test.ts"),
    );
    const selected = files.filter((name) => {
      if (suite === "core-beta") {
        return /test\/(?:passkeys|beta|files-access|http-access-surface|auth)\./.test(
          name,
        );
      }
      if (suite === "core-presence") {
        return [
          "test/presence.integration.test.ts",
          "test/http-access-surface.integration.test.ts",
        ].includes(name);
      }
      if (suite === "core-row-permissions")
        return [
          "test/row-permissions.integration.test.ts",
          "test/collection-state.integration.test.ts",
        ].includes(name);
      if (suite === "core-security") {
        return name === "test/http-access-surface.integration.test.ts";
      }
      if (suite === "core-unit") return !name.endsWith(".integration.test.ts");
      if (suite === "core-integration")
        return name.endsWith(".integration.test.ts");
      if (suite === "core-assistant") return name.startsWith("test/assistant");
      if (suite === "core-sso") return name.startsWith("test/sso");
      if (suite === "core-oauth") return name.startsWith("test/oauth");
      if (suite === "core-lavinmq")
        return name === "test/oauth-lavinmq.integration.test.ts";
      if (suite === "core-settings")
        return (
          /(?:settings|polic(?:y|ies)|services|terms|oauth)(?:[-.]|$)/.test(
            name,
          ) && !name.includes("lavinmq")
        );
      if (suite === "core-plugins") return name.startsWith("test/plugin");
      if (suite === "core-sdk")
        return (
          name.startsWith("test/plugin") ||
          name.startsWith("test/sdk") ||
          [
            "test/item-events.integration.test.ts",
            "test/record-draft.integration.test.ts",
            "test/record-conflicts.integration.test.ts",
            "test/presence.integration.test.ts",
          ].includes(name)
        );
      return true;
    });
    if (selected.some((name) => name.endsWith(".integration.test.ts"))) {
      await withTestDatabase((environment) =>
        executeTests("core", selected, {
          ...environment,
          ...(suite === "core-lavinmq" ? { ASMBLYR_LAVINMQ_TEST: "1" } : {}),
        }),
      );
    } else {
      await executeTests("core", selected);
    }
  }
  if (suite === "all" || suite === "ui-unit") {
    await executeTests("ui", await testFiles("ui"));
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
