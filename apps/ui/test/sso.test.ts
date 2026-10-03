import assert from "node:assert/strict";
import test from "node:test";
import { ssoMessage, ssoProviderKey } from "../src/lib/sso";

test("callback errors display only known messages, never provider text or object properties", () => {
  const fallback = ssoMessage("unknown");
  for (const code of [
    "__proto__",
    "constructor",
    "toString",
    "<script>token</script>",
  ]) {
    assert.equal(ssoMessage(code), fallback);
  }
  assert.equal(ssoMessage(null), null);
  assert.match(ssoMessage("SSO_NOT_LINKED")!, /подключите провайдера/);
  assert.equal(ssoProviderKey("okkam"), true);
  assert.equal(ssoProviderKey("../okkam"), false);
});
