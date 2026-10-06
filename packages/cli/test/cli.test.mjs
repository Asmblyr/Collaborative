import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { run } from "../src/run.mjs";
import { parseArguments } from "../src/arguments.mjs";
import { apiUrl, outputPath } from "../src/config.mjs";
import { Readable } from "node:stream";

function fixture() {
  const body = {
    version: 1,
    collections: [
      {
        name: "articles",
        mode: "multiple",
        primaryKey: { name: "id", type: "uuid" },
        actions: { read: true, create: true, update: true, delete: true },
        fields: [
          {
            name: "id",
            type: "string",
            nullable: false,
            read: true,
            create: false,
            update: false,
            requiredOnCreate: false,
          },
          {
            name: "title",
            type: "string",
            nullable: false,
            read: true,
            create: true,
            update: true,
            requiredOnCreate: true,
          },
        ],
      },
    ],
  };
  return {
    version: 1,
    hash: createHash("sha256").update(JSON.stringify(body)).digest("hex"),
    collections: body.collections,
  };
}
test("connect, pull and online/offline check work without writing or printing credentials", async (t) => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "asmblyr-cli-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const token = "fixture-credential";
  let snapshot = fixture();
  const output = [];
  const options = {
    cwd,
    env: { ASMBLYR_ACCESS_TOKEN: token },
    out: (value) => output.push(value),
    fetch: async (url, init) => {
      assert.equal(url, "https://example.test/schema");
      assert.equal(init.headers.get("authorization"), `Bearer ${token}`);
      assert.equal(init.redirect, "error");
      return Response.json({ data: snapshot });
    },
  };
  assert.equal(
    await run(["connect", "--url", "https://example.test"], options),
    0,
  );
  for (const name of [
    "asmblyr.config.json",
    "asmblyr.schema.json",
    "asmblyr.schema.ts",
  ]) {
    assert.ok(!(await readFile(path.join(cwd, name), "utf8")).includes(token));
  }
  assert.ok(!output.join().includes(token));
  const snapshotBefore = await readFile(
    path.join(cwd, "asmblyr.schema.json"),
    "utf8",
  );
  const disconnected = {
    ...options,
    env: {},
    fetch: () => {
      throw new Error("Offline generation must not fetch");
    },
  };
  await writeFile(
    path.join(cwd, "asmblyr.schema.ts"),
    "removed generated output",
  );
  assert.equal(await run(["generate"], disconnected), 0);
  assert.match(
    await readFile(path.join(cwd, "asmblyr.schema.ts"), "utf8"),
    /export const schema = defineSchema/,
  );
  assert.equal(
    await readFile(path.join(cwd, "asmblyr.schema.json"), "utf8"),
    snapshotBefore,
  );
  assert.equal(await run(["schema", "generate"], disconnected), 0);
  assert.equal(await run(["schema", "check"], options), 0);
  assert.equal(
    await run(["schema", "check", "--offline"], {
      ...options,
      env: {},
      fetch: () => {
        throw new Error("Offline must not fetch");
      },
    }),
    0,
  );
  await writeFile(path.join(cwd, "asmblyr.schema.ts"), "edited");
  assert.equal(await run(["schema", "check", "--offline"], options), 1);
  assert.equal(await run(["schema", "pull"], options), 0);
  snapshot = { ...snapshot, hash: "a".repeat(64) };
  await assert.rejects(
    run(["schema", "pull"], options),
    /Could not fetch a valid schema/,
  );
  await assert.rejects(
    run(["connect", "--url", "https://example.test"], options),
    /already exists/,
  );
});
test("CLI rejects credential arguments, unsafe API roots and output traversal", () => {
  assert.throws(
    () => parseArguments(["connect", "--access-token", "secret"]),
    /Unsupported flag/,
  );
  assert.throws(() => parseArguments(["schema", "pull", "--offline"]));
  assert.throws(() => parseArguments(["generate", "--token-stdin"]));
  for (const url of [
    "http://remote.test",
    "https://user:secret@example.test",
    "file:///tmp/x",
    "https://example.test?token=secret",
  ]) {
    assert.throws(() => apiUrl(url));
  }
  assert.equal(apiUrl("http://127.0.0.1:3001/"), "http://127.0.0.1:3001");
  assert.throws(() => outputPath(process.cwd(), "../escape.ts"));
});

test("stdin credentials, remote schema changes and HTTP errors stay scoped and redacted", async (t) => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "asmblyr-cli-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  let snapshot = fixture();
  const token = "private-fixture-token";
  const options = {
    cwd,
    env: {},
    out: () => {},
    fetch: async (_url, init) => {
      assert.equal(init.headers.get("authorization"), `Bearer ${token}`);
      return Response.json({ data: snapshot });
    },
  };
  await run(["connect", "--url", "https://example.test", "--token-stdin"], {
    ...options,
    stdin: Readable.from([`${token}\n`]),
  });
  const body = {
    version: 1,
    collections: structuredClone(snapshot.collections),
  };
  body.collections[0].fields[1].nullable = true;
  snapshot = {
    ...body,
    hash: createHash("sha256").update(JSON.stringify(body)).digest("hex"),
  };
  const online = { ...options, env: { ASMBLYR_ACCESS_TOKEN: token } };
  assert.equal(await run(["schema", "check"], online), 1);
  await run(["schema", "pull"], online);
  assert.equal(await run(["schema", "check"], online), 0);
  await assert.rejects(
    run(["schema", "pull"], {
      ...online,
      fetch: async () => Response.json({ message: token }, { status: 403 }),
    }),
    (error) => {
      assert.equal(error.message, "Schema request failed (HTTP 403)");
      assert.ok(!error.message.includes(token));
      return true;
    },
  );
});
