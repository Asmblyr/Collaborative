import assert from "node:assert/strict";
import test from "node:test";
import { uniqueSessionCookie } from "../src/lib/session-cookie.js";

test("SSR keeps Core identity fail-closed for duplicate host/domain cookies in either order", () => {
  const name = "collaborative_session";
  assert.equal(uniqueSessionCookie(null, name), undefined);
  assert.equal(
    uniqueSessionCookie("collaborative_session=; sidebar_state=true", name),
    undefined,
  );
  assert.equal(
    uniqueSessionCookie(
      "asmblyr_session=another-app; collaborative_session=core; sidebar_state=true",
      name,
    ),
    "core",
  );
  for (const cookies of [
    "collaborative_session=first; collaborative_session=second",
    "collaborative_session=second; collaborative_session=first",
    "collaborative_session=same; collaborative_session=same",
    "collaborative_session=; collaborative_session=active",
  ]) {
    assert.equal(uniqueSessionCookie(cookies, name), undefined);
  }
});
