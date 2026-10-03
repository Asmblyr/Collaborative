import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { requireSuperuser } from "../auth/require-superuser.js";
import { grantFor, loadAccess } from "../permissions/access.js";
import {
  addCollectionField,
  createCollection,
  listCollections,
  updateCollectionField,
} from "./service.js";
import {
  registerCollectionLifecycleRoutes,
  type CollectionDeletedHandler,
} from "./lifecycle-routes.js";
import {
  createFolder,
  deleteFolder,
  listFolders,
  renameFolder,
  reorderFolder,
} from "./folders.js";
import { moveCollection } from "./ordering.js";
import { addCollectionRelation } from "./relations.js";
import { updateFieldSearch } from "./field-search.js";
import { updateFieldPresentation } from "./field-presentation.js";
import { updateRelationSearch } from "./relation-search.js";
import { updateCollectionMetadata } from "./metadata.js";
import { updateCollectionDisplay } from "./display.js";
import { updateCollectionForm } from "./form-settings.js";
import { reconcileForm } from "./form-layout.js";
import { templateFields } from "./label-template.js";
import { saveFieldConfiguration } from "./field-configuration.js";

export function registerCollectionRoutes(
  app: FastifyInstance,
  database: Knex | null,
  onDeleted?: CollectionDeletedHandler,
): void {
  function db(): Knex {
    if (!database) {
      throw Object.assign(new Error("Database is not configured"), {
        statusCode: 503,
      });
    }
    return database;
  }
  const admin = {
    preHandler: (request: Parameters<typeof requireSuperuser>[1]) =>
      requireSuperuser(db(), request),
  };

  app.get("/collections", async (request) => {
    const access = await loadAccess(db(), request.headers.authorization);
    const collections = await listCollections(db());
    const visibleCollections = collections.flatMap((collection) => {
      const create = grantFor(access, collection.name, "create");
      const read = grantFor(access, collection.name, "read");
      const update = grantFor(access, collection.name, "update");
      const remove = grantFor(access, collection.name, "delete");
      if (!create && !read && !update && !remove) {
        return [];
      }
      const visible = new Set([
        ...(create ?? []),
        ...(read ?? []),
        ...(update ?? []),
      ]);
      const allFields = visible.has("*");
      return [
        {
          ...collection,
          state:
            collection.state &&
            (allFields || visible.has(collection.state.field))
              ? collection.state
              : null,
          formLayout: reconcileForm(
            collection.formLayout,
            collection.fields
              .filter((f) => allFields || visible.has(f.name))
              .map((f) => f.name),
          ),
          displayTemplate:
            collection.displayTemplate &&
            templateFields(collection.displayTemplate).every(
              (f) =>
                f === collection.primaryKey.name ||
                read?.includes("*") ||
                read?.includes(f),
            )
              ? collection.displayTemplate
              : null,
          fields: allFields
            ? collection.fields
            : collection.fields.filter((field) => visible.has(field.name)),
          timestamps: {
            createdAt:
              collection.timestamps.createdAt &&
              (allFields || visible.has("created_at")),
            updatedAt:
              collection.timestamps.updatedAt &&
              (allFields || visible.has("updated_at")),
          },
          access: {
            create,
            read,
            update,
            delete: Boolean(remove),
            structure:
              access.principal.superuser &&
              !collection.name.startsWith("plugin_"),
          },
        },
      ];
    });
    const folders = await listFolders(db());
    const visibleNames = new Set(
      visibleCollections.map((collection) => collection.name),
    );
    for (const collection of visibleCollections) {
      if (
        collection.parentCollection &&
        !visibleNames.has(collection.parentCollection)
      ) {
        collection.parentCollection = null;
      }
    }
    const visibleFolderIds = new Set(
      visibleCollections.map((collection) => collection.folderId),
    );
    return {
      data: visibleCollections,
      folders: access.principal.superuser
        ? folders
        : folders.filter((folder) => visibleFolderIds.has(folder.id)),
    };
  });

  app.post("/folders", admin, async (request, reply) =>
    reply.code(201).send({ data: await createFolder(db(), request.body) }),
  );

  app.patch<{ Params: { id: string } }>(
    "/folders/:id",
    admin,
    async (request) => ({
      data: await renameFolder(db(), request.params.id, request.body),
    }),
  );

  app.patch<{ Params: { id: string } }>(
    "/folders/:id/order",
    admin,
    async (request) => ({
      data: await reorderFolder(db(), request.params.id, request.body),
    }),
  );

  app.delete<{ Params: { id: string } }>(
    "/folders/:id",
    admin,
    async (request, reply) => {
      await deleteFolder(db(), request.params.id);
      return reply.code(204).send();
    },
  );

  app.patch<{ Params: { name: string } }>(
    "/collections/:name/folder",
    admin,
    async (request) => ({
      data: await moveCollection(db(), request.params.name, request.body),
    }),
  );

  app.patch<{ Params: { name: string } }>(
    "/collections/:name/navigation",
    admin,
    async (request) => ({
      data: await moveCollection(db(), request.params.name, request.body),
    }),
  );

  app.post("/collections", admin, async (request, reply) => {
    if (!database) {
      return reply.code(503).send({ message: "Database is not configured" });
    }
    const collection = await createCollection(database, request.body);
    return reply.code(201).send({ data: collection });
  });

  app.patch<{ Params: { name: string } }>(
    "/collections/:name/settings",
    admin,
    async (request) => ({
      data: await updateCollectionMetadata(
        db(),
        request.params.name,
        request.body,
      ),
    }),
  );

  app.put<{ Params: { name: string } }>(
    "/collections/:name/display",
    admin,
    async (request) => ({
      data: await updateCollectionDisplay(
        db(),
        request.params.name,
        request.body,
      ),
    }),
  );

  app.put<{ Params: { name: string } }>(
    "/collections/:name/form",
    admin,
    async (request) => ({
      data: await updateCollectionForm(db(), request.params.name, request.body),
    }),
  );

  app.post<{ Params: { name: string } }>(
    "/collections/:name/fields",
    admin,
    async (request, reply) => {
      if (!database) {
        return reply.code(503).send({ message: "Database is not configured" });
      }
      const collection = await addCollectionField(
        database,
        request.params.name,
        request.body,
      );
      return reply.code(201).send({ data: collection });
    },
  );

  app.post<{ Params: { name: string } }>(
    "/collections/:name/relations",
    admin,
    async (request, reply) => {
      return reply.code(201).send({
        data: await addCollectionRelation(
          db(),
          request.params.name,
          request.body,
        ),
      });
    },
  );

  app.patch<{ Params: { name: string; field: string } }>(
    "/collections/:name/fields/:field",
    admin,
    async (request, reply) => {
      if (!database) {
        return reply.code(503).send({ message: "Database is not configured" });
      }
      const collection = await updateCollectionField(
        database,
        request.params.name,
        request.params.field,
        request.body,
      );
      return { data: collection };
    },
  );

  app.put<{ Params: { name: string; field: string } }>(
    "/collections/:name/fields/:field/configuration",
    admin,
    async (request) => ({
      data: await saveFieldConfiguration(
        db(),
        request.params.name,
        request.params.field,
        request.body,
      ),
    }),
  );

  app.post<{ Params: { name: string; field: string } }>(
    "/collections/:name/fields/:field/configuration",
    admin,
    async (request, reply) =>
      reply.code(201).send({
        data: await saveFieldConfiguration(
          db(),
          request.params.name,
          request.params.field,
          request.body,
          true,
        ),
      }),
  );

  app.put<{ Params: { name: string; field: string } }>(
    "/collections/:name/fields/:field/presentation",
    admin,
    async (request) => ({
      data: await updateFieldPresentation(
        db(),
        request.params.name,
        request.params.field,
        request.body,
      ),
    }),
  );

  app.put<{ Params: { name: string; field: string } }>(
    "/collections/:name/fields/:field/search",
    admin,
    async (request) => ({
      data: await updateFieldSearch(
        db(),
        request.params.name,
        request.params.field,
        request.body,
      ),
    }),
  );

  app.put<{ Params: { name: string; field: string } }>(
    "/collections/:name/relations/:field/search",
    admin,
    async (request) => ({
      data: await updateRelationSearch(
        db(),
        request.params.name,
        request.params.field,
        request.body,
      ),
    }),
  );

  registerCollectionLifecycleRoutes(app, database, onDeleted);
}
