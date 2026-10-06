import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import type { FileStorage } from "../files/storage/types.js";
import type { RuntimeSource } from "../shared/runtime-source.js";
import { fileError, rasterType, uploadHeaders } from "../files/validation.js";
import { uploadFile } from "../files/service.js";
import { authenticateAccess } from "./tokens.js";
import { credentialRateLimit } from "./rate-limit.js";

export function registerProfileAvatarRoutes(
  app: FastifyInstance,
  database: Knex | null,
  storage: RuntimeSource<FileStorage>,
): void {
  app.register(async (scope) => {
    scope.addHook("onRequest", async (request) => {
      if (!database) {
        throw fileError("Database is not configured", 503);
      }
      await authenticateAccess(database, request.headers.authorization);
    });
    scope.addContentTypeParser(
      "application/octet-stream",
      { parseAs: "buffer", bodyLimit: 2 * 1024 * 1024 },
      (_request, body, done) => done(null, body),
    );
    scope.post(
      "/users/me/avatar",
      { preHandler: credentialRateLimit(10) },
      async (request, reply) => {
        if (!database) {
          throw fileError("Database is not configured", 503);
        }
        const user = await authenticateAccess(
          database,
          request.headers.authorization,
        );
        const content = request.body;
        if (
          !Buffer.isBuffer(content) ||
          !content.length ||
          !rasterType(content)
        ) {
          throw fileError("Select a PNG, JPEG, GIF or WebP image up to 2 MiB");
        }
        const file = await uploadFile(
          database,
          storage,
          content,
          uploadHeaders(request.headers),
          { id: user.id, requestId: request.id },
        );
        return reply
          .header("Cache-Control", "no-store")
          .code(201)
          .send({ data: file });
      },
    );
  });
}
