import type { FastifyInstance, FastifyReply } from "fastify";
import type { Knex } from "knex";
import type { MutationFactory } from "../items/mutation-context.js";
import type { PluginActions } from "../plugins/actions.js";
import { authenticateAccess } from "../auth/tokens.js";
import { credentialRateLimit } from "../auth/rate-limit.js";
import {
  authorizationInfo,
  beginAuthorization,
  decideAuthorization,
  registerClient,
} from "./authorizations.js";
import { listConnections, revokeConnection } from "./connections.js";
import { exchangeToken, revokeToken } from "./tokens.js";
import { McpOAuthError } from "./oauth-input.js";
import { handleMcp } from "./http-transport.js";
import { InputError } from "../shared/input.js";

export function registerMcpRoutes(
  app: FastifyInstance,
  database: Knex | null,
  origin: string,
  mutations?: MutationFactory,
  actions?: PluginActions,
) {
  const resource = `${origin}/api/mcp`;
  const metadata = `${origin}/.well-known/oauth-protected-resource/api/mcp`;
  function db(): Knex {
    if (!database) {
      throw Object.assign(new Error("Database is not configured"), {
        statusCode: 503,
      });
    }
    return database;
  }
  async function protocol(
    reply: FastifyReply,
    action: () => Promise<unknown>,
    challenge = false,
  ) {
    reply.header("Cache-Control", "no-store");
    try {
      return await action();
    } catch (error) {
      if (error instanceof InputError) {
        return reply.code(400).send({ error: "invalid_request" });
      }
      if (!(error instanceof McpOAuthError)) {
        throw error;
      }
      if (challenge && error.statusCode === 401) {
        reply.header("Access-Control-Allow-Origin", "*");
        reply.header("Access-Control-Expose-Headers", "WWW-Authenticate");
        reply.header(
          "WWW-Authenticate",
          `Bearer resource_metadata="${metadata}"`,
        );
      }
      return reply.code(error.statusCode).send({ error: error.error });
    }
  }

  app.get(
    "/.well-known/oauth-protected-resource/api/mcp",
    async (_request, reply) =>
      reply.header("Access-Control-Allow-Origin", "*").send({
        resource,
        authorization_servers: [origin],
        scopes_supported: ["mcp:read", "mcp:write"],
        bearer_methods_supported: ["header"],
      }),
  );
  app.get("/.well-known/oauth-authorization-server", async (_request, reply) =>
    reply.header("Access-Control-Allow-Origin", "*").send({
      issuer: origin,
      authorization_endpoint: `${origin}/api/mcp/oauth/authorize`,
      token_endpoint: `${origin}/api/mcp/oauth/token`,
      registration_endpoint: `${origin}/api/mcp/oauth/register`,
      revocation_endpoint: `${origin}/api/mcp/oauth/revoke`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: ["mcp:read", "mcp:write"],
    }),
  );

  // This scoped parser leaves the existing SSO provider's protocol untouched.
  app.register(async (oauth) => {
    oauth.addContentTypeParser(
      "application/x-www-form-urlencoded",
      { parseAs: "string", bodyLimit: 16384 },
      (_request, body, done) => {
        const entries = [...new URLSearchParams(String(body)).entries()];
        if (new Set(entries.map(([name]) => name)).size !== entries.length) {
          return done(new McpOAuthError("invalid_request"));
        }
        done(null, Object.fromEntries(entries));
      },
    );
    oauth.addHook("onRequest", async (_request, reply) => {
      reply.header("Access-Control-Allow-Origin", "*");
    });
    oauth.post(
      "/mcp/oauth/register",
      { preHandler: credentialRateLimit(15), bodyLimit: 16384 },
      (request, reply) =>
        protocol(reply, async () =>
          reply.code(201).send(await registerClient(db(), request.body)),
        ),
    );
    oauth.get(
      "/mcp/oauth/authorize",
      { preHandler: credentialRateLimit(60) },
      (request, reply) =>
        protocol(reply, async () => {
          const pending = await beginAuthorization(
            db(),
            request.query,
            resource,
          );
          return reply.redirect(`${origin}/mcp/authorize?request=${pending}`);
        }),
    );
    oauth.post(
      "/mcp/oauth/token",
      { preHandler: credentialRateLimit(60), bodyLimit: 16384 },
      (request, reply) =>
        protocol(reply, async () =>
          exchangeToken(db(), request.body, resource),
        ),
    );
    oauth.post(
      "/mcp/oauth/revoke",
      { preHandler: credentialRateLimit(60), bodyLimit: 16384 },
      (request, reply) =>
        protocol(reply, async () => {
          await revokeToken(db(), request.body);
          return reply.code(200).send();
        }),
    );
    oauth.options("/mcp/oauth/:operation", async (_request, reply) =>
      reply
        .header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        .header("Access-Control-Allow-Headers", "Content-Type")
        .code(204)
        .send(),
    );
  });
  app.get<{ Params: { request: string } }>(
    "/mcp/authorizations/:request",
    async (request, reply) => {
      await authenticateAccess(db(), request.headers.authorization);
      return protocol(reply, async () => ({
        data: await authorizationInfo(db(), request.params.request),
      }));
    },
  );
  app.post<{ Params: { request: string } }>(
    "/mcp/authorizations/:request",
    async (request, reply) => {
      const actor = await authenticateAccess(
        db(),
        request.headers.authorization,
      );
      return protocol(reply, async () => ({
        data: await decideAuthorization(
          db(),
          request.params.request,
          actor,
          request.body,
        ),
      }));
    },
  );
  app.get("/users/me/mcp-connections", async (request, reply) => {
    const actor = await authenticateAccess(db(), request.headers.authorization);
    return reply
      .header("Cache-Control", "no-store")
      .send({ data: await listConnections(db(), actor.id, resource) });
  });
  app.delete<{ Params: { id: string } }>(
    "/users/me/mcp-connections/:id",
    async (request, reply) => {
      const actor = await authenticateAccess(
        db(),
        request.headers.authorization,
      );
      return protocol(reply, async () => {
        await revokeConnection(db(), actor, request.params.id);
        return reply.code(204).send();
      });
    },
  );
  const handler: import("fastify").RouteHandlerMethod = (request, reply) =>
    protocol(
      reply,
      () => handleMcp(db(), resource, request, reply, mutations, actions),
      true,
    );
  const limits = { preHandler: credentialRateLimit(240) };
  app.get("/mcp", limits, handler);
  app.post("/mcp", limits, handler);
  app.delete("/mcp", limits, handler);
  app.options("/mcp", async (_request, reply) => {
    // Discovery must work before registration; bearer calls validate client origin.
    return reply
      .header("Access-Control-Allow-Origin", "*")
      .header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
      .header(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id, Last-Event-ID",
      )
      .code(204)
      .send();
  });
}
