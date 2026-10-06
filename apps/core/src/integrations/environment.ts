import type {
  IntegrationSection,
  IntegrationValues,
} from "@asmblyr-collaborative/contracts";
import { initialValues } from "./types.js";
import { connectionURL } from "./validation.js";
import {
  monitoringDefaults,
  monitoringFromEnv,
  monitoringEnvironmentNames,
} from "../monitoring/config.js";

const names = {
  monitoring: monitoringEnvironmentNames,
  google: [
    "GOOGLE_WORKSPACE_ENABLED",
    "GOOGLE_WORKSPACE_CLIENT_ID",
    "GOOGLE_WORKSPACE_CLIENT_SECRET",
    "GOOGLE_WORKSPACE_REDIRECT_URI",
  ],
  storage: [
    "FILES_STORAGE",
    "FILES_BUCKET",
    "FILES_S3_REGION",
    "FILES_S3_ENDPOINT",
    "FILES_YC_SERVICE_ACCOUNT_ID",
    "FILES_YC_TOKEN_SOURCE",
    "FILES_YC_TOKEN_FILE",
    "FILES_KUBECONFIG",
    "FILES_K8S_NAMESPACE",
    "FILES_K8S_SERVICE_ACCOUNT",
    "FILES_YC_AUDIENCE",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
    "AWS_PROFILE",
    "AWS_WEB_IDENTITY_TOKEN_FILE",
  ],
  assistant: [
    "ASSISTANT_ENABLED",
    "OPENAI_API_KEY",
    "OPENAI_API_BASE_URL",
    "OPENAI_API_MODEL",
    "OPENAI_API_MODE",
    "OPENAI_API_MODEL_EFFORT",
    "OPENAI_API_MODEL_THINKING",
    "OPENAI_API_TIMEOUT_MS",
    "OPENAI_API_MAX_OUTPUT_TOKENS",
  ],
  encryption: [
    "SECRETS_PROVIDER",
    "SECRETS_YC_KMS_KEY_ID",
    "SECRETS_YC_SERVICE_ACCOUNT_ID",
  ],
};

export function environmentLocked(
  env: NodeJS.ProcessEnv,
  section: IntegrationSection,
) {
  return names[section].some((name) => Boolean(env[name]?.trim()));
}
function safeURL(value: string | undefined, fallback: string) {
  try {
    return connectionURL(value ?? fallback);
  } catch {
    return "";
  }
}
export function environmentValues(env: NodeJS.ProcessEnv): IntegrationValues {
  let monitoring = monitoringDefaults;
  try {
    monitoring = monitoringFromEnv(env);
  } catch {
    // Invalid optional monitoring never disables unrelated integrations.
  }
  const baseURL = safeURL(
    env.OPENAI_API_BASE_URL,
    initialValues.assistant.baseURL,
  );
  const defaultApi =
    baseURL && new URL(baseURL).hostname === "api.openai.com"
      ? "responses"
      : "chat-completions";
  let api: IntegrationValues["assistant"]["api"] = defaultApi;
  if (env.OPENAI_API_MODE?.trim()) {
    api =
      env.OPENAI_API_MODE === "chat-completions"
        ? "chat-completions"
        : "responses";
  }
  return {
    monitoring,
    google: {
      enabled: env.GOOGLE_WORKSPACE_ENABLED === "true",
      clientId: env.GOOGLE_WORKSPACE_CLIENT_ID ?? "",
      redirectUri: safeURL(env.GOOGLE_WORKSPACE_REDIRECT_URI, ""),
    },
    storage: {
      enabled: Boolean(env.FILES_STORAGE && env.FILES_STORAGE !== "disabled"),
      provider: env.FILES_STORAGE === "yandex" ? "yandex" : "s3",
      bucket: env.FILES_BUCKET ?? "",
      region: env.FILES_S3_REGION ?? "",
      endpoint: safeURL(env.FILES_S3_ENDPOINT, ""),
      serviceAccountId: env.FILES_YC_SERVICE_ACCOUNT_ID ?? "",
    },
    assistant: {
      enabled: env.ASSISTANT_ENABLED !== "false" && Boolean(env.OPENAI_API_KEY),
      baseURL,
      model: env.OPENAI_API_MODEL ?? "",
      api,
      timeoutMs: Number(env.OPENAI_API_TIMEOUT_MS ?? 120000),
      maxOutputTokens: Number(env.OPENAI_API_MAX_OUTPUT_TOKENS ?? 4096),
      effort: (env.OPENAI_API_MODEL_EFFORT ??
        "") as IntegrationValues["assistant"]["effort"],
      thinking:
        env.OPENAI_API_MODEL_THINKING === undefined
          ? null
          : env.OPENAI_API_MODEL_THINKING === "true",
    },
    encryption: {
      provider: env.SECRETS_PROVIDER === "yandex-kms" ? "yandex-kms" : "local",
      keyId: env.SECRETS_YC_KMS_KEY_ID ?? "",
      serviceAccountId: env.SECRETS_YC_SERVICE_ACCOUNT_ID ?? "",
    },
  };
}
