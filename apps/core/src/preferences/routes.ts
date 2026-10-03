import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { authenticateAccess } from "../auth/tokens.js";
import { loadAccess } from "../permissions/access.js";
import { AuthInputError } from "../auth/validation.js";
import { objectInput } from "../shared/input.js";
import { getTablePreferences, saveTablePreferences } from "./table-preferences.js";

export function registerPreferenceRoutes(app: FastifyInstance, database: Knex | null) {
  function db(): Knex {
    if (!database)
      throw Object.assign(new Error("Database is not configured"), { statusCode: 503 });
    return database;
  }
  app.get("/users/me/preferences", async (request, reply) => {
    const user = await authenticateAccess(db(), request.headers.authorization);
    const saved = await db()("asmblyr_user_preferences").where({ user_id: user.id }).first("theme");
    return reply
      .header("Cache-Control", "no-store")
      .send({ data: { theme: saved?.theme ?? null } });
  });
  app.patch("/users/me/preferences", async (request, reply) => {
    const user = await authenticateAccess(db(), request.headers.authorization);
    const body = objectInput(request.body, ["theme"]);
    if (typeof body.theme !== "string" || !["light", "dark", "system"].includes(body.theme))
      throw new AuthInputError("Invalid theme");
    await db()("asmblyr_user_preferences")
      .insert({ user_id: user.id, theme: body.theme })
      .onConflict("user_id")
      .merge({ theme: body.theme });
    return reply.header("Cache-Control", "no-store").send({ data: { theme: body.theme } });
  });
  app.get<{ Params: { collection: string } }>(
    "/users/me/table-preferences/:collection",
    async (request, reply) => {
      const access = await loadAccess(db(), request.headers.authorization);
      return reply
        .header("Cache-Control", "no-store")
        .send({ data: await getTablePreferences(db(), request.params.collection, access) });
    },
  );
  app.patch<{ Params: { collection: string } }>(
    "/users/me/table-preferences/:collection",
    async (request, reply) => {
      const access = await loadAccess(db(), request.headers.authorization);
      return reply.header("Cache-Control", "no-store").send({
        data: await saveTablePreferences(db(), request.params.collection, access, request.body),
      });
    },
  );
}
