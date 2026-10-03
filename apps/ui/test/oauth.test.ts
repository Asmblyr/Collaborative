import test from "node:test";
import assert from "node:assert/strict";
import { oauthCookies } from "../src/lib/oauth-cookies";

test("OAuth proxy forwards only exact protocol cookie names, never main sessions or unrelated credentials", () => {
  const value =
    "asmblyr_access=secret; asmblyr_refresh=refresh-secret; asmblyr_oidc_interaction=flow; asmblyr_oidc_interaction.sig=signature; asmblyr_oidc_session_extra=wrong; other_password=hidden";
  assert.equal(
    oauthCookies(value),
    "asmblyr_oidc_interaction=flow; asmblyr_oidc_interaction.sig=signature",
  );
  assert.equal(oauthCookies(""), "");
  assert.equal(
    oauthCookies("asmblyr_oidc_session=s; asmblyr_oidc_resume=r"),
    "asmblyr_oidc_session=s; asmblyr_oidc_resume=r",
  );
});
