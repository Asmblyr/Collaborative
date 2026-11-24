import "./support/require-test-database.js";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import test from "node:test";
import knex from "knex";
import { createApp } from "../src/app.js";
import type { FileStorage } from "../src/files/storage/types.js";
import {
  avatarRasterType,
  decodeDataUriAvatar,
  type DownloadedAvatar,
} from "../src/auth/sso/avatar-fetch.js";
import type { AvatarFetcher } from "../src/auth/sso/avatar-sync.js";
import { SsoProtocol } from "../src/auth/sso/protocol.js";
import { SsoService } from "../src/auth/sso/service.js";
import {
  fakeSsoProvider,
  type FakeAuthorizeOptions,
} from "./support/sso-provider.js";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY1cAAAAASUVORK5CYII=",
  "base64",
);
const TINY_JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01,
  0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xd9,
]);
const SVG_BYTES = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
);

function createMemoryStorage(): {
  storage: FileStorage;
  objects: Map<string, Buffer>;
} {
  const objects = new Map<string, Buffer>();
  return {
    objects,
    storage: {
      id: "test:sso-avatars",
      async put(key, bytes) {
        objects.set(key, Buffer.from(bytes));
      },
      async get(key) {
        const value = objects.get(key);
        if (!value) {
          throw new Error(`Missing object ${key}`);
        }
        return Readable.from(value);
      },
      async delete(key) {
        objects.delete(key);
      },
    },
  };
}

function makeAvatar(content: Buffer, sourceUrl: string): DownloadedAvatar {
  const mimeType = avatarRasterType(content);
  assert.ok(mimeType);
  return {
    content,
    mimeType,
    sha256: createHash("sha256").update(content).digest("hex"),
    sourceUrl,
  };
}

async function runSsoLogin(
  app: ReturnType<typeof createApp>,
  fake: Awaited<ReturnType<typeof fakeSsoProvider>>,
  options: FakeAuthorizeOptions,
) {
  const browserToken = randomBytes(32).toString("base64url");
  const start = await app.inject({
    method: "POST",
    url: "/auth/sso/okkam/start",
    payload: {
      browserToken,
      intent: "login",
      returnTo: "/",
      uiOrigin: "http://localhost:3000",
    },
  });
  assert.equal(start.statusCode, 200, start.body);
  const query = fake.authorize(start.json().authorizationUrl, options);
  return app.inject({
    method: "POST",
    url: "/auth/sso/okkam/callback",
    payload: { browserToken, query },
  });
}

async function cleanupEmail(db: knex.Knex, email: string) {
  const users = await db("public.asmblyr_users")
    .where({ email })
    .select<{ id: string }[]>("id");
  const ids = users.map((u) => u.id);
  if (!ids.length) {
    return;
  }
  await db("public.asmblyr_users")
    .whereIn("id", ids)
    .update({ avatar_id: null });
  await db("public.asmblyr_files").whereIn("uploaded_by", ids).delete();
  await db("public.asmblyr_users").whereIn("id", ids).delete();
}

