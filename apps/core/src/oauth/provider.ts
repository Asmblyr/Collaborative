import type { Knex } from "knex";
import { Provider, errors, interactionPolicy } from "oidc-provider";
import type { OAuthConfig } from "./config.js";
import { OAuthCipher } from "./crypto.js";
import { OAuthApplications } from "./applications.js";
import { oauthAdapter } from "./adapter.js";

export function createOAuthProvider(db: Knex, config: OAuthConfig) {
  const applications = new OAuthApplications(
    db,
    new OAuthCipher(config.storageKey),
  );
  const policy = interactionPolicy.base();
  policy
    .get("login")!
    .checks.add(
      new interactionPolicy.Check(
        "asmblyr_session",
        "Sign in with your current Asmblyr account",
        "login_required",
        (ctx) => !ctx.oidc.result?.login,
      ),
    );
  const provider = new Provider(config.issuer, {
    adapter: oauthAdapter(db, new OAuthCipher(config.storageKey), applications),
    jwks: config.jwks,
    cookies: {
      keys: config.cookieKeys,
      names: {
        session: "asmblyr_oidc_session",
        interaction: "asmblyr_oidc_interaction",
        resume: "asmblyr_oidc_resume",
      },
      short: { httpOnly: true, sameSite: "lax" },
      long: { httpOnly: true, sameSite: "lax" },
    },
    claims: { openid: ["sub"], email: ["email"], profile: ["name", "picture"] },
    scopes: ["openid", "profile", "email"],
    responseTypes: ["code"],
    clientAuthMethods: ["none", "client_secret_basic"],
    pkce: { required: () => true },
    clientBasedCORS: () => false,
    features: {
      devInteractions: { enabled: false },
      revocation: { enabled: true },
      resourceIndicators: {
        enabled: true,
        defaultResource: async (ctx, client) => {
          const app = await applications.row(client.clientId);
          if (!app?.audience) return undefined;
          if (
            ctx.oidc.params?.audience &&
            ctx.oidc.params.audience !== app.audience
          )
            throw new errors.InvalidTarget();
          return `urn:asmblyr:application:${app.id}`;
        },
        useGrantedResource: () => true,
        getResourceServerInfo: async (ctx, resource, client) => {
          const app = await applications.row(client.clientId);
          if (
            !app?.enabled ||
            !app.audience ||
            resource !== `urn:asmblyr:application:${app.id}`
          )
            throw new errors.InvalidTarget();
          const scopes = ["openid", "profile", "email", ...app.scopes];
          const requested = String(ctx.oidc.params?.scope ?? "")
            .split(" ")
            .filter(Boolean);
          if (requested.some((scope) => !scopes.includes(scope))) {
            throw new errors.InvalidScope(
              "Scope is not allowed for this application",
              scopes.join(" "),
            );
          }
          return {
            scope: scopes.join(" "),
            audience: app.audience,
            accessTokenTTL: 300,
            accessTokenFormat: "jwt",
            jwt: { sign: { alg: "RS256" } },
          };
        },
      },
    },
    extraParams: ["audience"],
    extraTokenClaims: async (ctx, token) => {
      if (
        !("accountId" in token) ||
        !token.accountId ||
        !token.clientId ||
        !(await applications.allowed(token.clientId, token.accountId))
      )
        throw new errors.AccessDenied();
      const account = ctx.oidc.account;
      return account
        ? account.claims("access_token", "openid profile email", {}, [])
        : undefined;
    },
    interactions: {
      policy,
      url: (_ctx, interaction) =>
        `${config.issuer}/interaction/${interaction.uid}`,
    },
    findAccount: async (ctx, id) => {
      const clientId = ctx.oidc.client?.clientId;
      if (!clientId || !(await applications.allowed(clientId, id)))
        return undefined;
      const user = await db("public.asmblyr_users")
        .where({ id, status: "active" })
        .first("id", "email", "display_name", "picture_url");
      if (!user) return undefined;
      return {
        accountId: user.id,
        claims: () => ({
          sub: user.id,
          email: user.email,
          ...(user.display_name ? { name: user.display_name } : {}),
          ...(user.picture_url ? { picture: user.picture_url } : {}),
        }),
      };
    },
    ttl: {
      AccessToken: 300,
      AuthorizationCode: 60,
      IdToken: 300,
      Interaction: 600,
      Session: 600,
      Grant: 600,
    },
    renderError: async (ctx) => {
      ctx.type = "text/html";
      ctx.body =
        '<!doctype html><html lang="ru"><meta charset="utf-8"><title>Не удалось войти</title><body><h1>Не удалось войти в приложение</h1><p>Запрос недействителен или срок входа истёк. Вернитесь в приложение и повторите вход.</p></body></html>';
    },
  });
  provider.proxy = true;
  return { provider, applications };
}
