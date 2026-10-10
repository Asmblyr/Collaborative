import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createApp } from "./app.js";
import { ssoFromEnv } from "./auth/sso/config.js";
import { SsoService } from "./auth/sso/service.js";
import { SsoProtocol } from "./auth/sso/protocol.js";
import { oauthFromEnv } from "./oauth/config.js";
import { loadPlugins, readConfiguredRegistryPackages } from "./plugins/load.js";
import {
  disabledExtensionPackages,
  recordExtensionStartup,
} from "./plugins/registry-state.js";
import { passkeysFromEnv } from "./auth/passkeys/config.js";
import { limitsFromEnv } from "./operations/limits.js";
import { cleanupOperations } from "./operations/retention.js";
import knex from "knex";
import { createPublicServer } from "./http/public-server.js";

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "127.0.0.1";

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

const setupToken = process.env.ASMBLYR_SETUP_TOKEN;
if (setupToken && setupToken.length < 32) {
  throw new Error("ASMBLYR_SETUP_TOKEN must contain at least 32 characters");
}

const sso = new SsoService(
  ssoFromEnv(process.env),
  new SsoProtocol(undefined, (diagnostic) => {
    console.warn("SSO provider failure", JSON.stringify(diagnostic));
  }),
);
const projectPackage = new URL("../../../package.json", import.meta.url);
const projectMetadata = JSON.parse(await readFile(projectPackage, "utf8"));
const registryPackages = await readConfiguredRegistryPackages(
  projectPackage,
  true,
);
const registryInstanceId = randomUUID();
const registryFailures = new Map<string, string>();
let disabledPackages: string[] = [];
const registryDatabase = process.env.DATABASE_URL
  ? knex({
      client: "pg",
      connection: process.env.DATABASE_URL,
      pool: { min: 0, max: 1 },
    })
  : null;
if (registryDatabase) {
  disabledPackages = await disabledExtensionPackages(registryDatabase);
}
const plugins = await loadPlugins(projectPackage, {
  sourcePlugins: process.argv.includes("--plugin-sources"),
  disabledPackages,
  registryPackages,
  onFailure: (name, error) => registryFailures.set(name, error),
});
const app = createApp({
  trustProxy: process.env.TRUST_PROXY?.split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  sessionCookiePrefix: process.env.SESSION_COOKIE_PREFIX,
  operationLimits: limitsFromEnv(process.env),
  passkeys: passkeysFromEnv(process.env),
  databaseUrl: process.env.DATABASE_URL,
  setupToken,
  integrations: { env: process.env },
  sso,
  oauth: await oauthFromEnv(process.env),
  registryPackages,
  registryFailures,
  registryInstanceId,
  coreVersion: projectMetadata.version,
  plugins,
});
for (const entry of registryPackages) {
  const error = registryFailures.get(entry.name);
  if (!error) {
    continue;
  }
  app.log.error({
    event:
      entry.validationIssue || entry.approvalIssue
        ? "extension.validation.failed"
        : "extension.startup.failed",
    packageName: entry.name,
    instanceId: registryInstanceId,
    error,
  });
}
const publicPort =
  process.env.PUBLIC_PORT ??
  (process.argv.includes("--with-ui") ? "3000" : undefined);
const publicServer = publicPort
  ? createPublicServer(app, process.env.UI_URL ?? "http://127.0.0.1:3002")
  : undefined;
if (
  publicPort &&
  (!/^\d+$/.test(publicPort) ||
    Number(publicPort) < 1 ||
    Number(publicPort) > 65535 ||
    Number(publicPort) === port)
) {
  throw new Error("PUBLIC_PORT must be a valid port different from PORT");
}
app.addHook("preClose", async () => {
  if (publicServer?.listening) {
    publicServer.closePublicConnections();
    await new Promise<void>((resolve, reject) =>
      publicServer.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
const historyDays = Number(process.env.HISTORY_RETENTION_DAYS ?? 0);
if (!Number.isInteger(historyDays) || historyDays < 0 || historyDays > 3650) {
  throw new Error("Invalid HISTORY_RETENTION_DAYS");
}
const maintenance = process.env.DATABASE_URL
  ? knex({
      client: "pg",
      connection: process.env.DATABASE_URL,
      pool: { min: 0, max: 1 },
    })
  : null;
let cleaning = false;
const cleanupTimer = setInterval(async () => {
  if (!maintenance || cleaning) {
    return;
  }
  cleaning = true;
  try {
    await cleanupOperations(maintenance, historyDays);
  } catch {
    app.log.warn("Maintenance cleanup failed");
  } finally {
    cleaning = false;
  }
}, 60000);
cleanupTimer.unref();
app.addHook("onClose", async () => {
  clearInterval(cleanupTimer);
  await registryDatabase?.destroy();
  await maintenance?.destroy();
});
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    if (stopping) {
      return;
    }
    stopping = true;
    await app.close();
  });
}

try {
  await app.listen({ port, host });
  if (registryDatabase) {
    await recordExtensionStartup(
      registryDatabase,
      registryPackages,
      new Set(plugins.map((plugin) => plugin.name)),
      registryFailures,
      registryInstanceId,
    );
  }
  for (const plugin of plugins) {
    app.log.info({
      event: "extension.startup.succeeded",
      packageName: plugin.name,
      instanceId: registryInstanceId,
    });
  }
  app.log.info({
    event: "extension.reconciliation.completed",
    instanceId: registryInstanceId,
    loaded: plugins.length,
    failed: registryFailures.size,
    disabled: disabledPackages.length,
  });
  if (publicServer && publicPort) {
    await new Promise<void>((resolve, reject) => {
      publicServer.once("error", reject);
      publicServer.listen(Number(publicPort), host, resolve);
    });
  }
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
  await app.close();
}