test("SSO avatar import defaults to off and if_empty imports once into S3 without overwriting", async (t) => {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const { storage, objects } = createMemoryStorage();
  const emails = [
    "sso-avatar-off@corp.example",
    "sso-avatar-empty@corp.example",
  ];
  t.after(async () => {
    for (const email of emails) {
      await cleanupEmail(db, email);
    }
    await db.destroy();
  });

  // 1. Default avatarSync="off" skips import
  const offFake = await fakeSsoProvider({
    env: { AUTH_OKKAM_AUTO_PROVISION: "true" },
  });
  let offFetches = 0;
  const offApp = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
    fileStorage: storage,
    sso: new SsoService(
      [offFake.provider],
      new SsoProtocol(offFake.transport),
      async () => {
        offFetches += 1;
        return makeAvatar(TINY_PNG, "https://cdn.corp.example/off.png");
      },
    ),
  });
  t.after(() => offApp.close());

  const offRes = await runSsoLogin(offApp, offFake, {
    subject: "avatar-off-sub",
    idTokenClaims: {
      email: emails[0],
      email_verified: true,
      picture: "https://cdn.corp.example/off.png",
    },
  });
  assert.equal(offRes.statusCode, 200, offRes.body);
  assert.equal(offFetches, 0);
  assert.equal(objects.size, 0);

  // 2. if_empty imports on first login into S3 and serves preview, then skips future updates
  const emptyFake = await fakeSsoProvider({
    env: {
      AUTH_OKKAM_AUTO_PROVISION: "true",
      AUTH_OKKAM_AVATAR_SYNC: "if_empty",
    },
  });
  let emptyFetches = 0;
  const emptyApp = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
    fileStorage: storage,
    sso: new SsoService(
      [emptyFake.provider],
      new SsoProtocol(emptyFake.transport),
      async (raw) => {
        emptyFetches += 1;
        return makeAvatar(TINY_PNG, raw);
      },
    ),
  });
  t.after(() => emptyApp.close());

  const first = await runSsoLogin(emptyApp, emptyFake, {
    subject: "avatar-empty-sub",
    idTokenClaims: {
      email: emails[1],
      email_verified: true,
      picture: "https://cdn.corp.example/v1.png",
    },
  });
  assert.equal(first.statusCode, 200, first.body);
  assert.equal(emptyFetches, 1);

  const authHeaders = {
    authorization: `Bearer ${first.json().tokens.accessToken}`,
  };
  const me = await emptyApp.inject({
    method: "GET",
    url: "/auth/me",
    headers: authHeaders,
  });
  const avatarId = me.json().data.avatarId as string;
  assert.ok(avatarId);
  assert.equal(me.json().data.pictureUrl, null);
  assert.equal(objects.size, 1);

  const preview = await emptyApp.inject({
    method: "GET",
    url: `/files/${avatarId}/content?preview=1`,
    headers: authHeaders,
  });
  assert.equal(preview.statusCode, 200, preview.body);
  assert.equal(preview.headers["content-type"], "image/png");
  assert.deepEqual(preview.rawPayload, TINY_PNG);

  // Second login with a different URL leaves avatar untouched in if_empty mode
  const second = await runSsoLogin(emptyApp, emptyFake, {
    subject: "avatar-empty-sub",
    idTokenClaims: {
      email: emails[1],
      email_verified: true,
      picture: "https://cdn.corp.example/v2.jpg",
    },
  });
  assert.equal(second.statusCode, 200, second.body);
  assert.equal(emptyFetches, 1);
  const userRow = await db("public.asmblyr_users")
    .where({ email: emails[1] })
    .first("avatar_id");
  assert.equal(userRow.avatar_id, avatarId);
});

