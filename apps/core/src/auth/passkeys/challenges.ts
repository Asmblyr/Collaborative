import type { Knex } from "knex";
import type { AuthenticatedUser } from "../tokens.js";
import { InvalidCredentialsError } from "../validation.js";

export async function saveChallenge(
  db: Knex,
  challenge: string,
  purpose: "register" | "login",
  user?: AuthenticatedUser,
): Promise<string> {
  const [row] = await db("public.asmblyr_passkey_challenges")
    .insert({
      challenge,
      purpose,
      user_id: user?.id,
      session_id: user?.sessionId,
      expires_at: new Date(Date.now() + 5 * 60 * 1000),
    })
    .returning<{ id: string }[]>("id");
  return row.id;
}

/** Delete outside verification transactions: even a failed verification consumes the challenge. */
export async function consumeChallenge(
  db: Knex,
  id: string,
  purpose: "register" | "login",
  user?: AuthenticatedUser,
): Promise<string> {
  const query = db("public.asmblyr_passkey_challenges")
    .where({ id, purpose })
    .where("expires_at", ">", db.fn.now());
  if (user) {
    query.where({ user_id: user.id, session_id: user.sessionId });
  }
  const [row] = await query
    .delete()
    .returning<{ challenge: string }[]>("challenge");
  if (!row) {
    throw new InvalidCredentialsError();
  }
  return row.challenge;
}
