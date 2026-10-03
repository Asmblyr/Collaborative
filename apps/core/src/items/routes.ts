import { historyFields } from "../permissions/row-access.js";
import { mutationContext, type MutationFactory } from "./mutation-context.js";
import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import {
  loadAccess,
  projectFields,
  requireGrant,
} from "../permissions/access.js";
import { listItemEvents } from "./events-repository.js";
import { getItem } from "./service.js";
import { parseSearchQuery, searchAll } from "./search.js";
import { relatedItems, requireRelatedRead } from "./related.js";
import { bulkUpdateItems, parseBulkUpdate } from "./bulk-service.js";
import { readItem, readItemList } from "./reader.js";
import {
  createAuthorizedItem,
  updateAuthorizedItem,
  deleteAuthorizedItem,
} from "./writer.js";

interface CollectionParams {
  collection: string;
}
interface ItemParams extends CollectionParams {
  id: string;
}

export function registerItemRoutes(
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

  app.get<{
    Params: CollectionParams;
    Querystring: {
      fields?: string;
      page?: string;
      limit?: string;
      sort?: string;
      direction?: string;
      q?: string;
      filter?: string;
    };
  }>("/items/:collection", async (request) => {
    const access = await loadAccess(db(), request.headers.authorization);
    return readItemList(db(), access, request.params.collection, request.query);
  });
  app.get<{ Querystring: { q?: string } }>("/search", async (request) => {
    const access = await loadAccess(db(), request.headers.authorization);
    return searchAll(db(), access, parseSearchQuery(request.query.q));
  });
  app.post<{ Params: CollectionParams }>(
    "/items/:collection",
    async (request, reply) => {
      const access = await loadAccess(db(), request.headers.authorization);
      const result = await createAuthorizedItem(
        db(),
        access,
        request.params.collection,
        request.body,
        mutations(access),
      );
      return reply.code(201).send(result);
    },
  );
  app.get<{ Params: ItemParams; Querystring: { fields?: string } }>(
    "/items/:collection/:id",
    async (request) => {
      const access = await loadAccess(db(), request.headers.authorization);
      return readItem(
        db(),
        access,
        request.params.collection,
        request.params.id,
        request.query.fields,
      );
    },
  );
  app.get<{ Params: ItemParams }>(
    "/items/:collection/:id/related",
    async (request) => {
      const access = await loadAccess(db(), request.headers.authorization);
      const allowed = requireGrant(access, request.params.collection, "read");
      await getItem(
        db(),
        request.params.collection,
        request.params.id,
        allowed,
        undefined,
        access,
      );
      return relatedItems(
        db(),
        request.params.collection,
        request.params.id,
        access,
      );
    },
  );
  app.get<{
    Params: CollectionParams;
    Querystring: { item?: string; limit?: string; before?: string };
  }>("/item-events/:collection", async (request) => {
    const access = await loadAccess(db(), request.headers.authorization);
    requireGrant(access, request.params.collection, "read");
    const allowed = historyFields(access, request.params.collection);
    if (!allowed.length) return { data: [], nextCursor: null };
    const page = await listItemEvents(
      db(),
      request.params.collection,
      request.query,
    );
    if (allowed.includes("*")) {
      return page;
    }
    const events = page.data as {
      before: Record<string, unknown> | null;
      after: Record<string, unknown> | null;
    }[];
    return {
      ...page,
      data: events
        .map((event) => ({
          ...event,
          before: projectFields(event.before, allowed),
          after: projectFields(event.after, allowed),
        }))
        .filter(
          (event) =>
            Object.keys(event.before ?? {}).length > 0 ||
            Object.keys(event.after ?? {}).length > 0,
        ),
    };
  });
  app.patch<{ Params: ItemParams }>(
    "/items/:collection/:id",
    async (request) => {
      const access = await loadAccess(db(), request.headers.authorization);
      return updateAuthorizedItem(
        db(),
        access,
        request.params.collection,
        request.params.id,
        request.body,
        mutations(access),
      );
    },
  );
  app.patch<{ Params: CollectionParams }>(
    "/items/:collection",
    async (request) => {
      const access = await loadAccess(db(), request.headers.authorization);
      const allowed = requireGrant(access, request.params.collection, "update");
      const input = parseBulkUpdate(request.body);
      await requireRelatedRead(
        db(),
        request.params.collection,
        input.values,
        access,
      );
      return {
        data: await bulkUpdateItems(
          db(),
          request.params.collection,
          input,
          { ...mutations(access), access },
          allowed,
        ),
      };
    },
  );
  app.delete<{ Params: ItemParams }>(
    "/items/:collection/:id",
    async (request, reply) => {
      const access = await loadAccess(db(), request.headers.authorization);
      await deleteAuthorizedItem(
        db(),
        access,
        request.params.collection,
        request.params.id,
        mutations(access),
      );
      return reply.code(204).send();
    },
  );
}
