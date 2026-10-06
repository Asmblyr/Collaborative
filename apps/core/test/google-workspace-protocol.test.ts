import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import {
  GoogleProtocol,
  googleScopes,
  type GoogleConfig,
} from "../src/connections/google/protocol.js";

test("Google OAuth library verifies PKCE, state, nonce, issuer, signature and subject without exposing tokens", async () => {
  const config: GoogleConfig = {
    enabled: true,
    clientId: "google-test",
    clientSecret: "client-secret",
    redirectUri: "http://localhost:3000/connections/google/callback",
    fingerprint: "test",
  };
  const proof = {
    state: "state",
    nonce: "nonce",
    codeVerifier: "a".repeat(43),
  };
  const keys = await generateKeyPair("RS256", { extractable: true });
  const jwk = {
    ...(await exportJWK(keys.publicKey)),
    kid: "test",
    use: "sig",
    alg: "RS256",
  };
  let nonce = proof.nonce;
  let subject = "google-sub";
  const protocol = new GoogleProtocol(async (url, options) => {
    const path = String(url);
    if (path.endsWith("/token")) {
      const body = new URLSearchParams(String(options?.body));
      assert.equal(body.get("client_secret"), config.clientSecret);
      if (body.get("grant_type") === "refresh_token") {
        assert.equal(body.get("refresh_token"), "refresh-token");
        return Response.json({
          access_token: "refreshed",
          token_type: "Bearer",
          expires_in: 3600,
        });
      }
      assert.equal(body.get("code_verifier"), proof.codeVerifier);
      assert.equal(body.get("redirect_uri"), config.redirectUri);
      const idToken = await new SignJWT({ nonce, email: "owner@example.test" })
        .setProtectedHeader({ alg: "RS256", kid: "test" })
        .setIssuer("https://accounts.google.com")
        .setAudience(config.clientId)
        .setSubject("google-sub")
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(keys.privateKey);
      return Response.json({
        access_token: "access-token",
        refresh_token: "refresh-token",
        token_type: "Bearer",
        scope: googleScopes.join(" "),
        expires_in: 3600,
        id_token: idToken,
      });
    }
    if (path.endsWith("/certs")) {
      return Response.json({ keys: [jwk] });
    }
    if (path.endsWith("/userinfo")) {
      return Response.json({ sub: subject, email: "owner@example.test" });
    }
    throw new Error("Unexpected OAuth request");
  });
  const authorization = new URL(await protocol.authorize(config, proof));
  assert.equal(
    authorization.searchParams.get("code_challenge"),
    createHash("sha256").update(proof.codeVerifier).digest("base64url"),
  );
  assert.equal(authorization.searchParams.get("access_type"), "offline");
  assert.equal(authorization.searchParams.get("prompt"), "consent");
  const query = "state=state&code=test";
  const grant = await protocol.exchange(config, proof, query);
  assert.equal(grant.subject, "google-sub");
  assert.equal(grant.refreshToken, "refresh-token");
  const refreshed = await protocol.refresh(config, grant);
  assert.equal(refreshed.refreshToken, grant.refreshToken);
  assert.deepEqual(refreshed.scopes, grant.scopes);
  await assert.rejects(
    protocol.exchange(config, proof, "state=foreign&code=test"),
  );
  nonce = "wrong-nonce";
  await assert.rejects(protocol.exchange(config, proof, query));
  nonce = proof.nonce;
  subject = "foreign-user";
  await assert.rejects(protocol.exchange(config, proof, query));
});
