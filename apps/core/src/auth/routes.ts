import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import {
  authenticateAccess,
  refreshUserTokens,
  revokeSessionByRefreshToken,
  revokeUserSession,
} from "./tokens.js";
import { bootstrapSuperuser, loginWithPassword } from "./users.js";
import { acceptInvitation } from "./invitations.js";
import { getProfile } from "./profile.js";
import {
  InvalidCredentialsError,
  parseInvitationAcceptance,
  parseLogin,
  parseRefresh,
  parseSetup,
} from "./validation.js";
import { credentialRateLimit } from "./rate-limit.js";
import { loginRateLimit } from "./login-rate-limit.js";
import { claimLoginLink, parseLoginLink } from "./link-login.js";

export function registerAuthRoutes(
  app: FastifyInstance,
  database: Knex | null,
  setupToken: string | undefined,
): void {
  function db(): Knex {
    if (!database)
      throw Object.assign(new Error("Database is not configured"), {
        statusCode: 503,
      });
    return database;
  }

  app.get("/auth/setup/status", async (_request, reply) => {
    const user = await db()("asmblyr_users").withSchema("public").first("id");
    return reply
      .header("Cache-Control", "no-store")
      .send({ needsSetup: !user, configured: Boolean(setupToken) });
  });

  app.post(
    "/auth/setup",
    { preHandler: credentialRateLimit(10) },
    async (request, reply) => {
      if (!setupToken) {
        return reply
          .code(503)
          .send({ message: "Initial setup token is not configured" });
      }
      const input = parseSetup(request.body);
      const expected = createHash("sha256").update(setupToken).digest();
      const provided = createHash("sha256").update(input.setupToken).digest();
      if (!timingSafeEqual(expected, provided))
        throw new InvalidCredentialsError();
      const user = await bootstrapSuperuser(db(), input.email, input.password);
      return reply
        .header("Cache-Control", "no-store")
        .code(201)
        .send({ data: user });
    },
  );

  app.post(
    "/auth/login",
    { preHandler: loginRateLimit() },
    async (request, reply) => {
      const { email, password } = parseLogin(request.body);
      return reply
        .header("Cache-Control", "no-store")
        .send(
          await loginWithPassword(
            db(),
            email,
            password,
            request.headers["user-agent"],
          ),
        );
    },
  );
  app.post(
    "/auth/invitations/claim",
    { preHandler: credentialRateLimit(30) },
    async (request, reply) => {
      return reply
        .header("Cache-Control", "no-store")
        .send(
          await claimLoginLink(
            db(),
            parseLoginLink(request.body),
            request.headers["user-agent"],
          ),
        );
    },
  );

  app.post(
    "/auth/invitations/accept",
    { preHandler: credentialRateLimit(60) },
    async (request, reply) => {
      const { token, password } = parseInvitationAcceptance(request.body);
      return reply
        .header("Cache-Control", "no-store")
        .send({ data: await acceptInvitation(db(), token, password) });
    },
  );

  app.post(
    "/auth/refresh",
    { preHandler: credentialRateLimit(1000) },
    async (request, reply) =>
      reply
        .header("Cache-Control", "no-store")
        .send(await refreshUserTokens(db(), parseRefresh(request.body))),
  );

  app.get("/auth/me", async (request, reply) => {
    const user = await authenticateAccess(db(), request.headers.authorization);
    return reply
      .header("Cache-Control", "no-store")
      .send({ data: await getProfile(db(), user) });
  });

  app.post("/auth/logout", async (request, reply) => {
    if (request.body !== undefined) {
      await revokeSessionByRefreshToken(db(), parseRefresh(request.body));
    } else {
      const user = await authenticateAccess(
        db(),
        request.headers.authorization,
      );
      await revokeUserSession(db(), user.sessionId);
    }
    return reply.code(204).send();
  });
}
