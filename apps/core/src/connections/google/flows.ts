import { randomBytes, randomUUID } from "node:crypto";
import type { Access } from "../../permissions/access.js";
import { objectInput, textInput } from "../../shared/input.js";
import { integrationError } from "../../integrations/types.js";
import { withConnectionVault } from "../vault.js";
import {
  hash,
  requiredScopes,
  type GoogleConnections,
  type ConnectionRow,
} from "./connections.js";
import type { OAuthProof, GoogleTokens } from "./protocol.js";

interface FlowRow {
  id: string;
  owner_id: string;
  state_hash: string;
  browser_hash: string;
  configuration: string;
  expires_at: Date;
  consumed_at: Date | null;
}
const random = () => randomBytes(32).toString("base64url");
const invalidFlow = () => integrationError("connection_invalid_flow", 400);

export async function startGoogleFlow(
  service: GoogleConnections,
  owner: string,
) {
  const proof: OAuthProof = {
    state: random(),
    nonce: random(),
    codeVerifier: random(),
  };
  const browserToken = random();
  const url = await withConnectionVault(service.settings, async (vault) => {
    const config = await service.config(vault);
    const previous = await vault
      .db("asmblyr_connection_flows")
      .where({ owner_id: owner })
      .pluck("id");
    for (const id of previous) {
      await vault.remove(id, owner);
    }
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + 600000);
    await vault.write(id, owner, proof, expiresAt);
    await vault.db("asmblyr_connection_flows").insert({
      id,
      owner_id: owner,
      state_hash: hash(proof.state),
      browser_hash: hash(browserToken),
      configuration: config.fingerprint,
      expires_at: expiresAt,
    });
    return service.protocol.authorize(config, proof);
  });
  return { url, browserToken };
}

export async function finishGoogleFlow(
  service: GoogleConnections,
  access: Access,
  input: unknown,
  reauthorize: () => Promise<Access>,
) {
  const body = objectInput(input, ["browserToken", "query"]);
  const browser = textInput(body.browserToken, 128);
  const query = textInput(body.query, 12000);
  const params = new URLSearchParams(query);
  const state = params.get("state");
  if (
    !state ||
    params.getAll("state").length !== 1 ||
    params.getAll("code").length !== 1
  ) {
    throw invalidFlow();
  }
  const owner = access.principal.id;
  const claimed = await withConnectionVault(service.settings, async (vault) => {
    const flow = await vault
      .db<FlowRow>("asmblyr_connection_flows")
      .where({ state_hash: hash(state), owner_id: owner })
      .first();
    if (
      !flow ||
      flow.consumed_at ||
      flow.browser_hash !== hash(browser) ||
      flow.expires_at.getTime() < Date.now()
    ) {
      throw invalidFlow();
    }
    const config = await service.config(vault);
    if (flow.configuration !== config.fingerprint) {
      throw invalidFlow();
    }
    const proof = await vault.read<OAuthProof>(flow.id, owner);
    await vault
      .db("asmblyr_connection_flows")
      .where({ id: flow.id })
      .update({ consumed_at: new Date() });
    return { proof, config, flowId: flow.id };
  });
  let grant;
  try {
    grant = await service.protocol.exchange(
      claimed.config,
      claimed.proof,
      query,
    );
  } catch {
    throw integrationError("connection_authorization_failed", 400);
  }
  if (
    requiredScopes.some((scope) => !grant.scopes.includes(scope)) ||
    !grant.subject ||
    grant.subject.length > 512 ||
    grant.email.length > 320
  ) {
    throw integrationError("connection_scopes_missing", 400);
  }
  const latest = await reauthorize();
  if (latest.principal.kind !== "user" || latest.principal.id !== owner) {
    throw invalidFlow();
  }
  await withConnectionVault(service.settings, async (vault) => {
    const flow = await vault
      .db<FlowRow>("asmblyr_connection_flows")
      .where({ id: claimed.flowId, owner_id: owner })
      .first();
    if (!flow || !flow.consumed_at || flow.expires_at.getTime() < Date.now()) {
      throw invalidFlow();
    }
    if (
      (await service.config(vault)).fingerprint !== claimed.config.fingerprint
    ) {
      throw invalidFlow();
    }
    const previous = await vault
      .db<ConnectionRow>("asmblyr_connections")
      .where({ owner_id: owner, provider: "google" })
      .first();
    if (
      !grant.refreshToken &&
      previous?.subject === grant.subject &&
      previous.configuration === claimed.config.fingerprint
    ) {
      grant.refreshToken = (
        await vault.read<GoogleTokens>(previous.id, owner)
      ).refreshToken;
    }
    if (!grant.refreshToken) {
      throw integrationError("connection_offline_access_missing", 400);
    }
    const id = randomUUID();
    if (previous) {
      const writes = await vault
        .db("asmblyr_connection_writes")
        .where({ connection_id: previous.id })
        .pluck("id");
      for (const write of writes) {
        await vault.remove(write, owner);
      }
      await vault.remove(previous.id, owner);
    }
    await vault.write(id, owner, {
      accessToken: grant.accessToken,
      refreshToken: grant.refreshToken,
      expiresAt: grant.expiresAt,
      scopes: grant.scopes,
    });
    await vault.db("asmblyr_connections").insert({
      id,
      owner_id: owner,
      provider: "google",
      subject: grant.subject,
      email: grant.email,
      configuration: claimed.config.fingerprint,
      scopes: JSON.stringify(grant.scopes),
    });
    await vault.remove(claimed.flowId, owner);
  });
  return service.status(owner);
}
