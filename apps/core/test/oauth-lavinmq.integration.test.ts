import "./support/require-test-database.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { oauthFixture } from "./support/oauth-provider.js";

test(
  "real LavinMQ accepts local HTTP Code+PKCE, verifies RS256 and denies administrator APIs",
  {
    skip: process.env.ASMBLYR_LAVINMQ_TEST !== "1",
  },
  async () => {
    const root = fileURLToPath(new URL("../../../", import.meta.url));
    const configPath = `${root}/.local-data/oauth-lavinmq/lavinmq.ini`;
    const original = await readFile(configPath, "utf8");
    const f = await oauthFixture({
      issuer: "http://localhost:3002/oauth",
      redirectUri: "http://localhost:15673/oauth/callback",
    });
    function restart() {
      execFileSync(
        "docker",
        ["compose", "-f", "infra/oauth-lavinmq/compose.yaml", "restart", "lavinmq"],
        { cwd: root, stdio: "pipe", windowsHide: true },
      );
    }
    try {
      await f.app.listen({ port: 3002, host: "127.0.0.1" });
      const ini = original
        .replace(/^client_id = .*$/m, `client_id = ${f.application.id}`)
        .replace(/^issuer = .*$/m, `issuer = ${f.config.issuer}`);
      await writeFile(configPath, ini);
      restart();
      const broker = "http://localhost:15673";
      const authorize = await fetch(`${broker}/oauth/authorize`);
      assert.equal(authorize.status, 200);
      const lavinCookies = authorize.headers
        .getSetCookie()
        .map((cookie) => cookie.split(";")[0])
        .join("; ");
      const url = new URL((await authorize.json()).authorize_url);
      assert.equal(url.origin, "http://localhost:3002");
      const start = await f.app.inject({ url: url.pathname + url.search });
      assert.equal(start.statusCode, 303, start.body);
      const cookies = start.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
      const uid = new URL(String(start.headers.location)).pathname.split("/").at(-1)!;
      const consent = await f.app.inject({
        method: "POST",
        url: `/oauth-interactions/${uid}`,
        headers: { ...f.auth, cookie: cookies },
        payload: { approve: true, userId: f.users[0] },
      });
      assert.equal(consent.statusCode, 200, consent.body);
      const resume = new URL(consent.json().data.redirectTo);
      const redirected = await f.app.inject({
        url: resume.pathname + resume.search,
        headers: { cookie: cookies },
      });
      assert.equal(redirected.statusCode, 303, redirected.body);
      const callback = await fetch(String(redirected.headers.location), {
        redirect: "manual",
        headers: { cookie: lavinCookies },
      });
      assert.equal(callback.status, 302);
      assert.equal(callback.headers.get("location"), "..");
      const sessionCookies = callback.headers
        .getSetCookie()
        .map((cookie) => cookie.split(";")[0])
        .join("; ");
      assert.match(sessionCookies, /oauth_token=/);
      const whoami = await fetch(`${broker}/api/whoami`, { headers: { cookie: sessionCookies } });
      assert.equal(whoami.status, 200);
      const identity = await whoami.json();
      assert.equal(identity.name, `${f.users[0]}@example.test`);
      assert.equal(String(identity.tags).includes("monitoring"), true);
      assert.equal(String(identity.tags).includes("administrator"), false);
      const overview = await fetch(`${broker}/api/overview`, {
        headers: { cookie: sessionCookies },
      });
      assert.equal(overview.status, 200);
      const users = await fetch(`${broker}/api/users`, { headers: { cookie: sessionCookies } });
      assert.ok([401, 403].includes(users.status));
    } finally {
      await writeFile(configPath, original);
      restart();
      await f.close();
    }
  },
);
