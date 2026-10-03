import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { authenticateAccess } from "./tokens.js";
import { changePassword, getProfile, updateProfile } from "./profile.js";
import { credentialRateLimit } from "./rate-limit.js";
import { listSessions, revokeOwnedSessions } from "./sessions.js";
import { parseId } from "../policies/validation.js";
import { setInitialPassword } from "./initial-password.js";

export function registerProfileRoutes(
  app: FastifyInstance,
  database: Knex | null,
) {
  function db(): Knex {
    if (!database)
      throw Object.assign(new Error("Database is not configured"), {
        statusCode: 503,
      });
    return database;
  }
  app.get("/users/me", async (request, reply) => {
    const user = await authenticateAccess(db(), request.headers.authorization);
    return reply
      .header("Cache-Control", "no-store")
      .send({ data: await getProfile(db(), user) });
  });
  app.post(
    "/users/me/password/setup",
    { preHandler: credentialRateLimit(10) },
    async (request, reply) => {
      await setInitialPassword(
        db(),
        await authenticateAccess(db(), request.headers.authorization),
        request.body,
      );
      return reply.header("Cache-Control", "no-store").code(204).send();
    },
  );
  app.get("/users/me/sessions", async (request, reply) => {
    const user = await authenticateAccess(db(), request.headers.authorization);
    return reply
      .header("Cache-Control", "no-store")
      .send({ data: await listSessions(db(), user) });
  });
  app.delete<{ Params: { id: string } }>(
    "/users/me/sessions/:id",
    async (request, reply) => {
      const user = await authenticateAccess(
        db(),
        request.headers.authorization,
      );
      await revokeOwnedSessions(
        db(),
        user,
        request.params.id === "others" ? "others" : parseId(request.params.id),
      );
      return reply.header("Cache-Control", "no-store").code(204).send();
    },
  );
  app.patch("/users/me", async (request, reply) => {
    const user = await authenticateAccess(db(), request.headers.authorization);
    return reply
      .header("Cache-Control", "no-store")
      .send({ data: await updateProfile(db(), user, request.body) });
  });
  app.post(
    "/users/me/password",
    { preHandler: credentialRateLimit(10) },
    async (request, reply) => {
      const user = await authenticateAccess(
        db(),
        request.headers.authorization,
      );
      await changePassword(db(), user, request.body);
      return reply.header("Cache-Control", "no-store").code(204).send();
    },
  );
}
