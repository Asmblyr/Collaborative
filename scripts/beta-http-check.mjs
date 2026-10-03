import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { virtualPasskey } from "../apps/core/test/support/webauthn.ts";

const [privateFile, origin = "http://localhost:3300"] = process.argv.slice(2);
assert.equal(
  new URL(origin).hostname,
  "localhost",
  "Only disposable localhost beta is supported",
);
const state = JSON.parse(await readFile(privateFile, "utf8"));
const admin = new Map(),
  user = new Map(),
  guest = new Map();
async function call(
  jar,
  route,
  body,
  expected = 200,
  method = "POST",
  foreign = false,
) {
  const response = await fetch(origin + route, {
    method,
    headers: {
      "content-type": "application/json",
      origin: foreign ? "https://foreign.example" : origin,
      cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; "),
    },
    body:
      method === "GET" || method === "DELETE"
        ? undefined
        : JSON.stringify(body),
  });
  for (const cookie of response.headers.getSetCookie()) {
    const [key, value] = cookie.split(";")[0].split("=");
    if (value) jar.set(key, value);
    else jar.delete(key);
  }
  assert.equal(
    response.status,
    expected,
    `${method} ${route}: ${await response.clone().text()}`,
  );
  return response.status === 204 ? null : response.json();
}
assert.deepEqual(
  await call(admin, "/api/auth/login", {
    email: state.email,
    password: state.password,
  }),
  { ok: true },
);
const invitation = (
  await call(
    admin,
    "/api/users",
    { email: `http-${randomBytes(6).toString("hex")}@example.test` },
    201,
  )
).data;
const claim = { token: invitation.invitationToken };
await call(guest, "/api/auth/invitations/claim", claim, 403, "POST", true);
assert.deepEqual(await call(user, "/api/auth/invitations/claim", claim), {
  ok: true,
});
await call(guest, "/api/auth/invitations/claim", claim, 401);
await call(user, "/api/files", undefined, 403, "GET");
const key = virtualPasskey();
async function register(jar) {
  const challenge = await call(jar, "/api/users/me/passkeys/options", {});
  const result = await call(
    jar,
    "/api/users/me/passkeys",
    {
      challengeId: challenge.challengeId,
      response: key.registration(challenge.options.challenge, origin),
      name: "HTTP beta proof",
    },
    201,
  );
  assert.equal(result.data.length, 1);
}
await register(user);
const challenge = await call(guest, "/api/auth/passkeys/options", {});
const assertion = {
  challengeId: challenge.challengeId,
  response: key.authentication(challenge.options.challenge, 1, origin),
};
await call(new Map(), "/api/auth/passkeys/login", assertion, 401);
assert.deepEqual(await call(guest, "/api/auth/passkeys/login", assertion), {
  ok: true,
});
await call(guest, "/api/auth/passkeys/login", assertion, 401);
assert.ok([...guest.keys()].some((name) => name.endsWith("_access")));
await call(user, `/api/users/me/passkeys/${key.id}`, undefined, 409, "DELETE");
const userId = invitation.user.id;
await call(user, `/api/users/${userId}/recovery`, {}, 403);
const recovery = (await call(admin, `/api/users/${userId}/recovery`, {})).data;
const recovered = new Map();
assert.deepEqual(
  await call(recovered, "/api/auth/invitations/claim", {
    token: recovery.invitationToken,
  }),
  { ok: true },
);
await call(user, "/api/users/me/passkeys", undefined, 401, "GET");
assert.equal(
  (await call(recovered, "/api/users/me/passkeys", undefined, 200, "GET")).data
    .length,
  0,
);
await register(recovered);
await call(
  recovered,
  "/api/users/me/password/setup",
  { password: randomBytes(24).toString("base64url") },
  204,
);
const invalid = await fetch(origin + "/api/auth/passkeys/options", {
  method: "POST",
  headers: { origin, "content-type": "application/json" },
  body: "{",
});
assert.equal(invalid.status, 400);
await writeFile(
  privateFile.replace(/\.json$/, "-http-evidence.json"),
  JSON.stringify(
    {
      bff: "passed",
      linkClaim: true,
      csrfBlocked: true,
      cookieBoundChallenge: true,
      tokenBodyPrivate: true,
      signedPasskeyLogin: true,
      replayBlocked: true,
      recoveryRevokedSession: true,
    },
    null,
    2,
  ),
);
console.log(
  "HTTP/BFF checks passed: link login, signed WebAuthn, cookies, CSRF, replay, recovery and optional password.",
);
