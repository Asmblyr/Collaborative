import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { issueUserTokens } from "../../src/auth/tokens.js";

export async function authorizeTestApp(app: FastifyInstance, database: Knex) {
  const [user] = await database("asmblyr_users")
    .withSchema("public")
    .insert({ email: `${randomUUID()}@example.test`, superuser: true })
    .returning<{ id: string }[]>("id");
  const accessToken = (await issueUserTokens(database, user.id)).accessToken;
  app.addHook("onRequest", async (request) => {
    if (!request.headers.authorization)
      request.headers.authorization = `Bearer ${accessToken}`;
  });
  app.addHook("onClose", async () => {
    await database("asmblyr_users")
      .withSchema("public")
      .where({ id: user.id })
      .delete();
  });
  return user;
}
