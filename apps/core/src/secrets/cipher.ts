import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface Ciphertext {
  version: 1;
  provider: "local" | "yandex-kms";
  data: string;
  keyId?: string;
  keyVersion?: string;
}
export interface SecretCipher {
  encrypt(value: string, context: string): Promise<Ciphertext>;
  decrypt(value: Ciphertext, context: string): Promise<string>;
}

export class SecretError extends Error {
  readonly statusCode = 503;
  readonly code = "secret_provider_unavailable";
  constructor() {
    super("secret_provider_unavailable");
  }
}

function localKey(value?: string) {
  if (!value || !/^[A-Za-z0-9_-]{43}=?$/.test(value)) {
    throw new SecretError();
  }
  const key = Buffer.from(value, "base64url");
  if (key.length !== 32) {
    throw new SecretError();
  }
  return key;
}

export function localCipher(rootKey?: string): SecretCipher {
  const key = localKey(rootKey);
  return {
    async encrypt(value, context) {
      const nonce = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, nonce);
      cipher.setAAD(Buffer.from(context));
      const encrypted = Buffer.concat([
        cipher.update(value, "utf8"),
        cipher.final(),
      ]);
      return {
        version: 1,
        provider: "local",
        data: Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString(
          "base64",
        ),
      };
    },
    async decrypt(value, context) {
      try {
        if (
          value.version !== 1 ||
          value.provider !== "local" ||
          value.data.length > 16000
        ) {
          throw new SecretError();
        }
        const data = Buffer.from(value.data, "base64");
        if (data.length < 29) {
          throw new SecretError();
        }
        const decipher = createDecipheriv(
          "aes-256-gcm",
          key,
          data.subarray(0, 12),
        );
        decipher.setAAD(Buffer.from(context));
        decipher.setAuthTag(data.subarray(12, 28));
        return Buffer.concat([
          decipher.update(data.subarray(28)),
          decipher.final(),
        ]).toString("utf8");
      } catch {
        throw new SecretError();
      }
    },
  };
}
