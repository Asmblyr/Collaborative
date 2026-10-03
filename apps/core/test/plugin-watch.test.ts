import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const require = createRequire(import.meta.url);

test(
  "dev watch discovers added routes, reloads edits and unregisters deleted routes",
  { timeout: 25000 },
  async (t) => {
    const base = fileURLToPath(new URL("../../../.tmp/", import.meta.url));
    await mkdir(base, { recursive: true });
    const root = await mkdtemp(path.join(base, "plugin-watch-"));
    const local = path.join(root, "plugins/example");
    const api = path.join(local, "server/api/comments");
    await mkdir(api, { recursive: true });
    await mkdir(path.join(root, "node_modules"));
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ type: "module", asmblyr: { plugins: ["watch-plugin"] } }),
    );
    await writeFile(
      path.join(local, "package.json"),
      JSON.stringify({
        name: "watch-plugin",
        type: "module",
        asmblyr: { manifest: { version: 1 } },
        exports: { ".": "./dist/plugin.js", "./package.json": "./package.json" },
      }),
    );
    await writeFile(path.join(local, "plugin.ts"), "export default {};");
    await symlink(local, path.join(root, "node_modules/watch-plugin"), "junction");

    const moduleUrl = (name: string) =>
      JSON.stringify(new URL(`../src/plugins/${name}.ts`, import.meta.url).href);
    const entry = path.join(root, "host.ts");
    await writeFile(
      entry,
      `
import Fastify from ${JSON.stringify(pathToFileURL(require.resolve("fastify")).href)};
import { loadPlugins } from ${moduleUrl("load")};
import { registerPluginBoundary } from ${moduleUrl("routing")};
import { registerPluginRoutes } from ${moduleUrl("routes")};
import { pluginContext } from ${JSON.stringify(new URL("./support/plugin-context.ts", import.meta.url).href)};
const plugins = await loadPlugins(new URL('./package.json', import.meta.url), { sourcePlugins: true });
const app = Fastify();
registerPluginBoundary(app);
registerPluginRoutes(app, plugins, async () => pluginContext({ id: 'watch-user', kind: 'user' }));
const address = await app.listen({ host: '127.0.0.1', port: 0 });
console.log('WATCH_ADDRESS=' + address);
`,
    );

    const watcher = spawn(
      process.execPath,
      [require.resolve("tsx/cli"), "watch", "--include", "plugins/**/*.ts", entry],
      { cwd: root, stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
    );
    let address = "";
    let output = "";
    watcher.stdout.on("data", (chunk) => {
      output += String(chunk);
      const addresses = [...output.matchAll(/WATCH_ADDRESS=(http:\/\/127\.0\.0\.1:\d+)/g)];
      if (addresses.length) address = addresses[addresses.length - 1][1];
    });
    watcher.stderr.on("data", (chunk) => {
      output += String(chunk);
    });
    t.after(async () => {
      if (watcher.pid && watcher.exitCode === null) {
        if (process.platform === "win32") {
          await promisify(execFile)("taskkill", ["/PID", String(watcher.pid), "/T", "/F"], {
            windowsHide: true,
          });
        } else {
          watcher.kill("SIGTERM");
          await new Promise<void>((resolve) => watcher.once("exit", () => resolve()));
        }
      }
      assert.equal(path.dirname(root), path.resolve(base));
      await rm(root, { recursive: true, force: true });
    });

    async function waitFor(status: number, body?: string): Promise<void> {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        try {
          if (address) {
            const response = await fetch(`${address}/comments/check`, {
              signal: AbortSignal.timeout(500),
            });
            if (
              response.status === status &&
              (body === undefined || (await response.text()) === body)
            )
              return;
          }
        } catch {
          // The server is briefly unavailable while tsx replaces its process.
        }
        await setTimeout(50);
      }
      assert.fail(`Expected ${status} ${body ?? ""}; watcher output: ${output}`);
    }

    await waitFor(404);
    const route = path.join(api, "check.get.ts");
    await writeFile(route, "export default () => ({ version: 1 });");
    await waitFor(200, '{"version":1}');
    await writeFile(route, "export default () => ({ version: 2 });");
    await waitFor(200, '{"version":2}');
    await rm(route);
    await waitFor(404);
  },
);
