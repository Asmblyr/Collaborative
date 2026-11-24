import assert from "node:assert/strict";
import test from "node:test";
import { ssoFromEnv } from "../src/auth/sso/config.js";
import {
  avatarRasterType,
  decodeDataUriAvatar,
  fetchSsoAvatar,
  isBlockedIp,
  validateHttpsAvatarUrl,
} from "../src/auth/sso/avatar-fetch.js";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY1cAAAAASUVORK5CYII=",
  "base64",
);
const TINY_JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff,
  0xd9,
]);
const TINY_WEBP = Buffer.concat([
  Buffer.from("RIFF", "ascii"),
  Buffer.from([0x1a, 0x00, 0x00, 0x00]),
  Buffer.from("WEBPVP8 ", "ascii"),
  Buffer.alloc(12),
]);
const TINY_GIF = Buffer.from("GIF89a\x01\x00\x01\x00\x00\x00\x00;", "binary");
const SVG_BYTES = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
);

test("SSO avatar config defaults to off and validates sync mode, flags, and OAuth2 picture key", () => {
  const base = {
    AUTH_PROVIDERS: "corp",
    AUTH_UI_URL: "http://localhost:3000",
    AUTH_CORP_DRIVER: "openid",
    AUTH_CORP_ISSUER_URL: "https://idp.example.test",
    AUTH_CORP_CLIENT_ID: "client-id",
    AUTH_CORP_CLIENT_SECRET: "client-secret",
  };
  const [defaults] = ssoFromEnv(base);
  assert.equal(defaults.avatarSync, "off");
  assert.equal(defaults.avatarFallbackUrl, false);
  assert.equal(defaults.avatarSendToken, false);

  const [ifEmpty] = ssoFromEnv({
    ...base,
    AUTH_CORP_AVATAR_SYNC: "if_empty",
    AUTH_CORP_AVATAR_FALLBACK_URL: "true",
    AUTH_CORP_AVATAR_SEND_TOKEN: "true",
  });
  assert.equal(ifEmpty.avatarSync, "if_empty");
  assert.equal(ifEmpty.avatarFallbackUrl, true);
  assert.equal(ifEmpty.avatarSendToken, true);

  const [syncOAuth2] = ssoFromEnv({
    ...base,
    AUTH_CORP_DRIVER: "oauth2",
    AUTH_CORP_AUTHORIZE_URL: "https://idp.example.test/authorize",
    AUTH_CORP_ACCESS_URL: "https://idp.example.test/token",
    AUTH_CORP_PROFILE_URL: "https://idp.example.test/profile",
    AUTH_CORP_AVATAR_SYNC: "SYNC",
    AUTH_CORP_PICTURE_KEY: "user.avatar_url",
  });
  assert.equal(syncOAuth2.avatarSync, "sync");
  assert.equal(syncOAuth2.driver, "oauth2");
  if (syncOAuth2.driver === "oauth2") {
    assert.equal(syncOAuth2.pictureKey, "user.avatar_url");
  }

  assert.throws(() => ssoFromEnv({ ...base, AUTH_CORP_AVATAR_SYNC: "always" }));
  assert.throws(() =>
    ssoFromEnv({ ...base, AUTH_CORP_AVATAR_FALLBACK_URL: "yes" }),
  );
  assert.throws(() =>
    ssoFromEnv({ ...base, AUTH_CORP_AVATAR_SEND_TOKEN: "1" }),
  );
  assert.throws(() =>
    ssoFromEnv({
      ...base,
      AUTH_CORP_DRIVER: "oauth2",
      AUTH_CORP_AUTHORIZE_URL: "https://idp.example.test/authorize",
      AUTH_CORP_ACCESS_URL: "https://idp.example.test/token",
      AUTH_CORP_PROFILE_URL: "https://idp.example.test/profile",
      AUTH_CORP_PICTURE_KEY: "bad-key!",
    }),
  );
});

test("SSRF guards block private, loopback, link-local, metadata, multicast, and mapped IPs", () => {
  for (const blocked of [
    "0.0.0.0",
    "127.0.0.1",
    "127.255.255.254",
    "10.0.0.1",
    "100.64.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "198.18.0.1",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "ff02::1",
    "2001:db8::1",
    "::ffff:127.0.0.1",
    "::ffff:169.254.169.254",
    "::ffff:10.0.0.5",
    "64:ff9b::169.254.169.254",
    "not-an-ip",
  ]) {
    assert.equal(isBlockedIp(blocked), true, `expected blocked: ${blocked}`);
  }

  for (const allowed of [
    "1.1.1.1",
    "93.184.216.34",
    "2606:2800:220:1:248:1893:25c8:1946",
    "::ffff:93.184.216.34",
  ]) {
    assert.equal(isBlockedIp(allowed), false, `expected allowed: ${allowed}`);
  }

  for (const invalidUrl of [
    "http://cdn.example.test/avatar.png",
    "ftp://cdn.example.test/avatar.png",
    "https://user:pass@cdn.example.test/avatar.png",
    "https://cdn.example.test/avatar.png#fragment",
    "https://localhost/avatar.png",
    "https://sub.localhost/avatar.png",
    "https://metadata.google.internal/computeMetadata/v1/",
    "https://printer.local/avatar.png",
    "https://169.254.169.254/latest/meta-data/",
    "https://127.0.0.1/avatar.png",
    "https://[::1]/avatar.png",
    `https://cdn.example.test/${"a".repeat(2049)}`,
  ]) {
    assert.equal(
      validateHttpsAvatarUrl(invalidUrl),
      null,
      `expected rejected URL: ${invalidUrl}`,
    );
  }

  assert.equal(
    validateHttpsAvatarUrl("https://cdn.example.test/avatar.png?v=1")?.href,
    "https://cdn.example.test/avatar.png?v=1",
  );
});

