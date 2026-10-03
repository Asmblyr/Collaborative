import { readFile } from "node:fs/promises";
import type { Configuration } from "oidc-provider";

export interface OAuthConfig {
  issuer: string;
  jwks: NonNullable<Configuration["jwks"]>;
  cookieKeys: string[];
  storageKey: string;
}

export async function oauthFromEnv(
  env: NodeJS.ProcessEnv,
): Promise<OAuthConfig | undefined> {
  if (!env.OAUTH_ISSUER_URL) return undefined;
  const url = new URL(env.OAUTH_ISSUER_URL);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    url.pathname !== "/oauth" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "OAUTH_ISSUER_URL must be an HTTPS URL ending in /oauth (HTTP only on localhost)",
    );
  }
  if (!env.OAUTH_KEYS_FILE) throw new Error("OAUTH_KEYS_FILE is required");
  const keys = JSON.parse(await readFile(env.OAUTH_KEYS_FILE, "utf8"));
  if (
    !keys.jwks?.keys?.length ||
    !keys.cookieKeys?.length ||
    !keys.cookieKeys.every(
      (key: unknown) => typeof key === "string" && key.length >= 43,
    ) ||
    typeof keys.storageKey !== "string" ||
    Buffer.from(keys.storageKey, "base64url").length !== 32
  ) {
    throw new Error("Invalid OAuth key file");
  }
  return {
    issuer: url.toString(),
    jwks: keys.jwks,
    cookieKeys: keys.cookieKeys,
    storageKey: keys.storageKey,
  };
}
