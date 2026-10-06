import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { IntegrationService } from "../src/integrations/service.js";
import { initialValues } from "../src/integrations/types.js";
import { SecretError } from "../src/secrets/cipher.js";
import { integrationsFixture } from "./support/integrations-fixture.js";
import { integrationRuntimeCases } from "./support/integration-runtime-cases.js";

test("native integration settings: permissions, encryption migration, dynamic runtime, locks and failures", async (t) => {
  const f = await integrationsFixture();
  const { settings, app, replica, admin, member, machine, actor, db } = f;
  try {
    await t.test(
      "only human superusers can read, edit or test connections",
      async () => {
        for (const [method, url] of [
          ["GET", "/settings/integrations"],
          ["PUT", "/settings/integrations/invalid"],
          ["POST", "/settings/integrations/invalid/test"],
        ] as const) {
          assert.equal(
            (
              await app.inject({
                method,
                url,
                ...(method === "GET" ? {} : { payload: {} }),
              })
            ).statusCode,
            401,
          );
          assert.equal(
            (
              await app.inject({
                method,
                url,
                headers: member,
                ...(method === "GET" ? {} : { payload: {} }),
              })
            ).statusCode,
            403,
          );
          assert.equal(
            (
              await app.inject({
                method,
                url,
                headers: machine,
                ...(method === "GET" ? {} : { payload: {} }),
              })
            ).statusCode,
            401,
          );
        }
        assert.equal(
          (await app.inject({ url: "/settings/integrations", headers: admin }))
            .statusCode,
          200,
        );
        assert.equal(
          (
            await app.inject({ url: "/assistant/status", headers: admin })
          ).json().data.available,
          false,
        );
      },
    );
    await t.test(
      "saved secrets are encrypted, omitted values are retained, snapshots/audits contain no secret",
      async () => {
        const snapshot = await settings.snapshot();
        const value = {
          ...initialValues.assistant,
          enabled: true,
          model: "gpt-test",
        };
        const result = await app.inject({
          method: "PUT",
          url: "/settings/integrations/assistant",
          headers: admin,
          payload: {
            revision: snapshot.revision,
            value,
            secrets: { apiKey: "private-ai-secret" },
          },
        });
        assert.equal(result.statusCode, 200, result.body);
        assert.equal(result.json().data.assistant.secrets.apiKey, true);
        assert.equal(result.body.includes("private-ai-secret"), false);
        const row = await settings.row();
        assert.equal(JSON.stringify(row).includes("private-ai-secret"), false);
        await settings.save(
          "assistant",
          { revision: row.revision, value: { ...value, model: "gpt-next" } },
          actor,
        );
        assert.equal(
          (await settings.reveal(await settings.row(), "assistant")).apiKey,
          "private-ai-secret",
        );
        const events = await db("asmblyr_security_events").where({
          actor_id: actor,
        });
        assert.equal(
          JSON.stringify(events).includes("private-ai-secret"),
          false,
        );
        assert.equal(
          (
            await replica.inject({ url: "/assistant/status", headers: admin })
          ).json().data.model,
          "gpt-next",
        );
        await settings.check("assistant", {
          revision: (await settings.row()).revision,
          value,
        });
      },
    );
    await t.test(
      "local to KMS and back migrate every secret; mid-migration failure is atomic",
      async () => {
        let row = await settings.row();
        await settings.save(
          "storage",
          {
            revision: row.revision,
            value: {
              ...initialValues.storage,
              enabled: true,
              bucket: "private-bucket",
              region: "us-east-1",
            },
            secrets: {
              accessKeyId: "private-s3-id",
              secretAccessKey: "private-s3-secret",
            },
          },
          actor,
        );
        row = await settings.row();
        const kmsValue = {
          provider: "yandex-kms",
          keyId: "test-key",
          serviceAccountId: "test-account",
        };
        const before = structuredClone(row);
        f.setRemoteFailure(2);
        await assert.rejects(
          settings.save(
            "encryption",
            { revision: row.revision, value: kmsValue },
            actor,
          ),
          SecretError,
        );
        assert.deepEqual(await settings.row(), before);
        f.setRemoteFailure(Infinity);
        await settings.save(
          "encryption",
          { revision: row.revision, value: kmsValue },
          actor,
        );
        row = await settings.row();
        assert.equal(
          Object.values(row.secrets).every(
            (value) => value.provider === "yandex-kms",
          ),
          true,
        );
        assert.equal(
          (await settings.reveal(row, "storage")).secretAccessKey,
          "private-s3-secret",
        );
        await settings.save(
          "encryption",
          { revision: row.revision, value: initialValues.encryption },
          actor,
        );
        row = await settings.row();
        assert.equal(
          Object.values(row.secrets).every(
            (value) => value.provider === "local",
          ),
          true,
        );
        assert.equal(
          (await settings.reveal(row, "assistant")).apiKey,
          "private-ai-secret",
        );
      },
    );
    await t.test(
      "stale and simultaneous writes cannot overwrite current settings",
      async () => {
        const row = await settings.row();
        const update = {
          revision: row.revision,
          value: { ...row.values.assistant!, model: "gpt-concurrent" },
        };
        const results = await Promise.allSettled([
          settings.save("assistant", update, actor),
          settings.save("assistant", update, actor),
        ]);
        assert.equal(
          results.filter((result) => result.status === "fulfilled").length,
          1,
        );
        assert.equal(
          results.filter(
            (result) =>
              result.status === "rejected" &&
              result.reason.code === "integration_revision_conflict",
          ).length,
          1,
        );
      },
    );
    await integrationRuntimeCases(t, f);
    await t.test(
      "KMS outage cannot fall back to local; env changes cannot mix ciphertext providers",
      async () => {
        let row = await settings.row();
        await settings.save(
          "assistant",
          {
            revision: row.revision,
            value: {
              ...initialValues.assistant,
              enabled: true,
              model: "org/test-model",
            },
            secrets: { apiKey: "private-ai-secret" },
          },
          actor,
        );
        row = await settings.row();
        const kmsValue = {
          provider: "yandex-kms" as const,
          keyId: "test-key",
          serviceAccountId: "test-account",
        };
        await settings.save(
          "encryption",
          { revision: row.revision, value: kmsValue },
          actor,
        );
        const changed = new IntegrationService(db, {
          ...f.options,
          env: { SECRETS_PROVIDER: "local" },
        });
        const before = await settings.row();
        await assert.rejects(
          changed.save(
            "assistant",
            {
              revision: before.revision,
              value: before.values.assistant,
              secrets: { apiKey: "do-not-mix" },
            },
            actor,
          ),
          { code: "integration_encryption_migration_required" },
        );
        assert.deepEqual(await settings.row(), before);
        f.setRemoteUnavailable(true);
        assert.ok(await settings.snapshot());
        assert.equal(
          (await replica.inject({ url: "/assistant/status", headers: admin }))
            .statusCode,
          503,
        );
        assert.deepEqual(await settings.row(), before);
        f.setRemoteUnavailable(false);
        assert.equal(
          (await replica.inject({ url: "/assistant/status", headers: admin }))
            .statusCode,
          200,
        );
        await settings.save(
          "encryption",
          { revision: before.revision, value: initialValues.encryption },
          actor,
        );
        const migration = createRequire(import.meta.url)(
          "../migrations/20261004110000_integration_settings.cjs",
        );
        const migrated = await settings.row();
        await assert.rejects(migration.down(db), /Export integration settings/);
        assert.deepEqual(await settings.row(), migrated);
      },
    );
  } finally {
    await f.close();
  }
});
