import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import { IntegrationService } from "../../src/integrations/service.js";
import { initialValues } from "../../src/integrations/types.js";
import { SecretError } from "../../src/secrets/cipher.js";
import type { integrationsFixture } from "./integrations-fixture.js";

export async function integrationRuntimeCases(
  t: TestContext,
  f: Awaited<ReturnType<typeof integrationsFixture>>,
) {
  const { db, settings, app, replica, admin, actor, options } = f;
  await t.test(
    "files use new connections, disabled connections keep files/secrets, existing buckets cannot change",
    async () => {
      const row = await settings.row();
      await settings.check("storage", {
        revision: row.revision,
        value: row.values.storage,
      });
      assert.equal(f.checks(), 1);
      const uploaded = await app.inject({
        method: "POST",
        url: "/files",
        headers: {
          ...admin,
          "content-type": "application/octet-stream",
          "x-file-name": "test.txt",
          "x-file-type": "text/plain",
        },
        payload: Buffer.from("private-file-content"),
      });
      assert.equal(uploaded.statusCode, 201, uploaded.body);
      const id = uploaded.json().data.id;
      assert.equal(
        (
          await replica.inject({
            url: `/files/${id}/content`,
            headers: admin,
          })
        ).body,
        "private-file-content",
      );
      assert.equal(
        (await app.inject({ url: `/public/files/${id}/content` })).statusCode,
        404,
      );
      await assert.rejects(
        settings.save(
          "storage",
          {
            revision: (await settings.row()).revision,
            value: { ...row.values.storage!, bucket: "wrong-bucket" },
          },
          actor,
        ),
        { code: "integration_storage_has_files" },
      );
      await settings.save(
        "storage",
        {
          revision: (await settings.row()).revision,
          value: { ...row.values.storage!, enabled: false },
        },
        actor,
      );
      assert.equal(
        (await replica.inject({ url: "/files", headers: admin })).json().meta
          .storageConfigured,
        false,
      );
      assert.equal(
        (await settings.snapshot()).storage.secrets.secretAccessKey,
        true,
      );
      await db("asmblyr_files").where({ id }).delete();
      await settings.save(
        "assistant",
        {
          revision: (await settings.row()).revision,
          value: { ...row.values.assistant!, enabled: false },
          secrets: { apiKey: null },
        },
        actor,
      );
      assert.equal(
        (
          await replica.inject({ url: "/assistant/status", headers: admin })
        ).json().data.available,
        false,
      );
      assert.equal((await settings.snapshot()).assistant.secrets.apiKey, false);
    },
  );
  await t.test(
    "partial environment configuration is read-only and never borrows saved credentials",
    async () => {
      const locked = new IntegrationService(db, {
        ...options,
        env: {
          FILES_BUCKET: "env-bucket",
          ASSISTANT_ENABLED: "false",
          OPENAI_API_KEY: "env-private-secret",
          SECRETS_PROVIDER: "local",
        },
      });
      const snapshot = await locked.snapshot();
      assert.equal(snapshot.storage.readOnly, true);
      assert.equal(snapshot.assistant.value.enabled, false);
      assert.equal(snapshot.assistant.secrets.apiKey, true);
      assert.equal(
        JSON.stringify(snapshot).includes("env-private-secret"),
        false,
      );
      for (const section of ["storage", "assistant", "encryption"] as const) {
        await assert.rejects(locked.save(section, {}, actor), {
          code: "integration_environment_locked",
        });
      }
      assert.deepEqual(await locked.reveal(await locked.row(), "storage"), {});
      assert.equal(
        locked.providers.storage(snapshot.storage.value, {}, true),
        null,
      );
    },
  );
  await t.test(
    "missing encryption key cannot save plaintext; snapshots remain readable during provider failure",
    async () => {
      const missing = new IntegrationService(db, { env: {} });
      const before = await missing.row();
      await assert.rejects(
        missing.save(
          "assistant",
          {
            revision: before.revision,
            value: initialValues.assistant,
            secrets: { apiKey: "must-not-leak" },
          },
          actor,
        ),
        SecretError,
      );
      assert.deepEqual(await missing.row(), before);
      assert.ok(await missing.snapshot());
      const swapped = structuredClone(before);
      swapped.secrets["assistant.apiKey"] =
        before.secrets["storage.secretAccessKey"];
      await assert.rejects(settings.reveal(swapped, "assistant"), SecretError);
    },
  );
}
