import assert from "node:assert/strict";
import test from "node:test";
import { createServer, request } from "node:http";
import { once } from "node:events";
import type { Duplex } from "node:stream";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app.js";
import { createPublicServer, isCorePath } from "../src/http/public-server.js";

test("single-domain listener sends API directly to Core, preserves UI responses and keeps failures separate", async (t) => {
  const seen: string[] = [];
  const ui = createServer((request, response) => {
    seen.push(request.url!);
    response.writeHead(200, {
      "content-type": "text/html",
      "set-cookie": ["one=1", "two=2"],
    });
    response.end("<html>UI</html>");
  });
  ui.on("upgrade", (_request, socket) => {
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n",
    );
    socket.on("end", () => socket.end());
  });
  await new Promise<void>((resolve) => ui.listen(0, "127.0.0.1", resolve));
  const app = createApp({ logger: false });
  await app.ready();
  const server = createPublicServer(
    app,
    `http://127.0.0.1:${(ui.address() as AddressInfo).port}`,
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closePublicConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (ui.listening) {
      ui.closeAllConnections();
      await new Promise<void>((resolve) => ui.close(() => resolve()));
    }
    await app.close();
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const health = await fetch(`${base}/api/health`);
  assert.deepEqual(await health.json(), { status: "ok", service: "core" });
  assert.deepEqual(seen, []);
  const page = await fetch(`${base}/admin/collections?q=test`);
  assert.equal(await page.text(), "<html>UI</html>");
  assert.deepEqual(page.headers.getSetCookie(), ["one=1", "two=2"]);
  assert.deepEqual(seen, ["/admin/collections?q=test"]);
  assert.equal((await fetch(`${base}/api/does-not-exist`)).status, 404);
  assert.equal(seen.length, 1);
  const upgraded = await new Promise<Duplex>((resolve, reject) => {
    const hotReload = request(`${base}/_next/webpack-hmr`, {
      headers: { connection: "Upgrade", upgrade: "websocket" },
    });
    hotReload.once("upgrade", (_response, socket) => resolve(socket));
    hotReload.once("error", reject);
    hotReload.end();
  });
  const disconnected = once(upgraded, "close");
  upgraded.resume();
  server.closePublicConnections();
  await disconnected;
  ui.closeAllConnections();
  await new Promise<void>((resolve) => ui.close(() => resolve()));
  assert.equal((await fetch(`${base}/login`)).status, 503);
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
  for (const path of [
    "/api",
    "/api/items/articles",
    "/sign/sso/okkam/callback?code=hidden",
    "/connections/google/callback",
    "/oauth/token",
  ])
    assert.equal(isCorePath(path), true, path);
  for (const path of [
    "/admin/collections",
    "/items/articles",
    "/oauth/interaction/test",
    "/_next/static/test.js",
  ])
    assert.equal(isCorePath(path), false, path);
});
