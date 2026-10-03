import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { authenticateAccess } from "../auth/tokens.js";
import { parseId } from "../policies/validation.js";
import type { OAuthConsents } from "./consents.js";

export function registerOAuthConsentRoutes(
  app: FastifyInstance,
  db: Knex,
  consents: OAuthConsents,
) {
  app.get("/users/me/oauth-apps", async (request, reply) => {
    const user = await authenticateAccess(db, request.headers.authorization);
    return reply
      .header("Cache-Control", "no-store")
      .send({ data: await consents.list(user.id) });
  });
  app.delete<{ Params: { id: string } }>(
    "/users/me/oauth-apps/:id",
    async (request, reply) => {
      const user = await authenticateAccess(db, request.headers.authorization);
      await consents.revoke(parseId(request.params.id), user.id);
      return reply.header("Cache-Control", "no-store").code(204).send();
    },
  );
}
