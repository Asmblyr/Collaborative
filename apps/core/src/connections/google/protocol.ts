import * as oidc from "openid-client";
import type { GoogleConnection } from "@asmblyr-collaborative/contracts";

export const googleScopes = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/spreadsheets",
];
export interface GoogleConfig extends GoogleConnection {
  clientSecret: string;
  fingerprint: string;
}
export interface OAuthProof {
  state: string;
  codeVerifier: string;
  nonce: string;
}
export interface GoogleTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes: string[];
}
export interface GoogleGrant extends GoogleTokens {
  subject: string;
  email: string;
}
export interface GoogleOAuthProtocol {
  authorize(config: GoogleConfig, proof: OAuthProof): Promise<string>;
  exchange(
    config: GoogleConfig,
    proof: OAuthProof,
    query: string,
  ): Promise<GoogleGrant>;
  refresh(config: GoogleConfig, tokens: GoogleTokens): Promise<GoogleTokens>;
  revoke(token: string): Promise<void>;
}
export class GoogleProtocol implements GoogleOAuthProtocol {
  constructor(private readonly transport: typeof fetch = fetch) {}
  private configuration(config: GoogleConfig) {
    const client = new oidc.Configuration(
      {
        issuer: "https://accounts.google.com",
        authorization_endpoint: "https://accounts.google.com/o/oauth2/v2/auth",
        token_endpoint: "https://oauth2.googleapis.com/token",
        userinfo_endpoint: "https://openidconnect.googleapis.com/v1/userinfo",
        jwks_uri: "https://www.googleapis.com/oauth2/v3/certs",
      },
      config.clientId,
      undefined,
      oidc.ClientSecretPost(config.clientSecret),
    );
    client[oidc.customFetch] = this.transport;
    client.timeout = 8;
    oidc.enableNonRepudiationChecks(client);
    return client;
  }
  async authorize(config: GoogleConfig, proof: OAuthProof) {
    return oidc.buildAuthorizationUrl(this.configuration(config), {
      redirect_uri: config.redirectUri,
      response_type: "code",
      scope: googleScopes.join(" "),
      state: proof.state,
      nonce: proof.nonce,
      code_challenge: await oidc.calculatePKCECodeChallenge(proof.codeVerifier),
      code_challenge_method: "S256",
      access_type: "offline",
      prompt: "consent",
    }).href;
  }
  async exchange(
    config: GoogleConfig,
    proof: OAuthProof,
    query: string,
  ): Promise<GoogleGrant> {
    const client = this.configuration(config);
    const callback = new URL(config.redirectUri);
    callback.search = query;
    const tokens = await oidc.authorizationCodeGrant(client, callback, {
      expectedState: proof.state,
      expectedNonce: proof.nonce,
      pkceCodeVerifier: proof.codeVerifier,
      idTokenExpected: true,
    });
    const subject = tokens.claims()?.sub;
    if (!subject) {
      throw new Error("Missing Google subject");
    }
    const profile = await oidc.fetchUserInfo(
      client,
      tokens.access_token,
      subject,
    );
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? "",
      expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
      scopes: (tokens.scope ?? "").split(" "),
      subject,
      email: typeof profile.email === "string" ? profile.email : "",
    };
  }
  async refresh(
    config: GoogleConfig,
    previous: GoogleTokens,
  ): Promise<GoogleTokens> {
    const tokens = await oidc.refreshTokenGrant(
      this.configuration(config),
      previous.refreshToken,
    );
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? previous.refreshToken,
      expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
      scopes: tokens.scope ? tokens.scope.split(" ") : previous.scopes,
    };
  }
  async revoke(token: string) {
    const response = await this.transport(
      "https://oauth2.googleapis.com/revoke",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }),
        redirect: "error",
        signal: AbortSignal.timeout(8000),
      },
    );
    await response.body?.cancel();
    if (!response.ok) {
      throw new Error("Google revocation failed");
    }
  }
}
