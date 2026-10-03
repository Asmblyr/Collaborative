import test from "node:test";
import assert from "node:assert/strict";
import {
  parseApplicationAccess,
  matchesEmailDomain,
} from "../src/oauth/access.js";

test("Application access retains old restrictions and rejects incomplete or unknown modes", () => {
  assert.deepEqual(parseApplicationAccess({}), {
    accessMode: "selected",
    emailDomains: [],
  });
  assert.deepEqual(
    parseApplicationAccess({
      accessMode: "all",
      emailDomains: ["example.com"],
    }),
    {
      accessMode: "all",
      emailDomains: [],
    },
  );
  for (const input of [
    { accessMode: null },
    { accessMode: "everyone" },
    { accessMode: "domains" },
    { accessMode: "domains", emailDomains: [] },
    { emailDomains: null },
    { emailDomains: "example.com" },
    { emailDomains: [false] },
    { emailDomains: Array(101).fill("example.com") },
  ])
    assert.throws(() => parseApplicationAccess(input));
});

test("Email domains normalize case, optional @ and international domains; no suffix or wildcard matching", () => {
  const { emailDomains } = parseApplicationAccess({
    accessMode: "domains",
    emailDomains: [" @EXAMPLE.com ", "example.com", "пример.рф"],
  });
  assert.deepEqual(emailDomains, ["example.com", "xn--e1afmkfd.xn--p1ai"]);
  for (const email of [
    "user@example.com",
    "User@EXAMPLE.COM",
    "user@пример.рф",
    "user@xn--e1afmkfd.xn--p1ai",
  ]) {
    assert.equal(matchesEmailDomain(email, emailDomains), true, email);
  }
  for (const email of [
    "user@evil-example.com",
    "user@team.example.com",
    "user@example.com.evil.org",
    "user@example.com.",
    "user@example.com ",
    "user@@example.com",
    "@example.com",
    "example.com",
  ])
    assert.equal(matchesEmailDomain(email, emailDomains), false, email);
  for (const domain of [
    "",
    " ",
    "*.example.com",
    "https://example.com",
    "user@example.com",
    "@@example.com",
    "example.com/path",
    "example.com:443",
    "example.com#hash",
    "ex ample.com",
    "localhost",
    "127.0.0.1",
    "example.com.",
    "example..com",
    "-example.com",
    "example-.com",
    "%65xample.com",
    `${"x".repeat(64)}.com`,
    "example.com\u0000",
    "example.com\\evil.com",
  ])
    assert.throws(
      () =>
        parseApplicationAccess({
          accessMode: "domains",
          emailDomains: [domain],
        }),
      domain,
    );
});
