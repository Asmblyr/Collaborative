interface ProviderSettings {
  id: string;
  label: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
  clientAuth: "client_secret_basic" | "client_secret_post";
  callbackUrl: string;
  scope: string;
}

export type SsoProvider = ProviderSettings &
  (
    | { driver: "openid" }
    | {
        driver: "oauth2";
        authorizeUrl: string;
        tokenUrl: string;
        profileUrl: string;
        identifierKey: string;
      }
  );

export function providerKey(value: string): boolean {
  return /^[a-z][a-z0-9_]{0,47}$/.test(value);
}

function endpoint(value: string, name: string, allowLocal = false): string {
  const url = new URL(value);
  const local =
    allowLocal && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.hash ||
    url.search
  ) {
    throw new Error(
      `${name} must be an HTTPS URL without credentials, query or fragment`,
    );
  }
  return url.href;
}

export function ssoFromEnv(env: NodeJS.ProcessEnv): SsoProvider[] {
  if (!env.AUTH_PROVIDERS?.trim()) return [];
  const ids = env.AUTH_PROVIDERS.split(",").map((id) => id.trim());
  if (ids.some((id) => !providerKey(id)) || new Set(ids).size !== ids.length) {
    throw new Error(
      "AUTH_PROVIDERS requires unique lowercase provider keys (letters, digits, underscore)",
    );
  }
  const ui = new URL(endpoint(env.AUTH_UI_URL ?? "", "AUTH_UI_URL", true));
  if (ui.pathname !== "/")
    throw new Error("AUTH_UI_URL must be an origin without a path");

  return ids.map((id) => {
    const prefix = `AUTH_${id.toUpperCase()}_`;
    function required(key: string): string {
      const value = env[prefix + key]?.trim();
      if (!value) throw new Error(`${prefix}${key} is required`);
      return value;
    }
    const driver = required("DRIVER");
    if (driver !== "openid" && driver !== "oauth2") {
      throw new Error(`${prefix}DRIVER must be openid or oauth2`);
    }
    const clientAuth =
      env[prefix + "CLIENT_AUTH_METHOD"] ?? "client_secret_basic";
    if (
      clientAuth !== "client_secret_basic" &&
      clientAuth !== "client_secret_post"
    ) {
      throw new Error(
        `${prefix}CLIENT_AUTH_METHOD must be client_secret_basic or client_secret_post`,
      );
    }
    const issuer = endpoint(required("ISSUER_URL"), prefix + "ISSUER_URL");
    if (new URL(issuer).pathname.includes("/.well-known/")) {
      throw new Error(
        `${prefix}ISSUER_URL must contain the issuer, not the discovery document URL`,
      );
    }
    // Preserve the configured issuer's exact spelling, including its trailing slash.
    const scope =
      env[prefix + "SCOPE"]?.trim() ??
      (driver === "openid" ? "openid profile email" : "");
    if (driver === "openid" && !scope.split(/\s+/).includes("openid")) {
      throw new Error(`${prefix}SCOPE must include openid`);
    }
    const settings: ProviderSettings = {
      id,
      clientAuth,
      scope,
      label: env[prefix + "LABEL"]?.trim() || id,
      issuer: required("ISSUER_URL"),
      clientId: required("CLIENT_ID"),
      clientSecret: required("CLIENT_SECRET"),
      callbackUrl: new URL(`/sign/sso/${id}/callback`, ui).href,
    };
    if (driver === "oauth2") {
      const identifierKey = env[prefix + "IDENTIFIER_KEY"]?.trim() || "id";
      if (
        !/^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$/.test(
          identifierKey,
        )
      ) {
        throw new Error(`${prefix}IDENTIFIER_KEY must be a JSON property path`);
      }
      return {
        ...settings,
        driver,
        identifierKey,
        authorizeUrl: endpoint(
          required("AUTHORIZE_URL"),
          prefix + "AUTHORIZE_URL",
        ),
        tokenUrl: endpoint(required("ACCESS_URL"), prefix + "ACCESS_URL"),
        profileUrl: endpoint(required("PROFILE_URL"), prefix + "PROFILE_URL"),
      };
    }
    return { ...settings, driver };
  });
}
