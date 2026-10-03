import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { parseApplication } from "../src/oauth/input.js";
import { OAuthCipher } from "../src/oauth/crypto.js";
import { parseProfile } from "../src/auth/profile-input.js";

test("OAuth application input rejects wildcard callbacks, unsafe URLs and configurable claims", () => {
  const input = {
    name: "Example",
    description: "",
    enabled: true,
    clientType: "public",
    redirectUris: ["http://localhost:4567/callback"],
    userIds: [],
    audience: "",
    scopes: [],
  };
  assert.equal(parseApplication(input).redirectUris[0], input.redirectUris[0]);
  for (const uri of [
    "http://external.test/cb",
    "javascript:alert(1)",
    "https://example.com/*",
    "https://example.com/cb#fragment",
    "https://user:pass@example.com/cb",
  ]) {
    assert.throws(() => parseApplication({ ...input, redirectUris: [uri] }));
  }
  assert.throws(() => parseApplication({ ...input, claims: ["superuser"] }));
  assert.throws(() =>
    parseApplication({ ...input, audience: "app", scopes: ["openid"] }),
  );
  assert.throws(() => parseApplication({ ...input, scopes: ["admin"] }));
});

test("OAuth encrypted payload is bound to its record; profile images are optional HTTPS URLs", () => {
  const cipher = new OAuthCipher(randomBytes(32).toString("base64url"));
  const sealed = cipher.seal({ secret: "example-secret" }, "first-record");
  assert.deepEqual(cipher.open(sealed, "first-record"), {
    secret: "example-secret",
  });
  assert.throws(() => cipher.open(sealed, "other-record"));
  assert.deepEqual(parseProfile({ displayName: " User " }), {
    display_name: "User",
  });
  assert.throws(() =>
    parseProfile({ displayName: "User", pictureUrl: "data:image/png,abc" }),
  );
  assert.deepEqual(parseProfile({ displayName: "User", pictureUrl: "" }), {
    display_name: "User",
    picture_url: null,
  });
});
