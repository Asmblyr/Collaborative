import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Knex } from "knex";
import { InvalidCredentialsError } from "../validation.js";
import { authenticatePrincipal, type Principal } from "../principal.js";
import type { AuthenticatedUser } from "../tokens.js";
import type { parseCliAuthorization, parseCliExchange } from "./input.js";
const lifetimeMs = 10 * 60 * 1000;
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export async function authorizeCli(
  db: Knex,
  user: AuthenticatedUser,
  input: ReturnType<typeof parseCliAuthorization>,
): Promise<string> {
  const code = randomBytes(32).toString("base64url");
  await db("asmblyr_cli_grants")
    .withSchema("public")
    .insert({
      code_hash: digest(code),
      session_id: user.sessionId,
      challenge: input.challenge,
      redirect_uri: input.redirectUri,
      code_expires_at: new Date(Date.now() + 60000),
      expires_at: new Date(Date.now() + 60000),
    });
  const callback = new URL(input.redirectUri);
  callback.searchParams.set("code", code);
  callback.searchParams.set("state", input.state);
  return callback.href;
}
export async function exchangeCli(
  db: Knex,
  input: ReturnType<typeof parseCliExchange>,
): Promise<{
  accessToken: string;
  expiresIn: number;
  scope: "schema:read";
}> {
  return db.transaction(async (transaction) => {
    const grant = await transaction("asmblyr_cli_grants")
      .withSchema("public")
      .where({ code_hash: digest(input.code) })
      .forUpdate()
      .first();
    const challenge = createHash("sha256")
      .update(input.verifier)
      .digest("base64url");
    if (
      !grant ||
      grant.consumed_at ||
      grant.code_expires_at <= new Date() ||
      grant.redirect_uri !== input.redirectUri ||
      !timingSafeEqual(Buffer.from(grant.challenge), Buffer.from(challenge))
    ) {
      throw new InvalidCredentialsError();
    }
    if (!(await sessionPrincipal(transaction, grant.session_id))) {
      throw new InvalidCredentialsError();
    }
    const accessToken = `asm_sc_${randomBytes(32).toString("base64url")}`;
    await transaction("asmblyr_cli_grants")
      .withSchema("public")
      .where({ code_hash: grant.code_hash })
      .update({
        consumed_at: transaction.fn.now(),
        token_hash: digest(accessToken),
        expires_at: new Date(Date.now() + lifetimeMs),
      });
    return { accessToken, expiresIn: lifetimeMs / 1000, scope: "schema:read" };
  });
}
async function sessionPrincipal(
  db: Knex,
  sessionId: string,
): Promise<Principal | undefined> {
  const user = await db("asmblyr_auth_sessions as session")
    .withSchema("public")
    .join("asmblyr_users as usr", "usr.id", "session.user_id")
    .where("session.id", sessionId)
    .whereNull("session.revoked_at")
    .where("session.expires_at", ">", db.fn.now())
    .where("usr.status", "active")
    .first("usr.id", "usr.email", "usr.superuser");
  return user ? { ...user, kind: "user", sessionId } : undefined;
}
/** Schema credentials are deliberately accepted only by the schema route. */
export async function authenticateSchemaPrincipal(
  db: Knex,
  authorization?: string,
): Promise<Principal> {
  if (!/^Bearer asm_sc_/i.test(authorization ?? "")) {
    return authenticatePrincipal(db, authorization);
  }
  const match = /^Bearer (asm_sc_[A-Za-z0-9_-]{43})$/i.exec(
    authorization ?? "",
  );
  if (!match) {
    throw new InvalidCredentialsError();
  }
  const grant = await db("asmblyr_cli_grants")
    .withSchema("public")
    .where({ token_hash: digest(match[1]) })
    .whereNotNull("consumed_at")
    .where("expires_at", ">", db.fn.now())
    .first("session_id");
  const principal = grant
    ? await sessionPrincipal(db, grant.session_id)
    : undefined;
  if (!principal) {
    throw new InvalidCredentialsError();
  }
  return principal;
}
