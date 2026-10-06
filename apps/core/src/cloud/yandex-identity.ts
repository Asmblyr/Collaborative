import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { SecretError } from "../secrets/cipher.js";

const run = promisify(execFile);
export interface YandexTokenOptions {
  serviceAccountId: string;
  tokenFile?: string;
  kubernetes?: {
    kubeconfig: string;
    namespace: string;
    serviceAccount: string;
    audience: string;
  };
}

/** One provider per process, with single-flight exchange and early refresh. Never logs JWT/IAM tokens. */
export function yandexTokenProvider(
  options: YandexTokenOptions,
  exchange: typeof fetch = fetch,
  now: () => number = Date.now,
) {
  let cached: { token: string; until: number } | undefined;
  let pending: Promise<string> | undefined;
  async function refresh() {
    try {
      let assertion: string;
      if (options.tokenFile) {
        assertion = (await readFile(options.tokenFile, "utf8")).trim();
      } else if (options.kubernetes) {
        const k = options.kubernetes;
        const result = await run(
          "kubectl",
          [
            "--kubeconfig",
            k.kubeconfig,
            "--namespace",
            k.namespace,
            "create",
            "token",
            k.serviceAccount,
            "--audience",
            k.audience,
            "--duration=10m",
          ],
          { windowsHide: true, timeout: 20000, maxBuffer: 65536 },
        );
        assertion = result.stdout.trim();
      } else {
        throw new SecretError();
      }
      if (!assertion || assertion.length > 32768) {
        throw new SecretError();
      }
      const response = await exchange("https://auth.yandex.cloud/oauth/token", {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(15000),
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
          requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
          audience: options.serviceAccountId,
          subject_token: assertion,
          subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
        }),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new SecretError();
      }
      const text = await response.text();
      if (text.length > 65536) {
        throw new SecretError();
      }
      const result = JSON.parse(text) as {
        access_token?: unknown;
        expires_in?: unknown;
      };
      if (
        typeof result.access_token !== "string" ||
        !result.access_token ||
        result.access_token.length > 32768 ||
        typeof result.expires_in !== "number" ||
        !Number.isFinite(result.expires_in) ||
        result.expires_in <= 60
      ) {
        throw new SecretError();
      }
      cached = {
        token: result.access_token,
        until: now() + (Math.min(result.expires_in, 600) - 60) * 1000,
      };
      return cached.token;
    } catch {
      throw new SecretError();
    }
  }
  return async () => {
    if (cached && cached.until > now()) {
      return cached.token;
    }
    pending ??= refresh().finally(() => {
      pending = undefined;
    });
    return pending;
  };
}
