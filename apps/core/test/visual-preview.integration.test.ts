import "./support/require-test-database.js";
import test from "node:test";
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { createRequire } from "node:module";
import { createWriteStream } from "node:fs";
import { access, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import knex from "knex";
import { createApp } from "../src/app.js";
import { createPublicServer } from "../src/http/public-server.js";
import { bootstrapSuperuser } from "../src/auth/users.js";
import { issueUserTokens } from "../src/auth/tokens.js";
import { loadPlugins } from "../src/plugins/load.js";

// Opt-in browser fixture. scripts/test.mjs owns and drops the isolated database.
test(
  "disposable visual review environment",
  {
    skip: process.env.ASMBLYR_VISUAL_TEST !== "1",
    timeout: 1_200_000,
  },
  async (t) => {
    const root = path.resolve("../..");
    const stopFile = path.join(root, ".local-data/visual-stop");
    await mkdir(path.dirname(stopFile), { recursive: true });
    await rm(stopFile, { force: true });
    const database = knex({
      client: "pg",
      connection: process.env.DATABASE_URL,
    });
    const app = createApp({
      databaseUrl: process.env.DATABASE_URL,
      logger: false,
      sessionCookiePrefix: "asmblyr_visual",
      passkeys: {
        origin: "http://localhost:3341",
        rpId: "localhost",
        rpName: "Visual review",
      },
      integrations: {
        env: {
          SECRETS_LOCAL_KEY: "dmlzdWFsLWZpeHR1cmUtb25seS1ub3QtcHJvZC1rZXk",
          ASSISTANT_ENABLED: "false",
          OPENAI_API_KEY: "visual-fixture-only-provider-key",
          OPENAI_API_MODEL: "visual-disabled-model",
        },
      },
      plugins: await loadPlugins(
        new URL("../../../package.json", import.meta.url),
      ),
    });
    const gateway = createPublicServer(app, "http://127.0.0.1:3342");
    t.after(async () => {
      gateway.closePublicConnections();
      if (gateway.listening)
        await new Promise<void>((resolve) => gateway.close(() => resolve()));
      await app.close();
      await database.destroy();
    });
    const user = await bootstrapSuperuser(
      database,
      "review@example.test",
      "Asmblyr-local-visual-only!2026",
    );
    const tokens = await issueUserTokens(database, user.id);
    async function call(
      method: "POST" | "PUT" | "PATCH",
      url: string,
      payload: object,
    ) {
      const result = await app.inject({
        method,
        url,
        payload,
        headers: { authorization: `Bearer ${tokens.accessToken}` },
      });
      assert.ok(result.statusCode < 300, result.body);
      return result.json().data;
    }
    await call("PATCH", "/users/me", { displayName: "Review", pictureUrl: "" });
    await call("PATCH", "/users/me/preferences", {
      theme: "dark",
      style: "ocean",
      locale: "en",
    });
    const service = await call("POST", "/service-accounts", {
      name: "Catalog worker",
    });
    const serviceKey = await call(
      "POST",
      `/service-accounts/${service.id}/keys`,
      { name: "Production" },
    );
    await call("POST", `/service-accounts/${service.id}/keys`, {
      name: "Unused",
    });
    const serviceToken = await app.inject({
      method: "POST",
      url: "/auth/service-token",
      payload: { key: serviceKey.secret },
    });
    assert.equal(serviceToken.statusCode, 200);
    for (let index = 0; index < 2; index += 1) {
      const result = await app.inject({
        method: "GET",
        url: "/schema",
        headers: {
          authorization: `Bearer ${serviceToken.json().accessToken}`,
        },
      });
      assert.equal(result.statusCode, 200);
    }
    await call("POST", "/collections", {
      name: "articles",
      timestamps: { createdAt: true, updatedAt: true },
      fields: [
        { name: "title", type: "text", required: true },
        { name: "status", type: "text" },
        { name: "price", type: "decimal" },
      ],
    });
    await call("PATCH", "/collections/articles/settings", {
      displayName: "Статьи команды",
      translations: { en: { label: "Team articles" } },
    });
    await call("PUT", "/collections/articles/fields/title/presentation", {
      label: "Название",
      translations: { en: { label: "Title" } },
    });
    await call("PUT", "/collections/articles/fields/status/presentation", {
      label: "Состояние",
      interface: "select",
      options: [
        { value: "draft", label: "Черновик команды" },
        { value: "published", label: "Опубликовано командой" },
      ],
    });
    const article = await call("POST", "/items/articles", {
      title: "Пользовательский текст остаётся исходным",
      status: "draft",
      price: "1000.00",
    });
    await call("PUT", `/comments/articles/${article.id}/subscription`, {
      enabled: true,
    });
    const [colleague] = await database("asmblyr_users")
      .insert({
        email: "colleague@example.test",
        display_name: "Alex",
        superuser: true,
      })
      .returning<{ id: string }[]>("id");
    const colleagueTokens = await issueUserTokens(database, colleague.id);
    for (const body of [
      "Could you check the price before publishing?",
      "I have added context to the draft. Let me know what you think.",
    ]) {
      const response = await app.inject({
        method: "POST",
        url: `/comments/articles/${article.id}`,
        payload: { body },
        headers: { authorization: `Bearer ${colleagueTokens.accessToken}` },
      });
      assert.equal(response.statusCode, 201, response.body);
    }
    await call("POST", "/policies", {
      name: "Редакторы статей · QA",
      userIds: [],
      permissions: [
        {
          collection: "articles",
          action: "read",
          fields: ["*"],
          rowFilter: {
            logic: "and",
            children: [
              {
                field: "title",
                op: "eq",
                value: { kind: "context", path: "user.email" },
              },
            ],
          },
        },
      ],
    });
    await app.listen({ host: "127.0.0.1", port: 4107 });
    await new Promise<void>((resolve, reject) => {
      gateway.once("error", reject);
      gateway.listen(3341, "127.0.0.1", resolve);
    });
    const require = createRequire(path.join(root, "apps/ui/package.json"));
    const log = createWriteStream(
      path.join(root, ".local-data/visual-server.log"),
    );
    const ui = spawn(
      process.execPath,
      [
        require.resolve("next/dist/bin/next"),
        "dev",
        "--hostname",
        "127.0.0.1",
        "--port",
        "3342",
      ],
      {
        cwd: path.join(root, "apps/ui"),
        windowsHide: true,
        env: {
          ...process.env,
          CORE_URL: "http://127.0.0.1:4107",
          SESSION_COOKIE_PREFIX: "asmblyr_visual",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    ui.stdout?.pipe(log);
    ui.stderr?.pipe(log);
    t.after(async () => {
      if (process.platform === "win32" && ui.pid && ui.exitCode === null) {
        await new Promise<void>((resolve) =>
          execFile(
            "taskkill",
            ["/PID", String(ui.pid), "/T", "/F"],
            { windowsHide: true },
            () => resolve(),
          ),
        );
      } else {
        ui.kill();
      }
      log.end();
    });
    console.log(
      "Visual fixture: http://localhost:3341 · review@example.test · stop using .local-data/visual-stop",
    );
    while (ui.exitCode === null) {
      try {
        await access(stopFile);
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    throw new Error("Visual UI exited before review finished");
  },
);
