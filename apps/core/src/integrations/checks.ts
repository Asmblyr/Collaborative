import { randomUUID } from "node:crypto";
import type {
  IntegrationSection,
  IntegrationValues,
} from "@asmblyr-collaborative/contracts";
import type { SecretCipher } from "../secrets/cipher.js";
import type { IntegrationProviders } from "./providers.js";
import { integrationError } from "./types.js";
import {
  monitoringFromEnv,
  validateMonitoringDsns,
} from "../monitoring/config.js";
import { monitoringDsnsFromEnv } from "../monitoring/dsn.js";

export async function verifyCipher(cipher: SecretCipher) {
  const probe = randomUUID();
  const context = "asmblyr/integration/probe";
  if (
    (await cipher.decrypt(await cipher.encrypt(probe, context), context)) !==
    probe
  ) {
    throw integrationError("integration_connection_failed", 503);
  }
}

export async function checkConnection(
  providers: IntegrationProviders,
  section: IntegrationSection,
  values: IntegrationValues,
  secrets: Record<string, string>,
  environment: boolean,
) {
  if (section === "monitoring") {
    const value = environment
      ? monitoringFromEnv(providers.options.env)
      : values.monitoring;
    const configured = environment
      ? monitoringDsnsFromEnv(providers.options.env)
      : secrets;
    validateMonitoringDsns(value, configured);
    // Validation does not send a synthetic event or spend a Sentry quota.
    return;
  }
  if (section === "google") {
    const value = values.google;
    const secret = environment
      ? providers.options.env.GOOGLE_WORKSPACE_CLIENT_SECRET
      : secrets.clientSecret;
    if (!value.enabled || !value.clientId || !value.redirectUri || !secret) {
      throw integrationError("integration_credentials_missing");
    }
    // Google has no client-secret probe without a user grant. Test local protection only.
    await verifyCipher(providers.cipher(values.encryption));
    return;
  }
  if (section === "encryption") {
    await verifyCipher(providers.cipher(values.encryption));
    return;
  }
  if (section === "assistant") {
    await providers.checkAssistant(values.assistant, secrets, environment);
    return;
  }
  const storage = providers.storage(values.storage, secrets, environment);
  if (!storage?.check) {
    storage?.close?.();
    throw integrationError("integration_disabled", 409);
  }
  try {
    await storage.check();
  } catch {
    throw integrationError("integration_connection_failed", 503);
  } finally {
    storage.close?.();
  }
}
