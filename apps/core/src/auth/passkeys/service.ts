import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticatorTransport,
} from "@simplewebauthn/server";
import type { Knex } from "knex";
import { issueUserTokens, type AuthenticatedUser } from "../tokens.js";
import { AuthConflictError, InvalidCredentialsError } from "../validation.js";
import { requireRecentAuth } from "../recent-auth.js";
import { securityEvent } from "../security-events.js";
import type { PasskeyConfig } from "./config.js";
import type { SsoProvider } from "../sso/config.js";
import { saveChallenge, consumeChallenge } from "./challenges.js";
import { parsePasskeyResponse } from "./input.js";

interface KeyRow {
  id: string;
  user_id: string;
  public_key: Buffer;
  counter: string;
  transports: AuthenticatorTransport[];
  name: string;
  last_used_at: Date | null;
}
const keys = (db: Knex) => db<KeyRow>("public.asmblyr_passkeys");

export async function listPasskeys(db: Knex, userId: string) {
  return keys(db)
    .where({ user_id: userId })
    .select(
      "id",
      "name",
      "created_at as createdAt",
      "last_used_at as lastUsedAt",
    )
    .orderBy("created_at");
}

export async function registrationOptions(
  db: Knex,
  config: PasskeyConfig,
  user: AuthenticatedUser,
) {
  await requireRecentAuth(db, user);
  const existing = await keys(db)
    .where({ user_id: user.id })
    .select("id", "transports");
  if (existing.length >= 10) {
    throw new AuthConflictError("Maximum ten passkeys per user");
  }
  const options = await generateRegistrationOptions({
    rpName: config.rpName,
    rpID: config.rpId,
    userName: user.email,
    userID: new Uint8Array(Buffer.from(user.id.replaceAll("-", ""), "hex")),
    attestationType: "none",
    excludeCredentials: existing,
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "required",
    },
  });
  return {
    challengeId: await saveChallenge(db, options.challenge, "register", user),
    options,
  };
}

export async function registerPasskey(
  db: Knex,
  config: PasskeyConfig,
  user: AuthenticatedUser,
  value: unknown,
) {
  await requireRecentAuth(db, user);
  const input = parsePasskeyResponse(value);
  const challenge = await consumeChallenge(
    db,
    input.challengeId,
    "register",
    user,
  );
  let result;
  try {
    result = await verifyRegistrationResponse({
      response: input.response,
      expectedChallenge: challenge,
      expectedOrigin: config.origin,
      expectedRPID: config.rpId,
      requireUserVerification: true,
    });
  } catch {
    throw new InvalidCredentialsError();
  }
  if (!result.verified || !result.registrationInfo) {
    throw new InvalidCredentialsError();
  }
  const credential = result.registrationInfo.credential;
  await db.transaction(async (trx) => {
    await trx("public.asmblyr_users")
      .where({ id: user.id })
      .forUpdate()
      .first("id");
    await requireRecentAuth(trx, user);
    const existing = await keys(trx).where({ user_id: user.id }).select("id");
    if (
      existing.length >= 10 ||
      (await keys(trx).where({ id: credential.id }).first("id"))
    ) {
      throw new AuthConflictError(
        "Passkey is already registered or limit reached",
      );
    }
    await keys(trx).insert({
      id: credential.id,
      user_id: user.id,
      public_key: Buffer.from(credential.publicKey),
      counter: String(credential.counter),
      transports: trx.raw("?::jsonb", [
        JSON.stringify(credential.transports ?? []),
      ]),
      name: input.name,
    });
    await securityEvent(trx, user.id, "user.passkey_added", user.id);
  });
  return listPasskeys(db, user.id);
}

export async function authenticationOptions(db: Knex, config: PasskeyConfig) {
  const options = await generateAuthenticationOptions({
    rpID: config.rpId,
    userVerification: "required",
  });
  return {
    challengeId: await saveChallenge(db, options.challenge, "login"),
    options,
  };
}

export async function loginPasskey(
  db: Knex,
  config: PasskeyConfig,
  value: unknown,
  userAgent?: string,
) {
  const input = parsePasskeyResponse(value);
  const challenge = await consumeChallenge(db, input.challengeId, "login");
  return db.transaction(async (trx) => {
    const owner = await keys(trx)
      .where({ id: input.response.id })
      .first("user_id");
    if (!owner) {
      throw new InvalidCredentialsError();
    }
    const user = await trx("public.asmblyr_users")
      .where({ id: owner.user_id, status: "active" })
      .forShare()
      .first("id");
    if (!user) {
      throw new InvalidCredentialsError();
    }
    const credential = await keys(trx)
      .where({ id: input.response.id })
      .forUpdate()
      .first();
    if (!credential) {
      throw new InvalidCredentialsError();
    }
    let result;
    try {
      result = await verifyAuthenticationResponse({
        response: input.response,
        expectedChallenge: challenge,
        expectedOrigin: config.origin,
        expectedRPID: config.rpId,
        requireUserVerification: true,
        credential: {
          id: credential.id,
          publicKey: new Uint8Array(credential.public_key),
          counter: Number(credential.counter),
          transports: credential.transports,
        },
      });
    } catch {
      throw new InvalidCredentialsError();
    }
    if (!result.verified) {
      throw new InvalidCredentialsError();
    }
    await keys(trx)
      .where({ id: credential.id })
      .update({
        counter: String(result.authenticationInfo.newCounter),
        last_used_at: trx.fn.now(),
      });
    await securityEvent(trx, user.id, "user.passkey_login", user.id);
    return issueUserTokens(trx, user.id, userAgent);
  });
}

export async function removePasskey(
  db: Knex,
  user: AuthenticatedUser,
  id: string,
  providers: SsoProvider[] = [],
): Promise<void> {
  await db.transaction(async (trx) => {
    await trx("public.asmblyr_users")
      .where({ id: user.id })
      .forUpdate()
      .first("id");
    await requireRecentAuth(trx, user);
    const existing = await keys(trx).where({ user_id: user.id }).select("id");
    if (!existing.some((key) => key.id === id)) {
      throw Object.assign(new Error("Passkey not found"), { statusCode: 404 });
    }
    const password = await trx("public.asmblyr_password_credentials")
      .where({ user_id: user.id })
      .first("user_id");
    const identities = await trx("public.asmblyr_user_identities")
      .where({ user_id: user.id })
      .select<{ provider: string; issuer: string }[]>("provider", "issuer");
    const availableSso = identities.some((identity) =>
      providers.some(
        (provider) =>
          provider.id === identity.provider &&
          provider.issuer === identity.issuer,
      ),
    );
    if (existing.length === 1 && !password && !availableSso) {
      throw new AuthConflictError(
        "Добавьте другой способ входа перед удалением последнего passkey",
      );
    }
    await keys(trx).where({ id, user_id: user.id }).delete();
    await securityEvent(trx, user.id, "user.passkey_removed", user.id);
  });
}
