import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { docker, until } from "./smoke.mjs";
import { verifyHttp } from "./verify-http.mjs";

export async function smokeSplit(coreImage, uiImage) {
  if (!coreImage || !uiImage) throw new Error("Pass both Core and UI images");
  const name = `asmblyr-split-test-${randomBytes(6).toString("hex")}`;
  const secret = randomBytes(24).toString("hex");
  const db = `${name}-db`,
    core = `${name}-core`,
    ui = `${name}-ui`;
  let network = false;
  const containers = [];
  try {
    await docker("network", "create", name);
    network = true;
    await docker(
      "run",
      "-d",
      "--name",
      db,
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
    containers.push(db);
    await until(async () => {
      await docker("exec", db, "pg_isready", "-U", "asmblyr");
      return true;
    }, "PostgreSQL did not start");
    const databaseUrl = `postgresql://asmblyr:${secret}@${db}:5432/asmblyr_test`;
    const migrate = () =>
      docker(
        "run",
        "--rm",
        "--network",
        name,
        "-e",
        `DATABASE_URL=${databaseUrl}`,
        coreImage,
        "node",
        "scripts/container/migrate.mjs",
      );
    console.log(await migrate());
    assert.match(await migrate(), /0 applied/);
    await docker(
      "run",
      "-d",
      "--name",
      core,
      "--network",
      name,
      "-p",
      "127.0.0.1::3000",
      "-p",
      "127.0.0.1::3001",
      "--read-only",
      "--tmpfs",
      "/tmp",
      "-e",
      `DATABASE_URL=${databaseUrl}`,
      "-e",
      `ASMBLYR_SETUP_TOKEN=${secret}`,
      "-e",
      "AUTH_UI_URL=http://localhost:3000",
      "-e",
      "PUBLIC_PORT=3000",
      "-e",
      `UI_URL=http://${ui}:3000`,
      coreImage,
    );
    containers.push(core);
    await docker(
      "run",
      "-d",
      "--name",
      ui,
      "--network",
      name,
      "--read-only",
      "--tmpfs",
      "/tmp",
      "--tmpfs",
      "/app/apps/ui/.next/cache:uid=1000,gid=1000",
      "-e",
      `CORE_URL=http://${core}:3001`,
      uiImage,
    );
    containers.push(ui);
    const publicUrl = `http://${await docker("port", core, "3000")}`;
    const api = `http://${await docker("port", core, "3001")}`;
    await until(
      async () =>
        (await fetch(`${api}/ready`)).ok &&
        (await fetch(`${publicUrl}/healthz`)).ok,
      "Split application did not start",
    );
    await verifyHttp({ ui: publicUrl, api, secret });
    const environment = JSON.parse(
      await docker("inspect", "--format", "{{json .Config.Env}}", ui),
    );
    assert.equal(
      environment.some((value) =>
        /^(DATABASE_URL|SECRETS_LOCAL_KEY|ASMBLYR_SETUP_TOKEN)=/.test(value),
      ),
      false,
    );
    await docker("stop", "--time", "40", ui);
    assert.equal((await fetch(`${publicUrl}/api/health`)).status, 200);
    assert.equal((await fetch(`${publicUrl}/login`)).status, 503);
    await docker("start", ui);
    await until(
      async () => (await fetch(`${publicUrl}/healthz`)).ok,
      "UI did not restart",
    );
    for (const container of [ui, core]) {
      await docker("stop", "--time", "40", container);
      const exitCode = await docker(
        "inspect",
        "--format",
        "{{.State.ExitCode}}",
        container,
      );
      // Next's standalone SIGTERM handler exits 128 + SIGTERM after draining requests.
      assert.ok(
        (container === ui ? ["0", "143"] : ["0"]).includes(exitCode),
        `Unexpected ${container === ui ? "UI" : "Core"} exit ${exitCode}`,
      );
    }
    console.log(
      "Split images: isolated credentials, UI failure, restart and graceful stop passed",
    );
  } finally {
    for (const container of containers.reverse())
      await docker("rm", "-f", container);
    if (network) await docker("network", "rm", name);
  }
}