test("avatar raster allowlist and data URI decoder accept only JPEG, PNG, and WebP within byte limits", () => {
  assert.equal(avatarRasterType(TINY_PNG), "image/png");
  assert.equal(avatarRasterType(TINY_JPEG), "image/jpeg");
  assert.equal(avatarRasterType(TINY_WEBP), "image/webp");
  assert.equal(avatarRasterType(TINY_GIF), null);
  assert.equal(avatarRasterType(SVG_BYTES), null);
  assert.equal(avatarRasterType(Buffer.from("<html>nope</html>")), null);

  const pngUri = `data:image/png;base64,${TINY_PNG.toString("base64")}`;
  const decoded = decodeDataUriAvatar(pngUri);
  assert.ok(decoded);
  assert.equal(decoded.mimeType, "image/png");
  assert.deepEqual(decoded.content, TINY_PNG);
  assert.ok(decoded.sourceUrl.startsWith("data:sha256:"));

  const svgUri = `data:image/svg+xml;base64,${SVG_BYTES.toString("base64")}`;
  assert.equal(decodeDataUriAvatar(svgUri), null);

  const spoofedPngUri = `data:image/png;base64,${SVG_BYTES.toString("base64")}`;
  assert.equal(decodeDataUriAvatar(spoofedPngUri), null);

  const gifUri = `data:image/gif;base64,${TINY_GIF.toString("base64")}`;
  assert.equal(decodeDataUriAvatar(gifUri), null);

  assert.equal(decodeDataUriAvatar(pngUri, TINY_PNG.length - 1), null);
});

test("fetchSsoAvatar pins resolved IPs, enforces redirect and size limits, scopes Bearer tokens, and aborts on timeout", async () => {
  const seenRequests: Array<{
    href: string;
    address: string;
    authorization?: string;
  }> = [];

  const downloaded = await fetchSsoAvatar(
    "https://idp.example.test/avatars/alice.png",
    {
      accessToken: "idp-secret-token",
      trustedTokenOrigins: new Set(["https://idp.example.test"]),
      dnsLookup: async (host) =>
        host === "idp.example.test"
          ? [{ address: "93.184.216.34", family: 4 }]
          : [{ address: "93.184.216.35", family: 4 }],
      httpRequest: async ({ url, address, headers }) => {
        seenRequests.push({
          href: url.href,
          address,
          authorization: headers.authorization,
        });
        if (url.hostname === "idp.example.test") {
          return {
            status: 302,
            location: "https://cdn.example.test/files/alice.png",
          };
        }
        return {
          status: 200,
          contentLength: TINY_PNG.length,
          body: TINY_PNG,
        };
      },
    },
  );
  assert.equal(downloaded.mimeType, "image/png");
  assert.equal(
    downloaded.sourceUrl,
    "https://idp.example.test/avatars/alice.png",
  );
  assert.deepEqual(seenRequests, [
    {
      href: "https://idp.example.test/avatars/alice.png",
      address: "93.184.216.34",
      authorization: "Bearer idp-secret-token",
    },
    {
      href: "https://cdn.example.test/files/alice.png",
      address: "93.184.216.35",
      authorization: undefined,
    },
  ]);

  // Reject DNS response containing any private IP
  await assert.rejects(
    fetchSsoAvatar("https://dual.example.test/a.png", {
      dnsLookup: async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "10.0.0.5", family: 4 },
      ],
      httpRequest: async () => {
        throw new Error("should not connect");
      },
    }),
    /blocked IP/i,
  );

  // Reject redirect to private/metadata target
  await assert.rejects(
    fetchSsoAvatar("https://idp.example.test/a.png", {
      dnsLookup: async () => [{ address: "93.184.216.34", family: 4 }],
      httpRequest: async () => ({
        status: 302,
        location: "https://169.254.169.254/latest/meta-data/",
      }),
    }),
    /Blocked avatar redirect/i,
  );

  // Reject >3 redirects
  let hops = 0;
  await assert.rejects(
    fetchSsoAvatar("https://cdn.example.test/hop/0", {
      dnsLookup: async () => [{ address: "93.184.216.34", family: 4 }],
      httpRequest: async () => {
        hops += 1;
        return { status: 302, location: `/hop/${hops}` };
      },
    }),
    /Too many avatar redirects/i,
  );
  assert.equal(hops, 4);

  // Reject oversized streaming body
  await assert.rejects(
    fetchSsoAvatar("https://cdn.example.test/big.png", {
      maxBytes: 32,
      dnsLookup: async () => [{ address: "93.184.216.34", family: 4 }],
      httpRequest: async () => ({
        status: 200,
        body: (async function* () {
          yield Buffer.alloc(20);
          yield Buffer.alloc(20);
        })(),
      }),
    }),
    /exceeds size limit/i,
  );

  // Reject SVG response body
  await assert.rejects(
    fetchSsoAvatar("https://cdn.example.test/xss.svg", {
      dnsLookup: async () => [{ address: "93.184.216.34", family: 4 }],
      httpRequest: async () => ({ status: 200, body: SVG_BYTES }),
    }),
    /supported raster image/i,
  );

  // Abort on timeout
  await assert.rejects(
    fetchSsoAvatar("https://cdn.example.test/slow.png", {
      timeoutMs: 30,
      dnsLookup: async () => [{ address: "93.184.216.34", family: 4 }],
      httpRequest: ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () =>
            reject(new Error("aborted by timeout")),
          );
        }),
    }),
    /aborted by timeout/i,
  );
});
