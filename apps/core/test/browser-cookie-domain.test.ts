import assert from "node:assert/strict";
import test from "node:test";
import { browserConfig } from "../src/auth/browser/cookies.js";

test("shared browser cookies require an explicit matching parent domain", () => {
  assert.deepEqual(browserConfig("https://admin.example.test"), {
    origin: "https://admin.example.test",
    prefix: "asmblyr",
  });
  assert.deepEqual(
    browserConfig(
      "https://admin.example.test",
      "collaborative",
      ".EXAMPLE.test",
    ),
    {
      origin: "https://admin.example.test",
      prefix: "collaborative",
      sessionDomain: "example.test",
    },
  );
  assert.equal(
    browserConfig(
      "http://collaborative.asmblyr.localhost",
      "collaborative",
      "asmblyr.localhost",
    ).sessionDomain,
    "asmblyr.localhost",
  );
  for (const domain of [
    "localhost",
    "test",
    "other.example.test",
    "ample.test",
    "example.test.evil",
    "127.0.0.1",
    "example.test:443",
    "example.test; Secure",
    "..example.test",
    "example.test.",
    "-bad.example.test",
    " example.test",
  ]) {
    assert.throws(
      () => browserConfig("https://admin.example.test", "asmblyr", domain),
      domain,
    );
  }
});
