import { mutationContext, type MutationFactory } from "./mutation-context.js";
import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { loadAccess } from "../permissions/access.js";
import type { RelationAddress } from "./relation-context.js";
import {
  createRelationLink,
  createRelationWithLink,
  getRelationLink,
  updateRelationLink,
} from "./relation-links.js";

export function registerRelationLinkRoutes(
  app: FastifyInstance,
  db: () => Knex,
  mutations: MutationFactory = mutationContext,
) {
  const path = "/items/:collection/:id/relations/:field";
  app.get<{ Params: RelationAddress & { linkId: string } }>(
    `${path}/links/:linkId`,
    async (request) => {
      const access = await loadAccess(db(), request.headers.authorization);
      return {
        data: await getRelationLink(
          db(),
          request.params,
          request.params.linkId,
          access,
        ),
      };
    },
  );
  app.patch<{ Params: RelationAddress & { linkId: string } }>(
    `${path}/links/:linkId`,
    async (request) => {
      const access = await loadAccess(db(), request.headers.authorization);
      return {
        data: await updateRelationLink(
          db(),
          request.params,
          request.params.linkId,
          request.body,
          access,
          mutations(access),
        ),
      };
    },
  );
  app.post<{ Params: RelationAddress & { targetId: string } }>(
    `${path}/links/to/:targetId`,
    async (request, reply) => {
      const access = await loadAccess(db(), request.headers.authorization);
      const data = await createRelationLink(
        db(),
        request.params,
        request.params.targetId,
        request.body,
        access,
        mutations(access),
      );
      return reply.code(201).send({ data });
    },
  );
  app.post<{ Params: RelationAddress }>(
    `${path}/records`,
    async (request, reply) => {
      const access = await loadAccess(db(), request.headers.authorization);
      const data = await createRelationWithLink(
        db(),
        request.params,
        request.body,
        access,
        mutations(access),
      );
      return reply.code(201).send({ data });
    },
  );
}
