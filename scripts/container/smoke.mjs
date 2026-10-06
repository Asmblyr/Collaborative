import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";

const execute = promisify(execFile);
async function docker(...args) {
  try {
    const result = await execute("docker", args, {
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
    });
    return result.stdout.trim();
  } catch {
    // Docker arguments can contain ephemeral database credentials.
    throw new Error(`Container check failed during docker ${args[0]}`);
  }
}

async function until(check, message) {
  for (let attempt = 0; attempt < 90; attempt++) {
    try {
      if (await check()) {
        return;
      }
    } catch {
      // PostgreSQL and both application listeners need time to start.
    }
    await delay(1000);
  }
  throw new Error(message);
}

export async function smokeContainer(image = "asmblyr-collaborative:verify") {
  const name = `asmblyr-container-test-${randomBytes(6).toString("hex")}`;
  const database = `${name}-db`;
  const app = `${name}-app`;
  const secret = randomBytes(24).toString("hex");
  const databaseUrl = `postgresql://asmblyr:${secret}@${database}:5432/asmblyr_test`;
  const credentials = { email: "container@example.test", password: secret };
  let networkCreated = false;
  let databaseCreated = false;
  let appCreated = false;
  try {
    await docker("network", "create", name);
    networkCreated = true;
    await docker(
      "run",
      "-d",
      "--name",
      database,
      "--network",
      name,
      "--tmpfs",
      "/var/lib/postgresql/data",
      "-e",
      "POSTGRES_USER=asmblyr",
      "-e",
      `POSTGRES_PASSWORD=${secret}`,
      "-e",
      "POSTGRES_DB=asmblyr_test",
      "postgres:17-alpine",
    );
    databaseCreated = true;
    await until(async () => {
      await docker(
        "exec",
        database,
        "pg_isready",
        "-U",
        "asmblyr",
        "-d",
        "asmblyr_test",
      );
      return true;
    }, "Temporary PostgreSQL did not start");
    const migrate = () =>
      docker(
        "run",
        "--rm",
        "--network",
        name,
        "-e",
        `DATABASE_URL=${databaseUrl}`,
        image,
        "node",
        "scripts/container/migrate.mjs",
      );
    console.log(await migrate());
    assert.match(
      await migrate(),
      /0 applied/,
      "Repeated migrations must be a no-op",
    );
    await docker(
      "run",
      "-d",
      "--name",
      app,
      "--network",
      name,
      "-p",
      "127.0.0.1::3000",
      "-p",
      "127.0.0.1::3001",
      "-e",
      `DATABASE_URL=${databaseUrl}`,
      "-e",
      `ASMBLYR_SETUP_TOKEN=${secret}`,
      "-e",
      "AUTH_UI_URL=http://localhost:3000",
      image,
    );
    appCreated = true;
    const ui = `http://${await docker("port", app, "3000")}`;
    const api = `http://${await docker("port", app, "3001")}`;
    await until(async () => {
      await docker("exec", app, "node", "scripts/container/health.mjs");
      return true;
    }, "Application did not become healthy");

    const html = await (await fetch(`${ui}/setup`)).text();
    assert.match(html, /<html/);
    const assets = [
      ...new Set(html.match(/\/_next\/static\/[^"<>\s]+\.(?:js|css)/g)),
    ];
    assert.ok(assets.length > 0, "UI must contain production assets");
    for (const asset of assets) {
      assert.equal((await fetch(`${ui}${asset}`)).status, 200, asset);
    }
    assert.equal((await fetch(`${api}/collections`)).status, 401);
    const setup = await fetch(`${ui}/api/auth/setup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...credentials, setupToken: secret }),
    });
    assert.equal(setup.status, 201, "UI must reach Core for initial setup");
    const login = await fetch(`${api}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(credentials),
    });
    assert.equal(login.status, 200, "Direct API login must work");
    const { accessToken } = await login.json();
    const headers = { authorization: `Bearer ${accessToken}` };
    assert.equal((await fetch(`${api}/collections`, { headers })).status, 200);
    assert.equal(
      (await fetch(`${api}/system-collections`, { headers })).status,
      200,
    );
    const admin = await fetch(`${ui}/admin/collections`, {
      headers: { cookie: `asmblyr_access=${accessToken}` },
      redirect: "manual",
    });
    assert.equal(
      admin.status,
      200,
      "Authenticated UI must render through its bundled SDK",
    );
    console.log(
      "UI assets, setup, direct authenticated API and admin page: passed",
    );

    await docker("stop", "--time", "30", app);
    assert.equal(
      await docker("inspect", "--format", "{{.State.ExitCode}}", app),
      "0",
    );
    for (const marker of ["apps/core", "ui/apps/ui"]) {
      await docker("start", app);
      await until(async () => {
        await docker("exec", app, "node", "scripts/container/health.mjs");
        return true;
      }, "Application did not restart");
      await docker(
        "exec",
        app,
        "node",
        "--input-type=module",
        "-e",
        `
        import {readdir, readlink} from 'node:fs/promises';
        for (const pid of await readdir('/proc')) {
          if (!/^\\d+$/.test(pid) || Number(pid) === process.pid) {
            continue;
          }
          try {
            if ((await readlink('/proc/' + pid + '/cwd')).endsWith('${marker}')) {
              process.kill(Number(pid), 'SIGKILL');
              break;
            }
          } catch {}
        }
      `,
      );
      await until(
        async () =>
          (await docker("inspect", "--format", "{{.State.Running}}", app)) ===
          "false",
        "Container stayed alive after a service failure",
      );
      assert.equal(
        await docker("inspect", "--format", "{{.State.ExitCode}}", app),
        "1",
      );
    }
    console.log(
      "Graceful stop and shutdown after either service fails: passed",
    );
  } finally {
    if (appCreated) {
      await docker("rm", "-f", app);
    }
    if (databaseCreated) {
      await docker("rm", "-f", database);
    }
    if (networkCreated) {
      await docker("network", "rm", name);
    }
  }
}