test("SSO avatar sync deduplicates by URL and SHA-256, replaces and deletes old S3 files, and preserves manual avatars", async (t) => {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const { storage, objects } = createMemoryStorage();
  const email = "sso-avatar-sync@corp.example";
  t.after(async () => {
    await cleanupEmail(db, email);
    await db.destroy();
  });

  const fake = await fakeSsoProvider({
    env: {
      AUTH_OKKAM_AUTO_PROVISION: "true",
      AUTH_OKKAM_AVATAR_SYNC: "sync",
      AUTH_OKKAM_AVATAR_SEND_TOKEN: "true",
    },
  });

  const payloadByUrl = new Map<string, Buffer>([
    ["https://identity.example.test/avatars/v1.png", TINY_PNG],
    ["https://identity.example.test/avatars/v1-rotated.png", TINY_PNG],
    ["https://identity.example.test/avatars/v2.jpg", TINY_JPEG],
    ["https://identity.example.test/avatars/v3.png", TINY_PNG],
  ]);
  const fetchLog: Array<{ url: string; hasToken: boolean }> = [];
  const fetcher: AvatarFetcher = async (raw, options) => {
    fetchLog.push({
      url: raw,
      hasToken: Boolean(
        options.accessToken &&
          options.trustedTokenOrigins?.has("https://identity.example.test"),
      ),
    });
    const bytes = payloadByUrl.get(raw);
    if (!bytes) {
      throw new Error(`Unexpected URL ${raw}`);
    }
    return makeAvatar(bytes, raw);
  };

  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
    fileStorage: storage,
    sso: new SsoService(
      [fake.provider],
      new SsoProtocol(fake.transport),
      fetcher,
    ),
  });
  t.after(() => app.close());

  // 1. Initial sync imports v1.png
  const login1 = await runSsoLogin(app, fake, {
    subject: "sync-sub",
    idTokenClaims: {
      email,
      email_verified: true,
      picture: "https://identity.example.test/avatars/v1.png",
    },
  });
  assert.equal(login1.statusCode, 200, login1.body);
  assert.equal(fetchLog.length, 1);
  assert.equal(fetchLog[0].hasToken, true);

  const user1 = await db("public.asmblyr_users")
    .where({ email })
    .first<{ id: string; avatar_id: string }>("id", "avatar_id");
  assert.ok(user1?.avatar_id);
  assert.equal(objects.size, 1);

  // 2. Same URL skips download completely
  const login2 = await runSsoLogin(app, fake, {
    subject: "sync-sub",
    idTokenClaims: {
      email,
      email_verified: true,
      picture: "https://identity.example.test/avatars/v1.png",
    },
  });
  assert.equal(login2.statusCode, 200, login2.body);
  assert.equal(fetchLog.length, 1);
  assert.equal(objects.size, 1);

  // 3. Rotated URL with identical bytes deduplicates via SHA-256 without creating a new S3 object
  const login3 = await runSsoLogin(app, fake, {
    subject: "sync-sub",
    idTokenClaims: {
      email,
      email_verified: true,
      picture: "https://identity.example.test/avatars/v1-rotated.png",
    },
  });
  assert.equal(login3.statusCode, 200, login3.body);
  assert.equal(fetchLog.length, 2);
  assert.equal(objects.size, 1);
  const trackedAfterRotate = await db("public.asmblyr_sso_avatars")
    .where({ user_id: user1.id })
    .first("file_id", "source_url");
  assert.equal(trackedAfterRotate.file_id, user1.avatar_id);
  assert.equal(
    trackedAfterRotate.source_url,
    "https://identity.example.test/avatars/v1-rotated.png",
  );

  // 4. Changed URL + changed bytes replaces avatar and deletes old S3 object and file row
  const login4 = await runSsoLogin(app, fake, {
    subject: "sync-sub",
    idTokenClaims: {
      email,
      email_verified: true,
      picture: "https://identity.example.test/avatars/v2.jpg",
    },
  });
  assert.equal(login4.statusCode, 200, login4.body);
  assert.equal(fetchLog.length, 3);
  const user4 = await db("public.asmblyr_users")
    .where({ email })
    .first<{ avatar_id: string }>("avatar_id");
  assert.ok(user4?.avatar_id);
  assert.notEqual(user4.avatar_id, user1.avatar_id);
  assert.equal(objects.size, 1);
  assert.equal(
    await db("public.asmblyr_files").where({ id: user1.avatar_id }).first(),
    undefined,
  );

  // 5. User uploads manual avatar -> SSO sync must NEVER overwrite it
  const auth = { authorization: `Bearer ${login4.json().tokens.accessToken}` };
  const manualUpload = await app.inject({
    method: "POST",
    url: "/users/me/avatar",
    headers: {
      ...auth,
      "content-type": "application/octet-stream",
      "x-file-name": "manual.png",
      "x-file-type": "image/png",
    },
    payload: TINY_PNG,
  });
  assert.equal(manualUpload.statusCode, 201, manualUpload.body);
  const manualAvatarId = manualUpload.json().data.id as string;
  const patch = await app.inject({
    method: "PATCH",
    url: "/users/me",
    headers: auth,
    payload: { avatarId: manualAvatarId },
  });
  assert.equal(patch.statusCode, 200, patch.body);

  const login5 = await runSsoLogin(app, fake, {
    subject: "sync-sub",
    idTokenClaims: {
      email,
      email_verified: true,
      picture: "https://identity.example.test/avatars/v3.png",
    },
  });
  assert.equal(login5.statusCode, 200, login5.body);
  assert.equal(fetchLog.length, 3);
  const user5 = await db("public.asmblyr_users")
    .where({ email })
    .first<{ avatar_id: string }>("avatar_id");
  assert.equal(user5?.avatar_id, manualAvatarId);
});

