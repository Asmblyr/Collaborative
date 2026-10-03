import { createHash, randomBytes } from "node:crypto";
import type { Knex } from "knex";
import type { AuthenticatedUser } from "../tokens.js";
import type { SsoProvider } from "./config.js";
import type { SsoStart, SsoCallback } from "./input.js";
import { SsoError } from "./input.js";
import type { AuthorizationProof } from "./protocol.js";

export interface AuthFlow {
  state_hash: string;
  browser_hash: string;
  config_hash: string;
  provider: string;
  code_verifier: string;
  nonce: string;
  user_id: string | null;
  session_id: string | null;
  return_to: string;
  expires_at: Date;
}

export function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function configHash(provider: SsoProvider): string {
  return hash(JSON.stringify(provider));
}

export function newProof(): AuthorizationProof {
  return {
    state: randomBytes(32).toString("base64url"),
    codeVerifier: randomBytes(32).toString("base64url"),
    nonce: randomBytes(32).toString("base64url"),
  };
}

export async function saveFlow(
  db: Knex,
  provider: SsoProvider,
  input: SsoStart,
  proof: AuthorizationProof,
  user?: AuthenticatedUser,
): Promise<void> {
  await db("public.asmblyr_auth_flows")
    .where("expires_at", "<=", db.fn.now())
    .delete();
  await db("public.asmblyr_auth_flows").insert({
    state_hash: hash(proof.state),
    browser_hash: hash(input.browserToken),
    config_hash: configHash(provider),
    provider: provider.id,
    code_verifier: proof.codeVerifier,
    nonce: proof.nonce,
    user_id: user?.id ?? null,
    session_id: user?.sessionId ?? null,
    return_to: input.returnTo,
    expires_at: new Date(Date.now() + 10 * 60_000),
  });
}

function matchingFlow(db: Knex, provider: SsoProvider, input: SsoCallback) {
  return db("public.asmblyr_auth_flows")
    .where({
      state_hash: hash(input.state),
      browser_hash: hash(input.browserToken),
      config_hash: configHash(provider),
      provider: provider.id,
    })
    .where("expires_at", ">", db.fn.now());
}

export async function findFlow(
  db: Knex,
  provider: SsoProvider,
  input: SsoCallback,
): Promise<AuthFlow> {
  const flow = await matchingFlow(db, provider, input).first<AuthFlow>();
  if (!flow)
    throw new SsoError(
      "SSO_INVALID_FLOW",
      "Sign-in expired or belongs to another browser",
    );
  return flow;
}

export async function consumeFlow(
  db: Knex,
  provider: SsoProvider,
  input: SsoCallback,
): Promise<AuthFlow> {
  const [flow] = await matchingFlow(db, provider, input)
    .delete()
    .returning<AuthFlow[]>("*");
  if (!flow)
    throw new SsoError(
      "SSO_INVALID_FLOW",
      "This sign-in attempt has already been used",
    );
  return flow;
}
