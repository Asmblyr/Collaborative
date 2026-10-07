import { createHash, randomBytes } from "node:crypto";
import type { Knex } from "knex";
import type { AuthenticatedUser, TokenPair } from "../tokens.js";
import { InvalidCredentialsError } from "../validation.js";
import { recordUserActivity } from "../user-activity.js";
import type { FastifyReply } from "fastify";
import {
  clearSessionCookies,
  setCookie,
  type BrowserConfig,
} from "./cookies.js";

const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");

/** Convert a newly issued login into a browser session; never expose its API tokens. */
export async function createBrowserSession(
  db: Knex,
  pair: TokenPair,
): Promise<string> {
  const secret = `asm_bs_${randomBytes(32).toString("base64url")}`;
  await db.transaction(async (trx) => {
    const token = await trx("public.asmblyr_auth_tokens")
      .where({ access_hash: hash(pair.accessToken), consumed_at: null })
      .first("session_id");
    if (!token) {
      throw new InvalidCredentialsError();
    }
    const sessions = await trx("public.asmblyr_auth_sessions")
      .where({ id: token.session_id, revoked_at: null })
      .where("expires_at", ">", trx.fn.now())
      .update({ browser_hash: hash(secret) });
    if (!sessions) {
      throw new InvalidCredentialsError();
    }
    await trx("public.asmblyr_auth_tokens")
      .where({ session_id: token.session_id })
      .delete();
  });
  return secret;
}

export async function startBrowserSession(
  db: Knex,
  pair: TokenPair,
  reply: FastifyReply,
  config: BrowserConfig,
): Promise<void> {
  const secret = await createBrowserSession(db, pair);
  clearSessionCookies(reply, config);
  setCookie(
    reply,
    config,
    `${config.prefix}_session`,
    secret,
    (new Date(pair.refreshExpiresAt).getTime() - Date.now()) / 1000,
  );
}

export async function authenticateBrowserToken(
  db: Knex,
  token: string,
): Promise<AuthenticatedUser> {
  if (!/^asm_bs_[A-Za-z0-9_-]{43}$/.test(token)) {
    throw new InvalidCredentialsError();
  }
  const row = await db("public.asmblyr_auth_sessions as session")
    .join("public.asmblyr_users as usr", "usr.id", "session.user_id")
    .where("session.browser_hash", hash(token))
    .whereNull("session.revoked_at")
    .where("session.expires_at", ">", db.fn.now())
    .where("usr.status", "active")
    .first<{
      id: string;
      email: string;
      superuser: boolean;
      sessionId: string;
    }>("usr.id", "usr.email", "usr.superuser", "session.id as sessionId");
  if (!row) {
    throw new InvalidCredentialsError();
  }
  await recordUserActivity(db, row.id);
  return row;
}
