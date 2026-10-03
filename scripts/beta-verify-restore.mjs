import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { compose, docker, containerId, projectName } from "./beta/docker.mjs";
const [envFile, projectInput, privateFile, origin = "http://localhost:3301"] =
  process.argv.slice(2);
const project = projectName(projectInput);
if (
  !project.startsWith("asmblyr-restore-") ||
  new URL(origin).hostname !== "localhost"
)
  throw new Error("Only a disposable restore target is supported");
const state = JSON.parse(await readFile(privateFile, "utf8"));
const response = await fetch(origin + "/api/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json", origin },
  body: JSON.stringify({ email: state.email, password: state.password }),
});
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), { ok: true });
const cookie = response.headers
  .getSetCookie()
  .map((value) => value.split(";")[0])
  .join("; ");
const file = await fetch(`${origin}/api/files/${state.fileId}/content`, {
  headers: { cookie },
});
assert.equal(file.status, 200);
assert.equal(
  createHash("sha256")
    .update(Buffer.from(await file.arrayBuffer()))
    .digest("hex"),
  state.fileSha256,
);
const source = await docker([
  "exec",
  "asmblyr-beta-db-1",
  "psql",
  "-U",
  "asmblyr",
  "-d",
  "asmblyr",
  "-tAc",
  "SELECT count(*) FROM public.beta_articles",
]);
const db = await containerId(compose(envFile, project), "db");
const restored = await docker([
  "exec",
  db,
  "psql",
  "-U",
  "asmblyr",
  "-d",
  "asmblyr",
  "-tAc",
  "SELECT count(*) FROM public.beta_articles",
]);
assert.equal(restored, source);
// Full data fingerprints for every application table, including bytea public keys
// and JSON grants. Session/temporary tables change on login and maintenance.
const excluded = [
  "asmblyr_auth_sessions",
  "asmblyr_auth_tokens",
  "asmblyr_passkey_challenges",
  "asmblyr_request_buckets",
  "asmblyr_assistant_leases",
  "asmblyr_presence",
  "asmblyr_migrations",
  "asmblyr_migrations_lock",
];
const tables = (
  await docker([
    "exec",
    db,
    "psql",
    "-U",
    "asmblyr",
    "-d",
    "asmblyr",
    "-tAc",
    "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
  ])
)
  .split("\n")
  .filter((name) => !excluded.includes(name));
for (const table of tables) {
  assert.match(table, /^[a-z][a-z0-9_]*$/);
  const sql = `SELECT count(*) || ':' || md5(coalesce(string_agg(to_jsonb(row)::text, E'\\n' ORDER BY to_jsonb(row)::text), '')) FROM public.${table} row`;
  const snapshot = await docker([
    "exec",
    "asmblyr-beta-db-1",
    "psql",
    "-U",
    "asmblyr",
    "-d",
    "asmblyr",
    "-tAc",
    sql,
  ]);
  const copy = await docker([
    "exec",
    db,
    "psql",
    "-U",
    "asmblyr",
    "-d",
    "asmblyr",
    "-tAc",
    sql,
  ]);
  assert.equal(copy, snapshot, `Data fingerprint mismatch: ${table}`);
}
await writeFile(
  privateFile.replace(/\.json$/, "-restore-evidence.json"),
  JSON.stringify(
    {
      project,
      rows: Number(restored),
      tablesCompared: tables.length,
      fileChecksumMatched: true,
      restoredLogin: true,
    },
    null,
    2,
  ),
);
console.log(
  `Restore proof passed: ${tables.length} table fingerprints, ${restored} records, restored login and file checksum.`,
);
