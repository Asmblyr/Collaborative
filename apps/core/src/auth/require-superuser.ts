import type { FastifyRequest } from "fastify";
import type { Knex } from "knex";
import { authenticateAccess } from "./tokens.js";

export async function requireSuperuser(
  database: Knex,
  request: FastifyRequest,
) {
  const user = await authenticateAccess(
    database,
    request.headers.authorization,
  );
  if (!user.superuser) {
    throw Object.assign(new Error("Permission denied"), { statusCode: 403 });
  }
  return user;
}
