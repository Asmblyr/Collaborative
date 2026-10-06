import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { loginWithPassword } from "../users.js";
import { parseLogin, InvalidCredentialsError } from "../validation.js";
import { loginRateLimit } from "../login-rate-limit.js";
import { credentialRateLimit } from "../rate-limit.js";
import { claimLoginLink, parseLoginLink } from "../link-login.js";
import { authenticationOptions, loginPasskey } from "../passkeys/service.js";
import type { PasskeyConfig } from "../passkeys/config.js";
import { authenticateAccess, revokeUserSession } from "../tokens.js";
import { startBrowserSession } from "./sessions.js";
import {
  clearSessionCookies,
  cookieValue,
  requireBrowserOrigin,
  setCookie,
  type BrowserConfig,
} from "./cookies.js";

export function registerBrowserRoutes(
  app: FastifyInstance,
  database: Knex | null,
  config: BrowserConfig,
  passkeys: PasskeyConfig,
): void {
  const db = () => {
    if (!database) {
      throw Object.assign(new Error("Database unavailable"), {
        statusCode: 503,
      });
    }
    return database;
  };
  app.register(async (scope) => {
    scope.addHook("onRequest", async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      requireBrowserOrigin(request, config);
    });
    scope.post(
      "/auth/browser/login",
      { preHandler: loginRateLimit() },
      async (request, reply) => {
        const { email, password } = parseLogin(request.body);
        const pair = await loginWithPassword(
          db(),
          email,
          password,
          request.headers["user-agent"],
        );
        await startBrowserSession(db(), pair, reply, config);
        return { ok: true };
      },
    );
    scope.post(
      "/auth/browser/invitations/claim",
      { preHandler: credentialRateLimit(30) },
      async (request, reply) => {
        const pair = await claimLoginLink(
          db(),
          parseLoginLink(request.body),
          request.headers["user-agent"],
        );
        await startBrowserSession(db(), pair, reply, config);
        return { ok: true };
      },
    );
    const challenge = `${config.prefix}_passkey_challenge`;
    scope.post(
      "/auth/browser/passkeys/options",
      { preHandler: credentialRateLimit(30) },
      async (_request, reply) => {
        const result = await authenticationOptions(db(), passkeys);
        setCookie(reply, config, challenge, result.challengeId, 300);
        return result;
      },
    );
    scope.post(
      "/auth/browser/passkeys/login",
      { preHandler: credentialRateLimit(30) },
      async (request, reply) => {
        const body = request.body as { challengeId?: string } | undefined;
        const proof = cookieValue(request, challenge);
        setCookie(reply, config, challenge, "", 0);
        if (!proof || proof !== body?.challengeId) {
          throw new InvalidCredentialsError();
        }
        const pair = await loginPasskey(
          db(),
          passkeys,
          body,
          request.headers["user-agent"],
        );
        await startBrowserSession(db(), pair, reply, config);
        return { ok: true };
      },
    );
    scope.post("/auth/browser/logout", async (request, reply) => {
      clearSessionCookies(reply, config);
      try {
        const user = await authenticateAccess(
          db(),
          request.headers.authorization,
        );
        await revokeUserSession(db(), user.sessionId);
      } catch (error) {
        if (!(error instanceof InvalidCredentialsError)) {
          throw error;
        }
      }
      return reply.code(204).send();
    });
  });
}
