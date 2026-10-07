import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const core = path.join(root, "apps/core");
const require = createRequire(path.join(core, "package.json"));

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
  const knex = require("knex");
  const { parse } = require("dotenv");
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
  if (suite === "container-split") {
    const { smokeSplit } = await import("./container/split-smoke.mjs");
    await smokeSplit(process.argv[3], process.argv[4]);
    return;
  }
  if (suite === "container") {
    const { smokeContainer } = await import("./container/smoke.mjs");
    await smokeContainer(process.argv[3]);
    return;
  }
  const suites = [
    "all",
    "core-all",
    "core-unit",
    "core-integration",
    "core-assistant",
    "core-sso",
    "core-browser",
    "core-deployment",
    "core-oauth",
    "core-lavinmq",
    "core-plugins",
    "core-sdk",
    "core-presence",
    "core-beta",
    "core-settings",
    "core-localization",
    "core-schema",
    "core-tags",
    "core-tables",
    "core-materialized",
    "core-visual",
    "core-security",
    "core-integrations",
    "core-connections",
    "core-row-permissions",
    "core-search",
    "core-performance",
    "core-monitoring",
    "core-profile",
    "core-system-collections",
    "ui-unit",
  ];
  if (!suites.includes(suite)) throw new Error(`Unknown suite: ${suite}`);

  if (suite !== "ui-unit") {
    const files = await testFiles("core");
    const selected = files.filter((name) => {
      if (suite === "core-deployment")
        return /test\/(?:browser-|public-server|replica-state|assistant-stream|plugin-actions)/.test(
          name,
        );
      if (suite === "core-browser")
        return /test\/(?:browser-|public-server)/.test(name);
      if (suite === "core-system-collections") {
        return /test\/(?:system-collections|user-relations|user-profiles|profile-avatar|files-access|collections|field-configuration|http-access-surface)[-.]/.test(
          name,
        );
      }
      if (suite === "core-profile") {
        return /test\/(?:user-profiles|user-relations|profile|profile-avatar|profile-extension|preferences|translations|files-access|schema-export|http-access-surface)[-.]/.test(
          name,
        );
      }
      if (suite === "core-tags") {
        return [
          "test/tags.integration.test.ts",
          "test/field-configuration.integration.test.ts",
          "test/field-presentation.integration.test.ts",
          "test/extended-fields.integration.test.ts",
          "test/schema-export.integration.test.ts",
        ].includes(name);
      }
      if (suite === "core-tables") {
        return [
          "test/preferences.integration.test.ts",
          "test/table-views-workspaces.integration.test.ts",
          "test/table-column-widths.integration.test.ts",
        ].includes(name);
      }
      if (suite === "core-monitoring") {
        return (
          name.startsWith("test/monitoring.") ||
          name === "test/http-access-surface.integration.test.ts"
        );
      }
      if (suite === "core-performance") {
        return name === "test/performance.integration.test.ts";
      }
      if (suite === "core-search") {
        return /test\/(?:search(?:-relevance)?|relation-search|row-permissions|preferences|table-views-workspaces|assistant-context|assistant-selection|assistant-data-tools)[-.]/.test(
          name,
        );
      }
      if (suite === "core-materialized") {
        return (
          name.startsWith("test/materialized-") ||
          [
            "test/collections.integration.test.ts",
            "test/schema-export.integration.test.ts",
            "test/field-presentation.integration.test.ts",
            "test/forms-displays.integration.test.ts",
            "test/policy-configuration.integration.test.ts",
            "test/record-draft.integration.test.ts",
            "test/row-permissions.integration.test.ts",
          ].includes(name)
        );
      }
      if (suite === "core-connections") {
        return name.startsWith("test/google-workspace");
      }
      if (suite === "core-integrations") {
        return [
          "test/integrations.integration.test.ts",
          "test/secret-cipher.test.ts",
          "test/files.integration.test.ts",
          "test/files-access.integration.test.ts",
          "test/assistant-settings.integration.test.ts",
          "test/http-access-surface.integration.test.ts",
        ].includes(name);
      }
      if (suite === "core-visual") {
        return name === "test/visual-preview.integration.test.ts";
      }
      if (suite === "core-schema") {
        return [
          "test/schema-export.integration.test.ts",
          "test/sdk-cli.integration.test.ts",
          "test/sdk-plugin-contracts.integration.test.ts",
        ].includes(name);
      }
      if (suite === "core-localization") {
        return [
          "test/translations.integration.test.ts",
          "test/localization-migration.integration.test.ts",
          "test/preferences.integration.test.ts",
          "test/plugin-translations.test.ts",
          "test/plugin-build.test.ts",
          "test/presence.integration.test.ts",
          "test/http-access-surface.integration.test.ts",
        ].includes(name);
      }
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
    const settingsIndex = selected.indexOf(
      "test/integrations.integration.test.ts",
    );
    if (settingsIndex !== -1) {
      // Connection settings are installation-wide; test them without files left by other suites.
      const installationTests = selected.splice(settingsIndex, 1);
      await withTestDatabase((environment) =>
        executeTests("core", installationTests, environment),
      );
    }
    if (selected.some((name) => name.endsWith(".integration.test.ts"))) {
      await withTestDatabase((environment) =>
        executeTests("core", selected, {
          ...environment,
          ...(suite === "core-visual" ? { ASMBLYR_VISUAL_TEST: "1" } : {}),
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
