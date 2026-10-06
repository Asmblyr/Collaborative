import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
function port(value, fallback) {
  const number = Number(value ?? fallback);
  if (!Number.isInteger(number) || number < 1 || number > 65535) {
    throw new Error(
      "PORT, CORE_PORT and UI_INTERNAL_PORT must be valid TCP ports",
    );
  }
  return String(number);
}

const uiPort = port(process.env.PORT, 3000);
const corePort = port(process.env.CORE_PORT, 3001);
const renderPort = port(process.env.UI_INTERNAL_PORT, 3002);
if (new Set([uiPort, corePort, renderPort]).size !== 3) {
  throw new Error("PORT, CORE_PORT and UI_INTERNAL_PORT must differ");
}
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must point to an external PostgreSQL database");
}

const children = new Set();
let stopping = false;
let timeout;
function stop(exitCode) {
  if (stopping) {
    return;
  }
  stopping = true;
  process.exitCode = exitCode;
  for (const child of children) {
    child.kill("SIGTERM");
  }
  timeout = setTimeout(() => {
    process.exitCode = 1;
    for (const child of children) {
      child.kill("SIGKILL");
    }
  }, 25000);
  timeout.unref();
}

function start(name, directory, file, env) {
  const child = spawn(process.execPath, [file], {
    cwd: path.join(root, directory),
    env,
    stdio: "inherit",
  });
  children.add(child);
  child.once("error", () => {
    console.error(`${name} could not start`);
    stop(1);
  });
  child.once("close", (code, signal) => {
    children.delete(child);
    if (!stopping) {
      console.error(`${name} stopped unexpectedly (${signal ?? code})`);
      stop(1);
    }
    if (!children.size) {
      clearTimeout(timeout);
    }
  });
}

process.once("SIGTERM", () => stop(0));
process.once("SIGINT", () => stop(0));
start("Core", "apps/core", "dist/server.js", {
  ...process.env,
  HOST: "0.0.0.0",
  PORT: corePort,
  PUBLIC_PORT: uiPort,
  UI_URL: `http://127.0.0.1:${renderPort}`,
});
// Core credentials are not needed by the UI process.
start("UI", "ui/apps/ui", "server.js", {
  NODE_ENV: "production",
  NEXT_TELEMETRY_DISABLED: "1",
  HOSTNAME: "127.0.0.1",
  PORT: renderPort,
  CORE_URL: `http://127.0.0.1:${corePort}`,
  ...(process.env.SESSION_COOKIE_PREFIX
    ? { SESSION_COOKIE_PREFIX: process.env.SESSION_COOKIE_PREFIX }
    : {}),
});
