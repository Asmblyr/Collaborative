import { mutationContext, type MutationFactory } from "./mutation-context.js";
import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { loadAccess } from "../permissions/access.js";
import type { RelationAddress } from "./relation-context.js";
import type { ItemListQuery } from "./list-query.js";
import { listRelationItems } from "./relation-list.js";
import { listRelationCandidates } from "./relation-candidates.js";
import {
  changeRelationItems,
  createRelationItem,
} from "./relation-mutations.js";
import { registerRelationLinkRoutes } from "./relation-link-routes.js";
import { commitAuthorizedItems } from "./writer.js";

export function registerItemRelationRoutes(
  app: FastifyInstance,
  database: Knex | null,
  mutations: MutationFactory = mutationContext,
) {
  function db(): Knex {
    if (!database) {
      throw Object.assign(new Error("Database is not configured"), {
        statusCode: 503,
      });
    }
    return database;
  }
  const path = "/items/:collection/:id/relations/:field";
  app.post<{ Params: { collection: string } }>(
    "/items/:collection/commit",
    async (request) => {
      const access = await loadAccess(db(), request.headers.authorization);
      return commitAuthorizedItems(
        db(),
        access,
        request.params.collection,
        request.body,
        mutations(access),
      );
    },
  );
  registerRelationLinkRoutes(app, db, mutations);
  app.get<{ Params: RelationAddress; Querystring: ItemListQuery }>(
    `${path}/candidates`,
    async (request) => {
      const access = await loadAccess(db(), request.headers.authorization);
      return listRelationCandidates(
        db(),
        request.params,
        access,
        request.query,
      );
    },
  );
  app.get<{ Params: RelationAddress; Querystring: ItemListQuery }>(
    path,
    async (request) => {
      const access = await loadAccess(db(), request.headers.authorization);
      return listRelationItems(db(), request.params, access, request.query);
    },
  );
  app.patch<{ Params: RelationAddress }>(path, async (request, reply) => {
    const access = await loadAccess(db(), request.headers.authorization);
    await changeRelationItems(
      db(),
      request.params,
      request.body,
      access,
      mutations(access),
    );
    return reply.code(204).send();
  });
  app.post<{ Params: RelationAddress }>(path, async (request, reply) => {
    const access = await loadAccess(db(), request.headers.authorization);
    const data = await createRelationItem(
      db(),
      request.params,
      request.body,
      access,
      mutations(access),
    );
    return reply.code(201).send({ data });
  });
}
