import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { requireSuperuser } from "./require-superuser.js";
import { requireSettingsRead } from "../settings/access.js";
import { authenticateAccess } from "./tokens.js";
import { parseUserId } from "./validation.js";
import { objectInput, InputError } from "../shared/input.js";
import {
  getProfileDisplayConfiguration,
  saveProfileDisplayConfiguration,
} from "./profile-display-config.js";
import {
  parseDisplayPath,
  profileDisplaySchema,
} from "./profile-display-schema.js";
import { readProfileDisplay } from "./profile-display.js";

export function registerProfileDisplayRoutes(
  app: FastifyInstance,
  database: Knex | null,
): void {
  function db(): Knex {
    if (!database) {
      throw Object.assign(new Error("Database is not configured"), {
        statusCode: 503,
      });
    }
    return database;
  }
  app.get("/users/profile-display", async (request, reply) => {
    await requireSuperuser(db(), request);
    return reply
      .header("Cache-Control", "no-store")
      .send({ data: await getProfileDisplayConfiguration(db()) });
  });
  app.put("/users/profile-display", async (request, reply) => {
    const actor = await requireSuperuser(db(), request);
    return reply.header("Cache-Control", "no-store").send({
      data: await saveProfileDisplayConfiguration(db(), request.body, actor.id),
    });
  });
  app.get("/users/profile-display/sources", async (request, reply) => {
    await requireSuperuser(db(), request);
    const query = objectInput(request.query, ["path"]);
    if (query.path !== undefined && typeof query.path !== "string") {
      throw new InputError("Invalid profile display path");
    }
    const path = parseDisplayPath(
      query.path ? (query.path as string).split(".") : [],
      true,
    );
    const schema = await profileDisplaySchema(db());
    return reply
      .header("Cache-Control", "no-store")
      .send({ data: schema.choices(path) });
  });
  app.get("/users/me/profile-display", async (request, reply) => {
    const user = await authenticateAccess(db(), request.headers.authorization);
    return reply
      .header("Cache-Control", "no-store")
      .send({ data: await readProfileDisplay(db(), user.id, true) });
  });
  app.get<{ Params: { id: string } }>(
    "/users/:id/profile-display",
    async (request, reply) => {
      await requireSettingsRead(db(), request, "users");
      return reply.header("Cache-Control", "no-store").send({
        data: await readProfileDisplay(
          db(),
          parseUserId(request.params.id),
          false,
        ),
      });
    },
  );
}
