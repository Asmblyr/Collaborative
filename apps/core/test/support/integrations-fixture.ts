import "./require-test-database.js";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import knex from "knex";
import { createApp } from "../../src/app.js";
import { issueUserTokens } from "../../src/auth/tokens.js";
import { IntegrationService } from "../../src/integrations/service.js";

import {
  storageLocation,
  type IntegrationOptions,
} from "../../src/integrations/providers.js";
import {
  localCipher,
  SecretError,
  type SecretCipher,
} from "../../src/secrets/cipher.js";
import { AssistantService } from "../../src/assistant/service.js";
import { assistantConfigFromEnv } from "../../src/assistant/config.js";
import { assistantEnvironment } from "../../src/integrations/validation.js";
import type { MonitoringSinkFactory } from "../../src/monitoring/sentry.js";

export async function integrationsFixture(
  monitoringSink?: MonitoringSinkFactory,
) {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const original = await db("asmblyr_integration_settings").first();
  const local = localCipher(randomBytes(32).toString("base64url"));
  const remote = localCipher(randomBytes(32).toString("base64url"));
  let failRemoteAfter = Infinity;
  let remoteEncrypts = 0;
  let remoteUnavailable = false;
  const kms: SecretCipher = {
    async encrypt(value, context) {
      if (remoteUnavailable || ++remoteEncrypts > failRemoteAfter) {
        throw new SecretError();
      }
      return {
        ...(await remote.encrypt(value, context)),
        provider: "yandex-kms",
        keyId: "test-key",
        keyVersion: "v1",
      };
    },
    async decrypt(value, context) {
      if (remoteUnavailable) {
        throw new SecretError();
      }
      return remote.decrypt({ ...value, provider: "local" }, context);
    },
  };
  const objects = new Map<string, Buffer>();
  let checks = 0;
  const options: IntegrationOptions = {
    env: { YC_OIDC_TOKEN_FILE: "test-only-projected-token" },
    cipher: (value) => (value.provider === "local" ? local : kms),
    storage: (value, secrets) => {
      assert.equal(secrets.secretAccessKey, "private-s3-secret");
      return {
        id: storageLocation(value),
        async put(key, bytes) {
          objects.set(key, bytes);
        },
        async get(key) {
          return Readable.from(objects.get(key)!);
        },
        async delete(key) {
          objects.delete(key);
        },
        async check() {
          checks++;
        },
      };
    },
    assistant: (value, apiKey) =>
      new AssistantService(
        assistantConfigFromEnv(assistantEnvironment(value, apiKey))!,
        async () => ({ content: "local test", truncated: false }),
      ),
    exchange: async (_url, input) => {
      assert.equal(
        (input?.headers as Record<string, string>).authorization,
        "Bearer private-ai-secret",
      );
      return Response.json({ data: [] });
    },
  };
  const settings = new IntegrationService(db, options);
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
    integrations: options,
    monitoringSink,
  });
  const replica = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
    integrations: options,
    monitoringSink,
  });
  const users = await db("asmblyr_users")
    .insert(
      [true, false].map((superuser) => ({
        email: `${randomUUID()}@example.test`,
        superuser,
      })),
    )
    .returning("id");
  const admin = {
    authorization: `Bearer ${(await issueUserTokens(db, users[0].id)).accessToken}`,
  };
  const member = {
    authorization: `Bearer ${(await issueUserTokens(db, users[1].id)).accessToken}`,
  };
  const actor = users[0].id;
  const account = await app.inject({
    method: "POST",
    url: "/service-accounts",
    headers: admin,
    payload: { name: "Integration test" },
  });
  const accountId = account.json().data.id;
  const key = await app.inject({
    method: "POST",
    url: `/service-accounts/${accountId}/keys`,
    headers: admin,
    payload: { name: "test" },
  });
  const token = await app.inject({
    method: "POST",
    url: "/auth/service-token",
    payload: { key: key.json().data.secret },
  });
  const machine = { authorization: `Bearer ${token.json().accessToken}` };
  await db("asmblyr_integration_settings").update({
    values: "{}",
    secrets: "{}",
    revision: randomUUID(),
  });
  return {
    db,
    settings,
    app,
    replica,
    admin,
    member,
    actor,
    options,
    machine,
    setRemoteUnavailable: (value: boolean) => {
      remoteUnavailable = value;
    },
    checks: () => checks,
    setRemoteFailure: (count: number) => {
      failRemoteAfter = count;
    },
    async close() {
      await app.close();
      await replica.close();
      await db("asmblyr_service_accounts").where({ id: accountId }).delete();
      await db("asmblyr_files")
        .whereIn(
          "uploaded_by",
          users.map((user) => user.id),
        )
        .delete();
      await db("asmblyr_integration_settings")
        .where({ id: 1 })
        .update({
          values: JSON.stringify(original.values),
          secrets: JSON.stringify(original.secrets),
          revision: original.revision,
        });
      await db("asmblyr_users")
        .whereIn(
          "id",
          users.map((user) => user.id),
        )
        .delete();
      await db.destroy();
    },
  };
}
