import { registerPublicFileRoutes } from "./public-routes.js";
import { sendFileContent } from "./content-response.js";
import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import {
  requireSettingsRead,
  requireSettingsSection,
  loadSettingsAccess,
} from "../settings/access.js";
import { credentialRateLimit } from "../auth/rate-limit.js";
import { files, fileEvents, listFiles, publicFile } from "./repository.js";
import { deleteFile, fileContent, updateFile, uploadFile } from "./service.js";
import {
  MAX_FILE_BYTES,
  fileError,
  parseFileId,
  parseFileList,
  parseFilePatch,
  uploadHeaders,
} from "./validation.js";
import type { FileStorage } from "./storage/types.js";
import {
  resolveRuntime,
  type RuntimeSource,
} from "../shared/runtime-source.js";
import { loadAccess } from "../permissions/access.js";
import { requireFileRead } from "./references.js";
import { listCollections } from "../collections/catalog-repository.js";

export function registerFileRoutes(
  app: FastifyInstance,
  database: Knex | null,
  storage: RuntimeSource<FileStorage>,
) {
  registerPublicFileRoutes(app, database, storage);
  app.register(async (scope) => {
    const db = () => {
      if (!database) throw fileError("База данных не настроена", 503);
      return database;
    };
    // Authenticate before consuming uploads; attached files inherit the field's read grant.
    scope.addHook("onRequest", async (request, reply) => {
      reply.header("Cache-Control", "private, no-store");
      if (
        (request.routeOptions.url === "/files/:id" &&
          request.method === "GET") ||
        request.routeOptions.url === "/files/:id/content"
      ) {
        const access = await loadAccess(db(), request.headers.authorization);
        await requireFileRead(
          db(),
          parseFileId((request.params as { id: string }).id),
          access,
        );
      } else if (request.routeOptions.url === "/files/resolve")
        await loadAccess(db(), request.headers.authorization);
      else if (request.method === "GET")
        await requireSettingsRead(db(), request, "files");
      else await requireSettingsSection(db(), request, "files");
    });
    scope.addContentTypeParser(
      "application/octet-stream",
      { parseAs: "buffer", bodyLimit: MAX_FILE_BYTES },
      (_request, body, done) => done(null, body),
    );
    const actor = async (
      request: Parameters<typeof requireSettingsSection>[1] & { id: string },
    ) => ({
      id: (await requireSettingsSection(db(), request, "files")).id,
      requestId: request.id,
    });
    scope.get("/files", async (request) => {
      const result = await listFiles(db(), parseFileList(request.query));
      const access = await loadSettingsAccess(
        db(),
        request.headers.authorization,
      );
      return {
        ...result,
        meta: {
          ...result.meta,
          storageConfigured: Boolean(await resolveRuntime(storage)),
          canManage: access.editableSections.includes("files"),
          maxFileBytes: MAX_FILE_BYTES,
        },
      };
    });
    scope.get<{ Querystring: { ids?: string } }>(
      "/files/resolve",
      async (request) => {
        if (typeof request.query.ids !== "string")
          throw fileError("Supply file identifiers", 400);
        const ids = [...new Set(request.query.ids.split(",").map(parseFileId))];
        if (!ids.length || ids.length > 100)
          throw fileError("Supply up to 100 file identifiers", 400);
        const access = await loadAccess(db(), request.headers.authorization);
        const catalog = access.principal.superuser
          ? []
          : await listCollections(db());
        const allowed: string[] = [];
        for (const id of ids) {
          try {
            await requireFileRead(db(), id, access, catalog);
            allowed.push(id);
          } catch (error) {
            if (
              !(
                error &&
                typeof error === "object" &&
                "statusCode" in error &&
                error.statusCode === 404
              )
            )
              throw error;
          }
        }
        const rows = allowed.length
          ? await files(db()).whereIn("id", allowed).select()
          : [];
        return { data: rows.map(publicFile) };
      },
    );
    scope.post(
      "/files",
      { bodyLimit: MAX_FILE_BYTES, onRequest: credentialRateLimit(30) },
      async (request, reply) => {
        if (
          !Buffer.isBuffer(request.body) ||
          request.headers["content-type"]?.split(";")[0] !==
            "application/octet-stream"
        ) {
          throw fileError(
            "Отправьте содержимое файла как application/octet-stream",
            415,
          );
        }
        const result = await uploadFile(
          db(),
          storage,
          request.body,
          uploadHeaders(request.headers),
          await actor(request),
        );
        return reply.code(201).send({ data: result });
      },
    );
    scope.get<{ Params: { id: string } }>("/files/:id", async (request) => {
      const row = await files(db())
        .where({ id: parseFileId(request.params.id) })
        .first();
      if (!row) throw fileError("Файл не найден", 404);
      return { data: publicFile(row) };
    });
    scope.patch<{ Params: { id: string } }>("/files/:id", async (request) => ({
      data: await updateFile(
        db(),
        parseFileId(request.params.id),
        parseFilePatch(request.body),
        await actor(request),
      ),
    }));
    scope.delete<{ Params: { id: string } }>(
      "/files/:id",
      async (request, reply) => {
        await deleteFile(
          db(),
          storage,
          parseFileId(request.params.id),
          await actor(request),
        );
        return reply.code(204).send();
      },
    );
    scope.get<{ Params: { id: string } }>(
      "/files/:id/events",
      async (request) => ({
        data: await fileEvents(db(), parseFileId(request.params.id)),
      }),
    );
    scope.get<{ Params: { id: string }; Querystring: { preview?: string } }>(
      "/files/:id/content",
      async (request, reply) => {
        const { row, stream } = await fileContent(
          db(),
          storage,
          parseFileId(request.params.id),
          request.query.preview === "1",
        );
        const preview = request.query.preview === "1";
        return sendFileContent(reply, { row, stream }, preview);
      },
    );
  });
}
