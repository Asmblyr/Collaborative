import assert from "node:assert/strict";

export async function verifyHttp({
  ui,
  api,
  secret,
  origin = "http://localhost:3000",
  request = fetch,
}) {
  const credentials = { email: "container@example.test", password: secret };
  const html = await (await request(`${ui}/setup`)).text();
  assert.match(html, /<html/);
  const assets = [
    ...new Set(html.match(/\/_next\/static\/[^"<>\s]+\.(?:js|css)/g)),
  ];
  assert.ok(assets.length > 0, "UI must contain production assets");
  for (const asset of assets) {
    assert.equal((await request(`${ui}${asset}`)).status, 200, asset);
  }
  assert.equal((await request(`${api}/collections`)).status, 401);
  const setup = await request(`${ui}/api/auth/setup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...credentials, setupToken: secret }),
  });
  assert.equal(setup.status, 201, "UI must reach Core for initial setup");
  const login = await request(`${api}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(credentials),
  });
  assert.equal(login.status, 200, "Direct API login must work");
  const { accessToken } = await login.json();
  const headers = { authorization: `Bearer ${accessToken}` };
  assert.equal((await request(`${api}/collections`, { headers })).status, 200);
  assert.equal(
    (await request(`${api}/system-collections`, { headers })).status,
    200,
  );
  assert.equal(
    (await request(`${ui}/api/collections`, { headers })).status,
    200,
  );
  const browserLogin = await request(`${ui}/api/auth/browser/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: origin,
    },
    body: JSON.stringify(credentials),
  });
  assert.equal(browserLogin.status, 200);
  assert.deepEqual(await browserLogin.json(), { ok: true });
  const sessionCookie = browserLogin.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith("asmblyr_session=asm_bs_"))
    ?.split(";")[0];
  assert.ok(sessionCookie, "Core must issue an HttpOnly browser session");
  const admin = await request(`${ui}/admin/collections`, {
    headers: { cookie: sessionCookie },
    redirect: "manual",
  });
  assert.equal(
    admin.status,
    200,
    "Authenticated UI must render through its bundled SDK",
  );
  assert.doesNotMatch(
    await admin.text(),
    /asm_(bs|at|rt)_[A-Za-z0-9_-]{43}/,
    "Server-rendered pages must not expose session credentials",
  );
  assert.equal(
    (
      await request(`${ui}/api/users/me`, {
        headers: { cookie: sessionCookie },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(`${ui}/api/users/me/preferences`, {
        method: "PATCH",
        headers: {
          cookie: sessionCookie,
          "content-type": "application/json",
          origin: "https://evil.example",
        },
        body: JSON.stringify({ locale: "en" }),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`${ui}/api/auth/browser/logout`, {
        method: "POST",
        headers: { cookie: sessionCookie, origin: origin },
      })
    ).status,
    204,
  );
  assert.equal(
    (
      await request(`${ui}/api/users/me`, {
        headers: { cookie: sessionCookie },
      })
    ).status,
    401,
  );
  console.log(
    "UI assets, setup, direct authenticated API and admin page: passed",
  );
}
