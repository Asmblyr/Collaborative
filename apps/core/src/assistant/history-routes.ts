import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { parseId } from "../policies/validation.js";
import { objectInput } from "../shared/input.js";
import { historyCursor } from "./history-input.js";
import {
  createConversation,
  deleteConversation,
  listConversations,
  readConversation,
  renameConversation,
} from "./history-repository.js";

export function registerAssistantHistoryRoutes(
  app: FastifyInstance,
  db: Knex,
  authorize: (authorization?: string) => Promise<{ principal: { id: string } }>,
) {
  app.get<{ Querystring: { before?: string } }>(
    "/assistant/conversations",
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const access = await authorize(request.headers.authorization);
      const before =
        request.query.before === undefined
          ? undefined
          : parseId(request.query.before);
      return { data: await listConversations(db, access.principal.id, before) };
    },
  );
  app.post("/assistant/conversations", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const access = await authorize(request.headers.authorization);
    objectInput(request.body ?? {}, []);
    return reply
      .code(201)
      .send({ data: await createConversation(db, access.principal.id) });
  });
  app.get<{ Params: { id: string }; Querystring: { before?: string } }>(
    "/assistant/conversations/:id",
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const access = await authorize(request.headers.authorization);
      return {
        data: await readConversation(
          db,
          access.principal.id,
          parseId(request.params.id),
          historyCursor(request.query.before),
        ),
      };
    },
  );
  const handleRename = async (
    request: {
      headers: { authorization?: string };
      params: { id: string };
      body: unknown;
    },
    reply: { header: (name: string, value: string) => unknown },
  ) => {
    reply.header("Cache-Control", "no-store");
    const access = await authorize(request.headers.authorization);
    const body = objectInput(request.body, ["title"]);
    return {
      data: await renameConversation(
        db,
        access.principal.id,
        parseId(request.params.id),
        body.title,
      ),
    };
  };
  app.patch<{ Params: { id: string } }>(
    "/assistant/conversations/:id",
    handleRename,
  );
  app.patch<{ Params: { id: string } }>(
    "/assistant/sessions/:id",
    handleRename,
  );
  app.delete<{ Params: { id: string } }>(
    "/assistant/conversations/:id",
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const access = await authorize(request.headers.authorization);
      await deleteConversation(
        db,
        access.principal.id,
        parseId(request.params.id),
      );
      return reply.code(204).send();
    },
  );
}
