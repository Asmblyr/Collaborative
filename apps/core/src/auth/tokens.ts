import { createHash, randomBytes } from "node:crypto";
import type { Knex } from "knex";
import { InvalidCredentialsError } from "./validation.js";
import { clientLabel } from "./sessions.js";
import { recordUserActivity } from "./user-activity.js";
import { authenticateBrowserToken } from "./browser/sessions.js";

const accessLifetimeMs = 15 * 60 * 1000;
const sessionLifetimeMs = 30 * 24 * 60 * 60 * 1000;

interface UserRow {
  id: string;
  email: string;
  status: "active" | "disabled";
  superuser: boolean;
}

interface SessionRow {
  id: string;
  user_id: string;
  expires_at: Date;
  revoked_at: Date | null;
}

interface TokenRow {
  session_id: string;
  refresh_expires_at: Date;
  consumed_at: Date | null;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  superuser: boolean;
  sessionId: string;
}

export interface TokenPair {
  tokenType: "Bearer";
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresAt: string;
}

function newToken(prefix: "asm_at_" | "asm_rt_"): string {
  return prefix + randomBytes(32).toString("base64url");
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function tokenPair(expiresAt: Date): TokenPair {
  return {
    tokenType: "Bearer",
    accessToken: newToken("asm_at_"),
    refreshToken: newToken("asm_rt_"),
    expiresIn: accessLifetimeMs / 1000,
    refreshExpiresAt: expiresAt.toISOString(),
  };
}

async function saveTokenPair(
  transaction: Knex.Transaction,
  sessionId: string,
  pair: TokenPair,
): Promise<void> {
  await transaction("asmblyr_auth_tokens")
    .withSchema("public")
    .insert({
      session_id: sessionId,
      access_hash: tokenHash(pair.accessToken),
      refresh_hash: tokenHash(pair.refreshToken),
      access_expires_at: new Date(Date.now() + accessLifetimeMs),
      refresh_expires_at: new Date(pair.refreshExpiresAt),
    });
}

export async function issueUserTokens(
  database: Knex,
  userId: string,
  userAgent?: string,
): Promise<TokenPair> {
  const expiresAt = new Date(Date.now() + sessionLifetimeMs);
  return database.transaction(async (transaction) => {
    const [session] = await transaction("asmblyr_auth_sessions")
      .withSchema("public")
      .insert({
        user_id: userId,
        expires_at: expiresAt,
        client_label: clientLabel(userAgent),
      })
      .returning<{ id: string }[]>("id");
    const pair = tokenPair(expiresAt);
    await saveTokenPair(transaction, session.id, pair);
    await transaction("public.asmblyr_users").where({ id: userId }).update({
      last_login_at: transaction.fn.now(),
      last_active_at: transaction.fn.now(),
    });
    return pair;
  });
}

export async function authenticateAccess(
  database: Knex,
  authorization: string | undefined,
): Promise<AuthenticatedUser> {
  const browser = /^Bearer (asm_bs_[A-Za-z0-9_-]{43})$/.exec(
    authorization ?? "",
  );
  if (browser) {
    return authenticateBrowserToken(database, browser[1]);
  }
  const match = /^Bearer (asm_at_[A-Za-z0-9_-]{43})$/i.exec(
    authorization ?? "",
  );
  if (!match) throw new InvalidCredentialsError();
  const row = await database("asmblyr_auth_tokens as token")
    .withSchema("public")
    .join("asmblyr_auth_sessions as session", "session.id", "token.session_id")
    .join("asmblyr_users as usr", "usr.id", "session.user_id")
    .where("token.access_hash", tokenHash(match[1]))
    .whereNull("token.consumed_at")
    .whereNull("session.revoked_at")
    .where("token.access_expires_at", ">", database.fn.now())
    .where("session.expires_at", ">", database.fn.now())
    .where("usr.status", "active")
    .first<{
      id: string;
      email: string;
      superuser: boolean;
      session_id: string;
    }>("usr.id", "usr.email", "usr.superuser", "session.id as session_id");
  if (!row) throw new InvalidCredentialsError();
  await recordUserActivity(database, row.id);
  return {
    id: row.id,
    email: row.email,
    superuser: row.superuser,
    sessionId: row.session_id,
  };
}

export async function refreshUserTokens(
  database: Knex,
  refreshToken: string,
): Promise<TokenPair> {
  const hash = tokenHash(refreshToken);
  const token = await database("asmblyr_auth_tokens")
    .withSchema("public")
    .where({ refresh_hash: hash })
    .first<Pick<TokenRow, "session_id">>("session_id");
  if (!token) throw new InvalidCredentialsError();

  const result = await database.transaction(async (transaction) => {
    const session = await transaction("asmblyr_auth_sessions")
      .withSchema("public")
      .where({ id: token.session_id })
      .forUpdate()
      .first<SessionRow>();
    if (!session || session.revoked_at || session.expires_at <= new Date()) {
      throw new InvalidCredentialsError();
    }
    const current = await transaction("asmblyr_auth_tokens")
      .withSchema("public")
      .where({ refresh_hash: hash })
      .forUpdate()
      .first<TokenRow>();
    if (
      !current ||
      current.session_id !== session.id ||
      current.refresh_expires_at <= new Date()
    ) {
      throw new InvalidCredentialsError();
    }
    if (current.consumed_at) {
      await transaction("asmblyr_auth_sessions")
        .withSchema("public")
        .where({ id: session.id })
        .update({ revoked_at: new Date() });
      return null;
    }
    const user = await transaction("asmblyr_users")
      .withSchema("public")
      .where({ id: session.user_id })
      .first<UserRow>();
    if (!user || user.status !== "active") throw new InvalidCredentialsError();

    await transaction("asmblyr_auth_tokens")
      .withSchema("public")
      .where({ refresh_hash: hash })
      .update({ consumed_at: new Date() });
    const pair = tokenPair(session.expires_at);
    await transaction("asmblyr_auth_sessions")
      .where({ id: session.id })
      .update({ refreshed_at: new Date() });
    await saveTokenPair(transaction, session.id, pair);
    return pair;
  });
  if (!result) throw new InvalidCredentialsError();
  return result;
}

export async function revokeUserSession(
  database: Knex,
  sessionId: string,
): Promise<void> {
  await database("asmblyr_auth_sessions")
    .withSchema("public")
    .where({ id: sessionId, revoked_at: null })
    .update({ revoked_at: new Date() });
}

export async function revokeSessionByRefreshToken(
  database: Knex,
  refreshToken: string,
): Promise<void> {
  const token = await database("asmblyr_auth_tokens")
    .withSchema("public")
    .where({ refresh_hash: tokenHash(refreshToken) })
    .first<{ session_id: string }>("session_id");
  if (!token) throw new InvalidCredentialsError();
  await revokeUserSession(database, token.session_id);
}
