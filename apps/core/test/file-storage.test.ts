import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { yandexTokenProvider } from "../src/files/storage/yandex-token.js";

test("YC federation token provider deduplicates exchange and rereads rotating projected tokens", async () => {
  const directory = await mkdtemp(join(tmpdir(), "asmblyr-token-test-")), path = join(directory, "token");
  let clock = 1000, calls = 0;
  const subjects: string[] = [];
  const exchange: typeof fetch = async (url, options) => {
    assert.equal(url, "https://auth.yandex.cloud/oauth/token");
    const body = options?.body as URLSearchParams;
    assert.equal(body.get("audience"), "test-account");
    subjects.push(body.get("subject_token")!); calls++;
    return Response.json({ access_token: `test-iam-${calls}`, expires_in: 3600 });
  };
  try {
    await writeFile(path, "test-assertion-one");
    const token = yandexTokenProvider({ serviceAccountId: "test-account", tokenFile: path }, exchange, () => clock);
    const initial = await Promise.all([token(), token(), token()]);
    assert.deepEqual(initial, ["test-iam-1", "test-iam-1", "test-iam-1"]); assert.equal(calls, 1);
    await writeFile(path, "test-assertion-two"); clock += 600000;
    assert.equal(await token(), "test-iam-2"); assert.deepEqual(subjects, ["test-assertion-one", "test-assertion-two"]);
  } finally { await unlink(path); await rmdir(directory); }
});

test("failed federation exchange is sanitized and can be retried", async () => {
  const directory = await mkdtemp(join(tmpdir(), "asmblyr-token-test-")), path = join(directory, "token");
  let calls = 0;
  try {
    await writeFile(path, "private-assertion");
    const token = yandexTokenProvider({ serviceAccountId: "test-account", tokenFile: path }, async () => {
      calls++; if (calls === 1) throw new Error("private-assertion");
      return Response.json({ access_token: "test-iam", expires_in: 3600 });
    });
    await assert.rejects(token(), (e: Error) => !e.message.includes("private-assertion"));
    assert.equal(await token(), "test-iam");
  } finally { await unlink(path); await rmdir(directory); }
});
