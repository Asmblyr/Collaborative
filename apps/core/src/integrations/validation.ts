import type {
  IntegrationSection,
  IntegrationUpdate,
  IntegrationValues,
} from "@asmblyr-collaborative/contracts";
import { objectInput, textInput } from "../shared/input.js";
import { assistantConfigFromEnv } from "../assistant/config.js";
import { integrationError } from "./types.js";
import { monitoringValue, validateSentryDsn } from "../monitoring/config.js";

export const secretNames = {
  monitoring: ["serverDsn", "browserDsn"],
  google: ["clientSecret"],
  storage: ["accessKeyId", "secretAccessKey", "sessionToken"],
  assistant: ["apiKey"],
  encryption: [],
} as const;

export function sectionInput(value: string): IntegrationSection {
  if (
    value !== "storage" &&
    value !== "assistant" &&
    value !== "encryption" &&
    value !== "google" &&
    value !== "monitoring"
  ) {
    throw integrationError("integration_section_invalid");
  }
  return value;
}

export function connectionURL(value: string): string {
  if (!value) {
    return "";
  }
  try {
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.protocol !== "https:" &&
        !(
          url.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
        ))
    ) {
      throw integrationError("integration_url_invalid");
    }
    return value;
  } catch {
    throw integrationError("integration_url_invalid");
  }
}

function bool(value: unknown) {
  if (typeof value !== "boolean") {
    throw integrationError("integration_value_invalid");
  }
  return value;
}
function identifier(value: unknown, allowEmpty = true) {
  const result = textInput(value, 120, allowEmpty);
  if (result && !/^[A-Za-z0-9_.:-]+$/.test(result)) {
    throw integrationError("integration_value_invalid");
  }
  return result;
}
function number(value: unknown, min: number, max: number) {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    throw integrationError("integration_value_invalid");
  }
  return value;
}

export function assistantEnvironment(
  value: IntegrationValues["assistant"],
  apiKey: string,
): NodeJS.ProcessEnv {
  return {
    OPENAI_API_KEY: apiKey,
    OPENAI_API_BASE_URL: value.baseURL,
    OPENAI_API_MODEL: value.model,
    OPENAI_API_MODE: value.api,
    OPENAI_API_TIMEOUT_MS: String(value.timeoutMs),
    OPENAI_API_MAX_OUTPUT_TOKENS: String(value.maxOutputTokens),
    OPENAI_API_MODEL_EFFORT: value.effort || undefined,
    OPENAI_API_MODEL_THINKING:
      value.thinking === null ? undefined : String(value.thinking),
  };
}

export function valueInput(
  section: IntegrationSection,
  input: unknown,
): IntegrationValues[IntegrationSection] {
  if (section === "monitoring") {
    return monitoringValue(input);
  }
  if (section === "google") {
    const value = objectInput(input, ["enabled", "clientId", "redirectUri"]);
    const result = {
      enabled: bool(value.enabled),
      clientId: textInput(value.clientId, 256, true),
      redirectUri: connectionURL(textInput(value.redirectUri, 2048, true)),
    };
    if (
      result.enabled &&
      (!result.clientId ||
        !result.redirectUri ||
        new URL(result.redirectUri).pathname !== "/connections/google/callback")
    ) {
      throw integrationError("integration_value_invalid");
    }
    return result;
  }
  if (section === "storage") {
    const value = objectInput(input, [
      "enabled",
      "provider",
      "bucket",
      "region",
      "endpoint",
      "serviceAccountId",
    ]);
    if (value.provider !== "s3" && value.provider !== "yandex") {
      throw integrationError("integration_value_invalid");
    }
    const result: IntegrationValues["storage"] = {
      enabled: bool(value.enabled),
      provider: value.provider,
      bucket: textInput(value.bucket, 63, true),
      region: identifier(value.region),
      endpoint: connectionURL(textInput(value.endpoint, 2048, true)),
      serviceAccountId: identifier(value.serviceAccountId),
    };
    if (
      (result.bucket &&
        !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(result.bucket)) ||
      (result.enabled &&
        (!result.bucket ||
          (result.provider === "s3"
            ? !result.region
            : !result.serviceAccountId)))
    ) {
      throw integrationError("integration_value_invalid");
    }
    return result;
  }
  if (section === "encryption") {
    const value = objectInput(input, ["provider", "keyId", "serviceAccountId"]);
    if (value.provider !== "local" && value.provider !== "yandex-kms") {
      throw integrationError("integration_value_invalid");
    }
    const result: IntegrationValues["encryption"] = {
      provider: value.provider,
      keyId: identifier(value.keyId),
      serviceAccountId: identifier(value.serviceAccountId),
    };
    if (
      result.provider === "yandex-kms" &&
      (!result.keyId || !result.serviceAccountId)
    ) {
      throw integrationError("integration_value_invalid");
    }
    return result;
  }
  const value = objectInput(input, [
    "enabled",
    "baseURL",
    "model",
    "api",
    "timeoutMs",
    "maxOutputTokens",
    "effort",
    "thinking",
  ]);
  if (
    (value.api !== "responses" && value.api !== "chat-completions") ||
    !["", "low", "medium", "high", "max"].includes(String(value.effort)) ||
    (value.thinking !== null && typeof value.thinking !== "boolean")
  ) {
    throw integrationError("integration_value_invalid");
  }
  const result: IntegrationValues["assistant"] = {
    enabled: bool(value.enabled),
    baseURL: connectionURL(textInput(value.baseURL, 2048, true)),
    model: textInput(value.model, 120, true),
    api: value.api,
    timeoutMs: number(value.timeoutMs, 1000, 120000),
    maxOutputTokens: number(value.maxOutputTokens, 128, 16384),
    effort: value.effort as IntegrationValues["assistant"]["effort"],
    thinking: value.thinking as boolean | null,
  };
  if (result.enabled || result.model) {
    try {
      assistantConfigFromEnv(
        assistantEnvironment(result, "validation-placeholder"),
      );
    } catch {
      throw integrationError("integration_value_invalid");
    }
  }
  if (result.enabled && !result.baseURL) {
    throw integrationError("integration_value_invalid");
  }
  return result;
}

export function updateInput(
  section: IntegrationSection,
  input: unknown,
): IntegrationUpdate {
  const object = objectInput(input, ["revision", "value", "secrets"]);
  const revision = textInput(object.revision, 36);
  if (!/^[a-f0-9-]{36}$/i.test(revision)) {
    throw integrationError("integration_revision_invalid");
  }
  const secrets =
    object.secrets === undefined
      ? {}
      : objectInput(object.secrets, [
          ...secretNames[section],
          ...(section === "monitoring" ? ["dsn"] : []),
        ]);
  if (
    section === "monitoring" &&
    Object.hasOwn(secrets, "dsn") &&
    Object.keys(secrets).length > 1
  ) {
    throw integrationError("integration_secret_invalid");
  }
  for (const value of Object.values(secrets)) {
    if (
      value !== null &&
      (typeof value !== "string" ||
        !value.trim() ||
        Buffer.byteLength(value) > 8000 ||
        /[\r\n\u0000]/.test(value))
    ) {
      throw integrationError("integration_secret_invalid");
    }
  }
  if (section === "monitoring") {
    for (const value of Object.values(secrets)) {
      if (typeof value === "string") {
        validateSentryDsn(value);
      }
    }
  }
  return {
    revision,
    value: valueInput(section, object.value),
    secrets,
  } as IntegrationUpdate;
}
