import type {
  EncryptionConnection,
  StorageConnection,
  AssistantConnection,
} from "@asmblyr-collaborative/contracts";
import { yandexTokenProvider } from "../cloud/yandex-identity.js";
import {
  localCipher,
  SecretError,
  type SecretCipher,
} from "../secrets/cipher.js";
import { yandexKmsCipher } from "../secrets/yandex-kms.js";
import { s3Storage } from "../files/storage/s3.js";
import { yandexStorage } from "../files/storage/yandex.js";
import { storageFromEnv } from "../files/storage/config.js";
import type { FileStorage } from "../files/storage/types.js";
import { assistantConfigFromEnv } from "../assistant/config.js";
import { AssistantService } from "../assistant/service.js";
import { assistantEnvironment } from "./validation.js";
import { integrationError } from "./types.js";

export interface IntegrationOptions {
  env: NodeJS.ProcessEnv;
  /** Trusted host-side adapters, also used for offline integration tests. */
  cipher?: (value: EncryptionConnection) => SecretCipher;
  storage?: (
    value: StorageConnection,
    secrets: Record<string, string>,
  ) => FileStorage;
  assistant?: (value: AssistantConnection, apiKey: string) => AssistantService;
  exchange?: typeof fetch;
}

export function storageLocation(value: StorageConnection) {
  return value.provider === "yandex"
    ? `yandex:${value.bucket}`
    : `s3:${value.endpoint || value.region}:${value.bucket}`;
}

export class IntegrationProviders {
  private readonly ciphers = new Map<string, SecretCipher>();
  constructor(readonly options: IntegrationOptions) {}

  cipher(value: EncryptionConnection) {
    const provider = this.options.env.SECRETS_PROVIDER?.trim();
    if (
      !provider &&
      (this.options.env.SECRETS_YC_KMS_KEY_ID?.trim() ||
        this.options.env.SECRETS_YC_SERVICE_ACCOUNT_ID?.trim())
    ) {
      throw integrationError("integration_configuration_invalid", 503);
    }
    if (
      Boolean(this.options.env.SECRETS_PROVIDER?.trim()) &&
      !["local", "yandex-kms"].includes(this.options.env.SECRETS_PROVIDER ?? "")
    ) {
      throw integrationError("integration_configuration_invalid", 503);
    }
    const id = JSON.stringify(value);
    let cipher = this.ciphers.get(id);
    if (!cipher) {
      if (this.options.cipher) {
        cipher = this.options.cipher(value);
      } else if (value.provider === "local") {
        cipher = localCipher(this.options.env.SECRETS_LOCAL_KEY);
      } else {
        const tokenFile =
          this.options.env.YC_OIDC_TOKEN_FILE ??
          this.options.env.FILES_YC_TOKEN_FILE;
        if (!tokenFile || !value.keyId || !value.serviceAccountId) {
          throw new SecretError();
        }
        cipher = yandexKmsCipher(
          value.keyId,
          yandexTokenProvider(
            { serviceAccountId: value.serviceAccountId, tokenFile },
            this.options.exchange,
          ),
          this.options.exchange,
        );
      }
      this.ciphers.set(id, cipher);
    }
    return cipher;
  }

  storage(
    value: StorageConnection,
    secrets: Record<string, string>,
    environment: boolean,
  ): FileStorage | null {
    if (environment) {
      try {
        return storageFromEnv(this.options.env);
      } catch {
        throw integrationError("integration_configuration_invalid", 503);
      }
    }
    if (!value.enabled) {
      return null;
    }
    if (this.options.storage) {
      return this.options.storage(value, secrets);
    }
    if (value.provider === "yandex") {
      const tokenFile =
        this.options.env.YC_OIDC_TOKEN_FILE ??
        this.options.env.FILES_YC_TOKEN_FILE;
      if (!tokenFile) {
        throw integrationError("integration_identity_missing", 503);
      }
      return yandexStorage(
        value.bucket,
        yandexTokenProvider(
          { serviceAccountId: value.serviceAccountId, tokenFile },
          this.options.exchange,
        ),
      );
    }
    if (!secrets.accessKeyId || !secrets.secretAccessKey) {
      throw integrationError("integration_credentials_missing", 503);
    }
    return s3Storage({
      bucket: value.bucket,
      region: value.region,
      endpoint: value.endpoint || undefined,
      credentials: {
        accessKeyId: secrets.accessKeyId,
        secretAccessKey: secrets.secretAccessKey,
        sessionToken: secrets.sessionToken || undefined,
      },
    });
  }

  assistant(
    value: AssistantConnection,
    secrets: Record<string, string>,
    environment: boolean,
  ) {
    if (!environment && !value.enabled) {
      return null;
    }
    try {
      const env = environment
        ? this.options.env
        : assistantEnvironment(value, secrets.apiKey ?? "");
      const config = assistantConfigFromEnv(env);
      if (!environment && !config) {
        throw integrationError("integration_credentials_missing", 503);
      }
      return config
        ? (this.options.assistant?.(value, config.apiKey) ??
            new AssistantService(config))
        : null;
    } catch {
      throw integrationError("integration_configuration_invalid", 503);
    }
  }

  async checkAssistant(
    value: AssistantConnection,
    secrets: Record<string, string>,
    environment: boolean,
  ) {
    if (!environment && !value.enabled) {
      throw integrationError("integration_disabled", 409);
    }
    const env = environment
      ? this.options.env
      : assistantEnvironment(value, secrets.apiKey ?? "");
    let config;
    try {
      config = assistantConfigFromEnv(env);
    } catch {
      throw integrationError("integration_configuration_invalid", 503);
    }
    if (!config) {
      throw integrationError("integration_disabled", 409);
    }
    try {
      const url = new URL(`${config.baseURL.replace(/\/$/, "")}/models`);
      const response = await (this.options.exchange ?? fetch)(url, {
        method: "GET",
        headers: { authorization: `Bearer ${config.apiKey}` },
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
      await response.body?.cancel();
      if (!response.ok) {
        throw new Error();
      }
    } catch {
      throw integrationError("integration_connection_failed", 503);
    }
  }
}
