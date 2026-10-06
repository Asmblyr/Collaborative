import type { FastifyReply } from "fastify";
import type { fileContent } from "./service.js";

export function sendFileContent(
  reply: FastifyReply,
  result: Awaited<ReturnType<typeof fileContent>>,
  preview: boolean,
): FastifyReply {
  const { row, stream } = result;
  return reply
    .header("Cache-Control", "no-store")
    .header(
      "Content-Type",
      preview ? row.preview_type! : "application/octet-stream",
    )
    .header("Content-Length", String(row.size))
    .header("X-Content-Type-Options", "nosniff")
    .header("Content-Security-Policy", "default-src 'none'; sandbox")
    .header(
      "Content-Disposition",
      `${preview ? "inline" : "attachment"}; filename="download"; filename*=UTF-8''${encodeURIComponent(row.filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16)}`)}`,
    )
    .send(stream);
}
