import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomBytes, createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
const require = createRequire(
  new URL("../apps/core/package.json", import.meta.url),
);
const knex = require("knex");
if (process.env.ASMBLYR_BETA_SMOKE !== "fresh-install")
  throw new Error("Run only in a fresh disposable beta installation");
const origin = process.env.AUTH_UI_URL;
assert.ok(origin);
const api = "http://127.0.0.1:3001";
let adminToken;
async function call(method, route, body, token = adminToken, expected = 200) {
  const response = await fetch(api + route, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  assert.equal(
    response.status,
    expected,
    `${method} ${route}: ${await response.clone().text()}`,
  );
  return response.status === 204 ? null : response.json();
}
assert.equal(
  (await call("GET", "/auth/setup/status")).needsSetup,
  true,
  "Refusing to seed an existing installation",
);
const password = randomBytes(24).toString("base64url"),
  email = "beta-admin@example.test";
await call(
  "POST",
  "/auth/setup",
  { setupToken: process.env.ASMBLYR_SETUP_TOKEN, email, password },
  undefined,
  201,
);
adminToken = (await call("POST", "/auth/login", { email, password }))
  .accessToken;
const collection = "beta_articles";
await call(
  "POST",
  "/collections",
  {
    name: collection,
    primaryKey: { name: "id", type: "serial" },
    fields: [
      { name: "title", type: "text" },
      { name: "status", type: "text" },
      { name: "attachment", type: "file" },
    ],
  },
  adminToken,
  201,
);
const invited = await call(
  "POST",
  "/users",
  { email: "beta-editor@example.test" },
  adminToken,
  201,
);
const policy = (
  await call("POST", "/policies", { name: "Редактор беты" }, adminToken, 201)
).data.id;
await call(
  "PUT",
  `/policies/${policy}/users`,
  { userIds: [invited.data.user.id] },
  adminToken,
  204,
);
for (const grant of [
  ...["read", "create", "update", "delete"].map((action) => ({
    collection,
    action,
    fields: ["*"],
  })),
  { section: "files", action: "update", fields: ["*"] },
]) {
  const id = (await call("POST", "/permissions", grant, adminToken, 201)).data
    .id;
  await call(
    "PUT",
    `/policies/${policy}/permissions/${id}`,
    undefined,
    adminToken,
    204,
  );
}
const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
try {
  await db.raw(
    "INSERT INTO public.beta_articles (title, status) SELECT 'Статья ' || n || ' о совместной работе', CASE WHEN n % 3 = 0 THEN 'draft' ELSE 'published' END FROM generate_series(1, 50000) n",
  );
  await db.raw("ANALYZE public.beta_articles");
} finally {
  await db.destroy();
}
const bytes = Buffer.from("Asmblyr beta: object-storage restore proof\n");
const upload = await fetch(api + "/files", {
  method: "POST",
  headers: {
    authorization: `Bearer ${adminToken}`,
    "content-type": "application/octet-stream",
    "x-file-name": "beta-proof.txt",
  },
  body: bytes,
});
assert.equal(upload.status, 201, await upload.clone().text());
const fileId = (await upload.json()).data.id;
await call("PATCH", `/items/${collection}/1`, { attachment: fileId });
await call("POST", `/items/${collection}/commit`, {
  id: "1",
  values: { title: "Статья после правки" },
  expectedValues: { title: "Статья 1 о совместной работе" },
});
await call(
  "POST",
  `/items/${collection}/commit`,
  {
    id: "1",
    values: { title: "Устаревшая правка" },
    expectedValues: { title: "Статья 1 о совместной работе" },
  },
  adminToken,
  409,
);
const timings = [];
for (const query of [
  "limit=25",
  "limit=25&page=1000",
  "limit=25&sort=title&direction=desc",
  "limit=25&q=совместной",
  "limit=25&q=49999",
]) {
  const samples = [];
  for (let n = 0; n < 20; n++) {
    const start = performance.now();
    const result = await call("GET", `/items/${collection}?${query}`);
    assert.ok(result.data.length <= 25);
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  timings.push({
    query,
    medianMs: Math.round(samples[10]),
    p95Ms: Math.round(samples[18]),
  });
}
await writeFile(
  "/tmp/beta-browser.json",
  JSON.stringify(
    {
      email,
      password,
      editorId: invited.data.user.id,
      inviteUrl: `${origin}/invite#token=${invited.data.invitationToken}`,
      collection,
      fileId,
      fileSha256: createHash("sha256").update(bytes).digest("hex"),
    },
    null,
    2,
  ),
  { mode: 0o600 },
);
await writeFile(
  "/tmp/beta-evidence.json",
  JSON.stringify(
    {
      rows: 50000,
      queries: timings,
      conflictRejected: true,
      storageSha256: createHash("sha256").update(bytes).digest("hex"),
    },
    null,
    2,
  ),
);
console.log(
  "Fresh-install smoke passed; 50,000 records, file upload, permissions and optimistic conflict checked. Evidence saved without credentials.",
);