test("SSO avatar supports data URIs, userinfo fallback, storage fallback URL, and never blocks login on errors", async (t) => {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const { storage, objects } = createMemoryStorage();
  const emails = [
    "sso-avatar-data@corp.example",
    "sso-avatar-userinfo@corp.example",
    "sso-avatar-fallback@corp.example",
    "sso-avatar-broken@corp.example",
  ];
  t.after(async () => {
    for (const email of emails) {
      await cleanupEmail(db, email);
    }
    await db.destroy();
  });

  // 1. data:image/png succeeds and deduplicates; data:image/svg+xml fails silently without blocking login
  const dataFake = await fakeSsoProvider({
    advertiseUserInfo: true,
    env: {
      AUTH_OKKAM_AUTO_PROVISION: "true",
      AUTH_OKKAM_AVATAR_SYNC: "sync",
    },
  });
  const dataApp = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
    fileStorage: storage,
    sso: new SsoService(
      [dataFake.provider],
      new SsoProtocol(dataFake.transport),
      async (raw) => {
        if (raw.startsWith("data:")) {
          const decoded = decodeDataUriAvatar(raw);
          if (!decoded) {
            throw new Error("Invalid data URI");
          }
          return decoded;
        }
        if (raw.includes("broken")) {
          throw new Error("Network timeout");
        }
        return makeAvatar(TINY_PNG, raw);
      },
    ),
  });
  t.after(() => dataApp.close());

  const pngDataUri = `data:image/png;base64,${TINY_PNG.toString("base64")}`;
  const dataLogin1 = await runSsoLogin(dataApp, dataFake, {
    subject: "data-sub",
    idTokenClaims: {
      email: emails[0],
      email_verified: true,
      name: "Data User",
      picture: pngDataUri,
    },
  });
  assert.equal(dataLogin1.statusCode, 200, dataLogin1.body);
  assert.equal(objects.size, 1);

  // Same data URI deduplicates by SHA-256
  const dataLogin2 = await runSsoLogin(dataApp, dataFake, {
    subject: "data-sub",
    idTokenClaims: {
      email: emails[0],
      email_verified: true,
      name: "Data User",
      picture: pngDataUri,
    },
  });
  assert.equal(dataLogin2.statusCode, 200, dataLogin2.body);
  assert.equal(objects.size, 1);

  // SVG data URI is rejected without failing login or overwriting existing avatar
  const svgDataUri = `data:image/svg+xml;base64,${SVG_BYTES.toString("base64")}`;
  const svgLogin = await runSsoLogin(dataApp, dataFake, {
    subject: "data-sub",
    idTokenClaims: {
      email: emails[0],
      email_verified: true,
      name: "Data User",
      picture: svgDataUri,
    },
  });
  assert.equal(svgLogin.statusCode, 200, svgLogin.body);
  assert.equal(objects.size, 1);

  // 2. OIDC id_token without picture fetches userinfo; userinfo failure when only picture is needed does not fail login
  const userInfoLogin = await runSsoLogin(dataApp, dataFake, {
    subject: "userinfo-pic-sub",
    idTokenClaims: {
      email: emails[1],
      email_verified: true,
      name: "UserInfo Pic",
    },
    userInfo: {
      sub: "userinfo-pic-sub",
      email: emails[1],
      email_verified: true,
      picture: "https://cdn.corp.example/from-userinfo.png",
    },
  });
  assert.equal(userInfoLogin.statusCode, 200, userInfoLogin.body);
  const uiUser = await db("public.asmblyr_users")
    .where({ email: emails[1] })
    .first("avatar_id");
  assert.ok(uiUser.avatar_id);

  // Userinfo returning 500 when only picture is missing still logs the user in
  const userInfoErrorLogin = await runSsoLogin(dataApp, dataFake, {
    subject: "userinfo-pic-sub",
    idTokenClaims: {
      email: emails[1],
      email_verified: true,
      name: "UserInfo Pic",
    },
    userInfoStatus: 500,
  });
  assert.equal(userInfoErrorLogin.statusCode, 200, userInfoErrorLogin.body);

  // 3. Broken avatar fetch never fails login
  const brokenLogin = await runSsoLogin(dataApp, dataFake, {
    subject: "broken-sub",
    idTokenClaims: {
      email: emails[3],
      email_verified: true,
      name: "Broken Avatar",
      picture: "https://cdn.corp.example/broken.png",
    },
  });
  assert.equal(brokenLogin.statusCode, 200, brokenLogin.body);
  const brokenUser = await db("public.asmblyr_users")
    .where({ email: emails[3] })
    .first("avatar_id", "picture_url");
  assert.equal(brokenUser.avatar_id, null);
  assert.equal(brokenUser.picture_url, null);

  // 4. Storage unconfigured + avatarFallbackUrl=true saves https:// picture_url and protects manual picture_url
  const fallbackFake = await fakeSsoProvider({
    env: {
      AUTH_OKKAM_AUTO_PROVISION: "true",
      AUTH_OKKAM_AVATAR_SYNC: "sync",
      AUTH_OKKAM_AVATAR_FALLBACK_URL: "true",
    },
  });
  const fallbackApp = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
    sso: new SsoService(
      [fallbackFake.provider],
      new SsoProtocol(fallbackFake.transport),
    ),
  });
  t.after(() => fallbackApp.close());

  const fb1 = await runSsoLogin(fallbackApp, fallbackFake, {
    subject: "fallback-sub",
    idTokenClaims: {
      email: emails[2],
      email_verified: true,
      picture: "https://cdn.corp.example/fallback-1.png",
    },
  });
  assert.equal(fb1.statusCode, 200, fb1.body);
  const fbUser1 = await db("public.asmblyr_users")
    .where({ email: emails[2] })
    .first("avatar_id", "picture_url");
  assert.equal(fbUser1.avatar_id, null);
  assert.equal(fbUser1.picture_url, "https://cdn.corp.example/fallback-1.png");

  // Updates SSO-managed fallback URL in sync mode
  const fb2 = await runSsoLogin(fallbackApp, fallbackFake, {
    subject: "fallback-sub",
    idTokenClaims: {
      email: emails[2],
      email_verified: true,
      picture: "https://cdn.corp.example/fallback-2.png",
    },
  });
  assert.equal(fb2.statusCode, 200, fb2.body);
  const fbUser2 = await db("public.asmblyr_users")
    .where({ email: emails[2] })
    .first("picture_url");
  assert.equal(fbUser2.picture_url, "https://cdn.corp.example/fallback-2.png");

  // Manual picture_url change is preserved
  await db("public.asmblyr_users")
    .where({ email: emails[2] })
    .update({ picture_url: "https://manual.corp.example/me.png" });
  const fb3 = await runSsoLogin(fallbackApp, fallbackFake, {
    subject: "fallback-sub",
    idTokenClaims: {
      email: emails[2],
      email_verified: true,
      picture: "https://cdn.corp.example/fallback-3.png",
    },
  });
  assert.equal(fb3.statusCode, 200, fb3.body);
  const fbUser3 = await db("public.asmblyr_users")
    .where({ email: emails[2] })
    .first("picture_url");
  assert.equal(fbUser3.picture_url, "https://manual.corp.example/me.png");
});
