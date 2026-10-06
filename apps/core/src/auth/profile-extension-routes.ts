import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Knex } from "knex";
import { loadPrincipalAccess } from "../permissions/access.js";
import { authenticateAccess } from "./tokens.js";
import { parseUserId } from "./validation.js";
import {
  requireSettingsRead,
  requireSettingsSection,
} from "../settings/access.js";
import { requireSettingsAdministrator } from "../settings/admin-access.js";
import {
  profileExtensionBinding,
  configureProfileExtension,
} from "./profile-extension-config.js";
import {
  readProfileExtension,
  saveProfileExtension,
} from "./profile-extension.js";
import { readUserProfile } from "./profile-repository.js";
import { updateProfile } from "./profile.js";
import {
  mutationContext,
  type MutationFactory,
} from "../items/mutation-context.js";

export function registerProfileExtensionRoutes(
  app: FastifyInstance,
  database: Knex | null,
  mutations: MutationFactory = mutationContext,
): void {
  function db(): Knex {
    if (!database) {
      throw Object.assign(new Error("Database is not configured"), {
        statusCode: 503,
      });
    }
    return database;
  }
  app.get("/users/profile-extension", async (request, reply) => {
    await requireSettingsRead(db(), request, "users");
    return reply
      .header("Cache-Control", "no-store")
      .send({ data: await profileExtensionBinding(db()) });
  });
  app.put("/users/profile-extension", async (request, reply) => {
    await requireSettingsAdministrator(db(), request);
    return reply
      .header("Cache-Control", "no-store")
      .send({ data: await configureProfileExtension(db(), request.body) });
  });
  async function extension(
    request: FastifyRequest,
    own: boolean,
    write: boolean,
  ) {
    const user = await authenticateAccess(db(), request.headers.authorization);
    const targetId = own
      ? user.id
      : parseUserId((request.params as { id: string }).id);
    if (!own) {
      if (write) {
        await requireSettingsSection(db(), request, "users");
      } else {
        await requireSettingsRead(db(), request, "users");
      }
    }
    await readUserProfile(db(), targetId);
    const access = await loadPrincipalAccess(db(), { ...user, kind: "user" });
    return write
      ? saveProfileExtension(
          db(),
          access,
          targetId,
          request.body,
          mutations(access),
        )
      : readProfileExtension(db(), access, targetId);
  }
  app.get("/users/me/extension", async (request, reply) =>
    reply
      .header("Cache-Control", "no-store")
      .send(await extension(request, true, false)),
  );
  app.patch("/users/me/extension", async (request, reply) =>
    reply
      .header("Cache-Control", "no-store")
      .send(await extension(request, true, true)),
  );
  app.get("/users/:id/extension", async (request, reply) =>
    reply
      .header("Cache-Control", "no-store")
      .send(await extension(request, false, false)),
  );
  app.patch("/users/:id/extension", async (request, reply) =>
    reply
      .header("Cache-Control", "no-store")
      .send(await extension(request, false, true)),
  );
  app.get<{ Params: { id: string } }>(
    "/users/:id/profile",
    async (request, reply) => {
      await requireSettingsRead(db(), request, "users");
      return reply.header("Cache-Control", "no-store").send({
        data: await readUserProfile(db(), parseUserId(request.params.id)),
      });
    },
  );
  app.patch<{ Params: { id: string } }>(
    "/users/:id/profile",
    async (request, reply) => {
      await requireSettingsSection(db(), request, "users");
      const actor = await authenticateAccess(
        db(),
        request.headers.authorization,
      );
      return reply.header("Cache-Control", "no-store").send({
        data: await updateProfile(
          db(),
          actor,
          request.body,
          parseUserId(request.params.id),
        ),
      });
    },
  );
}
