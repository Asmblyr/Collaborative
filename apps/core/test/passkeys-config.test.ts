import assert from "node:assert/strict";
import test from "node:test";
import { passkeysFromEnv } from "../src/auth/passkeys/config.js";

test("passkey origins permit local ingress names while keeping exact origin and RP checks", () => {
  assert.equal(
    passkeysFromEnv({
      AUTH_UI_URL: "http://collaborative.localhost",
      NODE_ENV: "production",
    }).rpId,
    "collaborative.localhost",
  );
  assert.equal(
    passkeysFromEnv({ AUTH_UI_URL: "http://localhost:3000" }).origin,
    "http://localhost:3000",
  );
  assert.equal(
    passkeysFromEnv({ AUTH_UI_URL: "https://admin.example.test" }).rpId,
    "admin.example.test",
  );
  for (const url of [
    "http://example.test",
    "http://localhost.evil.test",
    "http://evil-localhost",
    "http://collaborative.localhost/path",
    "http://collaborative.localhost?q=1",
    "http://user:password@collaborative.localhost",
    "http://collaborative.localhost#fragment",
  ]) {
    assert.throws(() => passkeysFromEnv({ AUTH_UI_URL: url }), url);
  }
  assert.throws(() =>
    passkeysFromEnv({
      AUTH_UI_URL: "http://collaborative.localhost",
      PASSKEY_RP_ID: "localhost",
    }),
  );
  assert.throws(() => passkeysFromEnv({ NODE_ENV: "production" }));
});
