import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { Knex } from "knex";
import type { Provider } from "oidc-provider";
import { authenticateAccess } from "../auth/tokens.js";
import type { OAuthApplications } from "./applications.js";
import { consentRequest, type OAuthConsents } from "./consents.js";

export function registerOAuthInteractions(
  app: FastifyInstance,
  db: Knex,
  provider: Provider,
  apps: OAuthApplications,
  consents: OAuthConsents,
) {
  const path = "/oauth-interactions/:uid";
  app.get<{ Params: { uid: string } }>(path, async (request, reply) => {
    const user = await authenticateAccess(db, request.headers.authorization);
    const details = await provider.interactionDetails(request.raw, reply.raw);
    if (details.uid !== request.params.uid)
      throw Object.assign(new Error("Invalid interaction"), {
        statusCode: 400,
      });
    const client = await apps.row(String(details.params.client_id));
    if (!client?.enabled)
      throw Object.assign(new Error("Application unavailable"), {
        statusCode: 404,
      });
    return reply.header("Cache-Control", "no-store").send({
      data: {
        uid: details.uid,
        userId: user.id,
        email: user.email,
        name: client.name,
        description: client.description,
        redirectUri: details.params.redirect_uri,
        scopes: details.params.scope,
        allowed: await apps.allowed(client.id, user.id),
        canReuseConsent: await consents.canReuse(
          client.id,
          user.id,
          consentRequest(details.params),
        ),
      },
    });
  });

  const complete = async (
    request: FastifyRequest<{ Params: { uid: string } }>,
    reply: FastifyReply,
  ) => {
    const user = await authenticateAccess(db, request.headers.authorization);
    const input = request.body as Record<string, unknown> | null;
    if (
      !input ||
      typeof input.approve !== "boolean" ||
      input.userId !== user.id ||
      (input.reuse !== undefined && typeof input.reuse !== "boolean")
    ) {
      throw Object.assign(
        new Error("Account changed; reload the authorization page"),
        {
          statusCode: 400,
        },
      );
    }
    const details = await provider.interactionDetails(request.raw, reply.raw);
    if (details.uid !== request.params.uid)
      throw Object.assign(new Error("Invalid interaction"), {
        statusCode: 400,
      });
    const clientId = String(details.params.client_id);
    const allowed = await apps.allowed(clientId, user.id);
    let result: Parameters<Provider["interactionResult"]>[2] = {
      error: "access_denied",
    };
    if (input.approve && allowed) {
      const request = consentRequest(details.params);
      const authorization = await consents.authorize(
        clientId,
        user.id,
        request,
        input.reuse === true,
      );
      const scopes = request.scopes.join(" ");
      const grant = new provider.Grant({ accountId: user.id, clientId });
      grant.jti = authorization.grantId;
      grant.addOIDCScope(
        scopes
          .split(" ")
          .filter((scope) => ["openid", "profile", "email"].includes(scope))
          .join(" "),
      );
      if (authorization.audience)
        grant.addResourceScope(`urn:asmblyr:application:${clientId}`, scopes);
      result = {
        login: { accountId: user.id, remember: false },
        consent: { grantId: await grant.save() },
      };
    }
    const redirectTo = await provider.interactionResult(
      request.raw,
      reply.raw,
      result,
      {
        mergeWithLastSubmission: false,
      },
    );
    return reply
      .header("Cache-Control", "no-store")
      .send({ data: { redirectTo } });
  };
  app.post(path, complete);
  // /oauth/interaction belongs to UI; this separate prefix belongs to Core.
  app.post("/oauth/complete/:uid", complete);
}
