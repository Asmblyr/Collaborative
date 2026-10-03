import * as oidc from "openid-client";
import type { SsoProvider } from "./config.js";
import { SsoError } from "./input.js";
import { ssoDiagnostic, type SsoDiagnostic } from "./diagnostics.js";

export interface AuthorizationProof {
  state: string;
  codeVerifier: string;
  nonce: string;
}

export interface ExternalIdentity {
  provider: string;
  issuer: string;
  subject: string;
}

function profileSubject(profile: unknown, key: string): string {
  let value: unknown = profile;
  for (const part of key.split(".")) {
    if (!value || typeof value !== "object" || !Object.hasOwn(value, part)) {
      throw new Error("Missing stable profile identifier");
    }
    value = (value as Record<string, unknown>)[part];
  }
  if (typeof value === "number" && Number.isSafeInteger(value))
    value = String(value);
  if (
    typeof value !== "string" ||
    !value.length ||
    value.length > 512 ||
    /[\u0000-\u001f]/.test(value)
  ) {
    throw new Error("Invalid stable profile identifier");
  }
  return value;
}

export class SsoProtocol {
  private readonly configurations = new Map<
    string,
    Promise<oidc.Configuration>
  >();

  constructor(
    private readonly transport?: typeof fetch,
    private readonly reportFailure?: (diagnostic: SsoDiagnostic) => void,
  ) {}

  private async configuration(
    provider: SsoProvider,
  ): Promise<oidc.Configuration> {
    let pending = this.configurations.get(provider.id);
    if (!pending) {
      pending = this.configure(provider);
      this.configurations.set(provider.id, pending);
      pending.catch(() => this.configurations.delete(provider.id));
    }
    return pending;
  }

  private async configure(provider: SsoProvider): Promise<oidc.Configuration> {
    const authenticate =
      provider.clientAuth === "client_secret_post"
        ? oidc.ClientSecretPost(provider.clientSecret)
        : oidc.ClientSecretBasic(provider.clientSecret);
    let configuration: oidc.Configuration;
    if (provider.driver === "openid") {
      configuration = await oidc.discovery(
        new URL(provider.issuer),
        provider.clientId,
        undefined,
        authenticate,
        {
          timeout: 10,
          ...(this.transport ? { [oidc.customFetch]: this.transport } : {}),
        },
      );
      if (configuration.serverMetadata().issuer !== provider.issuer)
        throw new Error("Issuer mismatch");
      oidc.enableNonRepudiationChecks(configuration);
    } else {
      configuration = new oidc.Configuration(
        {
          issuer: provider.issuer,
          authorization_endpoint: provider.authorizeUrl,
          token_endpoint: provider.tokenUrl,
        },
        provider.clientId,
        undefined,
        authenticate,
      );
      if (this.transport) configuration[oidc.customFetch] = this.transport;
    }
    configuration.timeout = 10;
    const metadata = configuration.serverMetadata();
    for (const value of [
      metadata.authorization_endpoint,
      metadata.token_endpoint,
      metadata.jwks_uri,
    ]) {
      if (value && new URL(value).protocol !== "https:")
        throw new Error("Insecure provider endpoint");
    }
    return configuration;
  }

  async authorize(
    provider: SsoProvider,
    proof: AuthorizationProof,
  ): Promise<string> {
    try {
      const configuration = await this.configuration(provider);
      const params: Record<string, string> = {
        redirect_uri: provider.callbackUrl,
        response_type: "code",
        response_mode: "query",
        scope: provider.scope,
        state: proof.state,
        code_challenge: await oidc.calculatePKCECodeChallenge(
          proof.codeVerifier,
        ),
        code_challenge_method: "S256",
      };
      if (provider.driver === "openid") params.nonce = proof.nonce;
      return oidc.buildAuthorizationUrl(configuration, params).href;
    } catch (error) {
      this.reportFailure?.(ssoDiagnostic(provider.id, "authorize", error));
      throw new SsoError(
        "SSO_PROVIDER_UNAVAILABLE",
        "Unable to contact the sign-in provider",
      );
    }
  }

  async verify(
    provider: SsoProvider,
    proof: AuthorizationProof,
    query: string,
  ): Promise<ExternalIdentity> {
    try {
      const configuration = await this.configuration(provider);
      const callback = new URL(provider.callbackUrl);
      callback.search = query;
      const tokens = await oidc.authorizationCodeGrant(
        configuration,
        callback,
        {
          pkceCodeVerifier: proof.codeVerifier,
          expectedState: proof.state,
          ...(provider.driver === "openid"
            ? { expectedNonce: proof.nonce, idTokenExpected: true }
            : {}),
        },
      );
      let subject: string;
      if (provider.driver === "openid") {
        subject = profileSubject(tokens.claims(), "sub");
      } else {
        const response = await (this.transport ?? fetch)(provider.profileUrl, {
          headers: {
            authorization: `Bearer ${tokens.access_token}`,
            accept: "application/json",
          },
          signal: AbortSignal.timeout(10_000),
          redirect: "error",
        });
        if (!response.ok) throw new Error("Profile request failed");
        subject = profileSubject(await response.json(), provider.identifierKey);
      }
      return { provider: provider.id, issuer: provider.issuer, subject };
    } catch (error) {
      this.reportFailure?.(ssoDiagnostic(provider.id, "verify", error));
      // Do not forward upstream errors: they can contain codes, tokens or profile data.
      throw new SsoError(
        "SSO_AUTH_FAILED",
        "Provider authorization could not be verified",
      );
    }
  }
}
