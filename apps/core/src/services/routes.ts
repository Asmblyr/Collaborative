import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import {
  requireSettingsSection,
  requireSettingsRead,
} from "../settings/access.js";
import { credentialRateLimit } from "../auth/rate-limit.js";
import { parseId } from "../policies/validation.js";
import {
  accountDetail,
  createKey,
  listAccounts,
  revokeKey,
  saveAccount,
} from "./repository.js";
import { parseAccount, parseKey } from "./validation.js";
import { exchangeServiceKey } from "./tokens.js";

export function registerServiceRoutes(
  app: FastifyInstance,
  database: Knex | null,
) {
  function db(): Knex {
    if (!database) {
      throw Object.assign(new Error("Database is not configured"), {
        statusCode: 503,
      });
    }
    return database;
  }
  app.post(
    "/auth/service-token",
    { preHandler: credentialRateLimit(60) },
    async (request, reply) =>
      reply
        .header("Cache-Control", "no-store")
        .send(await exchangeServiceKey(db(), request.body)),
  );

  app.get("/service-accounts", async (request, reply) => {
    await requireSettingsRead(db(), request, "services");
    return reply
      .header("Cache-Control", "no-store")
      .send({ data: await listAccounts(db()) });
  });
  app.post("/service-accounts", async (request, reply) => {
    const user = await requireSettingsSection(db(), request, "services");
    return reply
      .header("Cache-Control", "no-store")
      .code(201)
      .send({
        data: await saveAccount(
          db(),
          null,
          parseAccount(request.body),
          user.id,
        ),
      });
  });
  app.get<{ Params: { id: string } }>(
    "/service-accounts/:id",
    async (request, reply) => {
      await requireSettingsRead(db(), request, "services");
      return reply
        .header("Cache-Control", "no-store")
        .send({ data: await accountDetail(db(), parseId(request.params.id)) });
    },
  );
  app.put<{ Params: { id: string } }>(
    "/service-accounts/:id",
    async (request, reply) => {
      const user = await requireSettingsSection(db(), request, "services");
      return reply.header("Cache-Control", "no-store").send({
        data: await saveAccount(
          db(),
          parseId(request.params.id),
          parseAccount(request.body),
          user.id,
        ),
      });
    },
  );
  app.post<{ Params: { id: string } }>(
    "/service-accounts/:id/keys",
    async (request, reply) => {
      const user = await requireSettingsSection(db(), request, "services");
      return reply
        .header("Cache-Control", "no-store")
        .code(201)
        .send({
          data: await createKey(
            db(),
            parseId(request.params.id),
            parseKey(request.body),
            user.id,
          ),
        });
    },
  );
  app.delete<{ Params: { id: string; keyId: string } }>(
    "/service-accounts/:id/keys/:keyId",
    async (request, reply) => {
      const user = await requireSettingsSection(db(), request, "services");
      await revokeKey(
        db(),
        parseId(request.params.id),
        parseId(request.params.keyId),
        user.id,
      );
      return reply.code(204).send();
    },
  );
}
