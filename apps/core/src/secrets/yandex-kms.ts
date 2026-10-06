import { SecretError, type Ciphertext, type SecretCipher } from "./cipher.js";

/** Direct KMS encryption for bounded configuration secrets; the key never leaves KMS. */
export function yandexKmsCipher(
  keyId: string,
  token: () => Promise<string>,
  exchange: typeof fetch = fetch,
): SecretCipher {
  async function request(
    operation: "encrypt" | "decrypt",
    body: Record<string, string>,
  ) {
    try {
      const response = await exchange(
        `https://kms.yandex/kms/v1/keys/${encodeURIComponent(keyId)}:${operation}`,
        {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(15000),
          headers: {
            authorization: `Bearer ${await token()}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );
      if (!response.ok) {
        await response.body?.cancel();
        throw new SecretError();
      }
      const text = await response.text();
      if (text.length > 32000) {
        throw new SecretError();
      }
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new SecretError();
    }
  }
  return {
    async encrypt(value, context) {
      const result = await request("encrypt", {
        plaintext: Buffer.from(value).toString("base64"),
        aadContext: Buffer.from(context).toString("base64"),
      });
      if (
        result.keyId !== keyId ||
        typeof result.ciphertext !== "string" ||
        !result.ciphertext ||
        result.ciphertext.length > 24000 ||
        typeof result.versionId !== "string" ||
        !result.versionId ||
        result.versionId.length > 128
      ) {
        throw new SecretError();
      }
      return {
        version: 1,
        provider: "yandex-kms",
        keyId,
        keyVersion: result.versionId,
        data: result.ciphertext,
      };
    },
    async decrypt(value: Ciphertext, context) {
      if (
        value.version !== 1 ||
        value.provider !== "yandex-kms" ||
        value.keyId !== keyId ||
        value.data.length > 24000
      ) {
        throw new SecretError();
      }
      const result = await request("decrypt", {
        ciphertext: value.data,
        aadContext: Buffer.from(context).toString("base64"),
      });
      if (
        result.keyId !== keyId ||
        typeof result.plaintext !== "string" ||
        result.plaintext.length > 12000
      ) {
        throw new SecretError();
      }
      return Buffer.from(result.plaintext, "base64").toString("utf8");
    },
  };
}
