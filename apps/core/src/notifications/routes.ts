import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import type { LoadedPlugin } from "../plugins/definition.js";
import { loadAccess } from "../permissions/access.js";
import { ItemError } from "../items/validation.js";
import { NotificationsService } from "./service.js";

export function registerNotificationRoutes(
  app: FastifyInstance,
  database: Knex | null,
  plugins: readonly LoadedPlugin[],
): void {
  const sources = new Set(
    plugins
      .filter((plugin) => plugin.capabilities?.includes("notifications"))
      .map((plugin) => plugin.namespace)
      .filter((source): source is string => Boolean(source)),
  );
  async function service(authorization?: string) {
    if (!database) {
      throw Object.assign(new Error("Database is not configured"), {
        statusCode: 503,
      });
    }
    return new NotificationsService(
      database,
      await loadAccess(database, authorization),
      sources,
    );
  }
  app.get<{ Querystring: { limit?: string } }>(
    "/notifications",
    async (request, reply) => {
      const inbox = await service(request.headers.authorization);
      const limit = request.query.limit ?? "50";
      if (!/^[1-9]\d{0,2}$/.test(limit) || Number(limit) > 200) {
        throw new ItemError("Invalid notification limit", 400);
      }
      reply.header("Cache-Control", "no-store");
      return inbox.list(Number(limit));
    },
  );
  app.post<{ Params: { id: string } }>(
    "/notifications/:id/read",
    async (request, reply) => {
      const inbox = await service(request.headers.authorization);
      if (
        !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(request.params.id)
      ) {
        throw new ItemError("Invalid notification id", 400);
      }
      await inbox.read(request.params.id);
      return reply.header("Cache-Control", "no-store").code(204).send();
    },
  );
  app.post("/notifications/read-all", async (request, reply) => {
    const inbox = await service(request.headers.authorization);
    const body = request.body as { before?: unknown } | null;
    const before = body?.before;
    if (
      !body ||
      Object.keys(body).length !== 1 ||
      typeof before !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(before) ||
      !Number.isFinite(Date.parse(before)) ||
      Date.parse(before) > Date.now()
    ) {
      throw new ItemError("Expected a past inbox snapshot timestamp", 400);
    }
    await inbox.readAll(before);
    return reply.header("Cache-Control", "no-store").code(204).send();
  });
}
