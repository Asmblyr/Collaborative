import type { Knex } from "knex";
import { authenticateAccess, type TokenPair } from "../tokens.js";
import type { SsoProvider } from "./config.js";
import { consumeFlow, findFlow, newProof, saveFlow } from "./flows.js";
import { linkIdentity, loginWithIdentity } from "./identities.js";
import { SsoError, type SsoStart, type SsoCallback } from "./input.js";
import { SsoProtocol } from "./protocol.js";

export type SsoResult =
  | { intent: "link"; returnTo: string }
  | { intent: "login"; returnTo: string; tokens: TokenPair };

export class SsoService {
  constructor(
    readonly providers: SsoProvider[],
    private readonly protocol = new SsoProtocol(),
  ) {}

  private provider(id: string): SsoProvider {
    const provider = this.providers.find((entry) => entry.id === id);
    if (!provider)
      throw new SsoError(
        "SSO_UNKNOWN_PROVIDER",
        "Sign-in provider is not configured",
      );
    return provider;
  }

  async start(db: Knex, id: string, input: SsoStart, authorization?: string) {
    const provider = this.provider(id);
    if (input.uiOrigin !== new URL(provider.callbackUrl).origin) {
      throw new SsoError(
        "SSO_WRONG_ORIGIN",
        "Open the admin interface on its configured AUTH_UI_URL",
      );
    }
    const user =
      input.intent === "link"
        ? await authenticateAccess(db, authorization)
        : undefined;
    const proof = newProof();
    const authorizationUrl = await this.protocol.authorize(provider, proof);
    await saveFlow(db, provider, input, proof, user);
    return { authorizationUrl };
  }

  async complete(
    db: Knex,
    id: string,
    input: SsoCallback,
    authorization?: string,
    userAgent?: string,
  ): Promise<SsoResult> {
    const provider = this.provider(id);
    const pending = await findFlow(db, provider, input);
    if (pending.user_id) {
      // Authenticate before consumption so a BFF can refresh an expired access token once.
      const user = await authenticateAccess(db, authorization);
      if (
        user.id !== pending.user_id ||
        user.sessionId !== pending.session_id
      ) {
        throw new SsoError(
          "SSO_INVALID_FLOW",
          "Return to the account that started linking",
        );
      }
    }
    const flow = await consumeFlow(db, provider, input);
    if (new URLSearchParams(input.query).has("error")) {
      throw new SsoError(
        "SSO_DENIED",
        "Authorization was cancelled by the provider",
      );
    }
    const identity = await this.protocol.verify(
      provider,
      {
        state: input.state,
        codeVerifier: flow.code_verifier,
        nonce: flow.nonce,
      },
      input.query,
    );
    if (flow.user_id && flow.session_id) {
      await linkIdentity(db, flow.user_id, flow.session_id, identity);
      return { intent: "link", returnTo: flow.return_to };
    }
    const tokens = await loginWithIdentity(db, identity, userAgent);
    return { intent: "login", returnTo: flow.return_to, tokens };
  }
}
