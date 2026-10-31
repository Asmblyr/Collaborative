import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { Knex } from "knex";
import { requireSuperuser } from "./require-superuser.js";
import { authenticateAccess } from "./tokens.js";
import { parseUserId } from "./validation.js";
import {
  requireSettingsRead,
  requireSettingsSection,
} from "../settings/access.js";
import {
  readUserFormConfiguration,
  saveUserFormConfiguration,
} from "../system-collections/user-form-config.js";
import { readUserForm, saveUserForm } from "./user-form.js";

export function registerUserFormRoutes(
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
  app.get("/system-collections/users/form", async (request, reply) => {
    await requireSuperuser(db(), request);
    return reply
      .header("Cache-Control", "no-store")
      .send({ data: await readUserFormConfiguration(db()) });
  });
  app.put("/system-collections/users/form", async (request, reply) => {
    const actor = await requireSuperuser(db(), request);
    return reply.header("Cache-Control", "no-store").send({
      data: await saveUserFormConfiguration(db(), request.body, actor.id),
    });
  });
  async function read(
    request: FastifyRequest,
    reply: FastifyReply,
    own: boolean,
  ) {
    const actor = await authenticateAccess(db(), request.headers.authorization);
    const id = own
      ? actor.id
      : parseUserId((request.params as { id: string }).id);
    let writable = true;
    if (!own) {
      await requireSettingsRead(db(), request, "users");
      try {
        await requireSettingsSection(db(), request, "users");
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !("statusCode" in error) ||
          error.statusCode !== 403
        ) {
          throw error;
        }
        writable = false;
      }
    }
    return reply
      .header("Cache-Control", "no-store")
      .send({ data: await readUserForm(db(), actor, id, writable) });
  }
  async function write(
    request: FastifyRequest,
    reply: FastifyReply,
    own: boolean,
  ) {
    const actor = await authenticateAccess(db(), request.headers.authorization);
    if (!own) {
      await requireSettingsSection(db(), request, "users");
    }
    const id = own
      ? actor.id
      : parseUserId((request.params as { id: string }).id);
    return reply
      .header("Cache-Control", "no-store")
      .send({ data: await saveUserForm(db(), actor, id, request.body) });
  }
  app.get("/users/me/form", (request, reply) => read(request, reply, true));
  app.get("/users/:id/form", (request, reply) => read(request, reply, false));
  app.patch("/users/me/form", (request, reply) => write(request, reply, true));
  app.patch("/users/:id/form", (request, reply) =>
    write(request, reply, false),
  );
}
