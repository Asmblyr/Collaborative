import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import type { FileStorage } from "./storage/types.js";
import type { RuntimeSource } from "../shared/runtime-source.js";
import { fileContent } from "./service.js";
import { parseFileId, fileError } from "./validation.js";
import { sendFileContent } from "./content-response.js";

export function registerPublicFileRoutes(
  app: FastifyInstance,
  database: Knex | null,
  storage: RuntimeSource<FileStorage>,
): void {
  app.get<{ Params: { id: string }; Querystring: { preview?: string } }>(
    "/public/files/:id/content",
    async (request, reply) => {
      if (!database) {
        throw fileError("Database is not configured", 503);
      }
      const preview = request.query.preview === "1";
      return sendFileContent(
        reply,
        await fileContent(
          database,
          storage,
          parseFileId(request.params.id),
          preview,
          true,
        ),
        preview,
      );
    },
  );
}
