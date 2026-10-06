import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { localCipher, SecretError } from "../src/secrets/cipher.js";
import { yandexKmsCipher } from "../src/secrets/yandex-kms.js";
import { storageFromEnv } from "../src/files/storage/config.js";
import { storageLocation } from "../src/integrations/providers.js";
import { valueInput } from "../src/integrations/validation.js";
import type { StorageConnection } from "@asmblyr-collaborative/contracts";
import {
  environmentLocked,
  environmentValues,
} from "../src/integrations/environment.js";

test("local secrets use random authenticated encryption bound to each installation and slot", async () => {
  const cipher = localCipher(randomBytes(32).toString("base64url"));
  const a = await cipher.encrypt("private-secret", "installation/storage.key");
  const b = await cipher.encrypt("private-secret", "installation/storage.key");
  assert.notEqual(a.data, b.data);
  assert.equal(JSON.stringify(a).includes("private-secret"), false);
  assert.equal(
    await cipher.decrypt(a, "installation/storage.key"),
    "private-secret",
  );
  await assert.rejects(cipher.decrypt(a, "other/assistant.key"), SecretError);
  const bytes = Buffer.from(a.data, "base64");
  bytes[bytes.length - 1] ^= 1;
  await assert.rejects(
    cipher.decrypt(
      { ...a, data: bytes.toString("base64") },
      "installation/storage.key",
    ),
    SecretError,
  );
  assert.throws(() => localCipher(), SecretError);
  assert.throws(() => localCipher("short-key"), SecretError);
});

test("native KMS uses a pinned REST endpoint, federation token, AAD and safe failures", async () => {
  const requests: { url: string; input: RequestInit }[] = [];
  let failing = false;
  const cipher = yandexKmsCipher(
    "kms-key",
    async () => "private-iam-token",
    async (url, input) => {
      requests.push({ url: String(url), input: input! });
      if (failing) {
        return new Response("upstream with private-iam-token", { status: 403 });
      }
      const body = JSON.parse(String(input!.body));
      assert.equal(
        body.aadContext,
        Buffer.from("private-context").toString("base64"),
      );
      return Response.json(
        String(url).endsWith(":encrypt")
          ? {
              keyId: "kms-key",
              versionId: "v1",
              ciphertext: "opaque-ciphertext",
            }
          : {
              keyId: "kms-key",
              versionId: "v1",
              plaintext: Buffer.from("private-secret").toString("base64"),
            },
      );
    },
  );
  const encrypted = await cipher.encrypt("private-secret", "private-context");
  assert.equal(encrypted.provider, "yandex-kms");
  assert.equal(
    await cipher.decrypt(encrypted, "private-context"),
    "private-secret",
  );
  assert.equal(
    requests[0].url,
    "https://kms.yandex/kms/v1/keys/kms-key:encrypt",
  );
  assert.equal(requests[0].input.redirect, "error");
  assert.deepEqual(requests[0].input.headers, {
    authorization: "Bearer private-iam-token",
    "content-type": "application/json",
  });
  await assert.rejects(
    cipher.decrypt({ ...encrypted, keyId: "wrong-key" }, "private-context"),
    SecretError,
  );
  failing = true;
  await assert.rejects(
    cipher.encrypt("private-secret", "private-context"),
    (error: Error) =>
      error instanceof SecretError &&
      !error.message.includes("private-iam-token"),
  );
});

test("environment connections lock complete groups, blank examples do not lock, URLs never return embedded secrets", () => {
  assert.equal(
    environmentLocked(
      { OPENAI_API_KEY: "", OPENAI_API_MODEL: "" },
      "assistant",
    ),
    false,
  );
  assert.equal(
    environmentLocked({ ASSISTANT_ENABLED: "false" }, "assistant"),
    true,
  );
  assert.equal(
    environmentLocked({ FILES_BUCKET: "partial-config" }, "storage"),
    true,
  );
  assert.equal(
    environmentLocked({ SECRETS_LOCAL_KEY: "bootstrap" }, "encryption"),
    false,
  );
  const value = environmentValues({
    OPENAI_API_BASE_URL: "https://user:secret@example.com/?key=private",
    FILES_S3_ENDPOINT: "https://example.com/?token=private",
  });
  assert.equal(value.assistant.baseURL, "");
  assert.equal(value.storage.endpoint, "");
});

test("moving S3 configuration from env to the admin preserves existing file storage identities", () => {
  const env = {
    FILES_STORAGE: "s3",
    FILES_BUCKET: "test-bucket",
    FILES_S3_REGION: "ru-central1",
    FILES_S3_ENDPOINT: "https://storage.yandexcloud.net",
    AWS_ACCESS_KEY_ID: "test-id",
    AWS_SECRET_ACCESS_KEY: "test-secret",
  };
  const storage = storageFromEnv(env)!;
  try {
    const parsed = valueInput(
      "storage",
      environmentValues(env).storage,
    ) as StorageConnection;
    assert.equal(storageLocation(parsed), storage.id);
    assert.throws(
      () => storageFromEnv({ ...env, AWS_SECRET_ACCESS_KEY: "" }),
      /require both/,
    );
  } finally {
    storage.close?.();
  }
});
