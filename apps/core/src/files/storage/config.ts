import { s3Storage } from "./s3.js";
import { yandexStorage } from "./yandex.js";
import { yandexTokenProvider } from "./yandex-token.js";
import type { FileStorage } from "./types.js";

export function storageFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): FileStorage | null {
  if (!env.FILES_STORAGE || env.FILES_STORAGE === "disabled") return null;
  const required = (name: string) => {
    const value = env[name]?.trim();
    if (!value) throw new Error(`${name} is required for file storage`);
    return value;
  };
  const bucket = required("FILES_BUCKET");
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket))
    throw new Error("Invalid FILES_BUCKET");
  if (env.FILES_STORAGE === "s3") {
    if (Boolean(env.AWS_ACCESS_KEY_ID) !== Boolean(env.AWS_SECRET_ACCESS_KEY)) {
      throw new Error(
        "S3 environment credentials require both access key and secret key",
      );
    }
    if (env.FILES_S3_ENDPOINT) {
      const url = new URL(env.FILES_S3_ENDPOINT);
      if (
        url.protocol !== "https:" &&
        !(
          url.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(url.hostname)
        )
      ) {
        throw new Error(
          "FILES_S3_ENDPOINT must use HTTPS (HTTP allowed for local development only)",
        );
      }
      if (url.username || url.password || url.search || url.hash)
        throw new Error("Invalid S3 endpoint");
    }
    return s3Storage({
      bucket,
      region: required("FILES_S3_REGION"),
      endpoint: env.FILES_S3_ENDPOINT,
      credentials:
        env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
          ? {
              accessKeyId: env.AWS_ACCESS_KEY_ID,
              secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
              sessionToken: env.AWS_SESSION_TOKEN || undefined,
            }
          : undefined,
    });
  }
  if (env.FILES_STORAGE !== "yandex")
    throw new Error("FILES_STORAGE must be yandex or s3");
  const source = required("FILES_YC_TOKEN_SOURCE");
  if (source !== "file" && source !== "kubernetes")
    throw new Error("Invalid FILES_YC_TOKEN_SOURCE");
  if (source === "kubernetes" && env.NODE_ENV === "production") {
    throw new Error(
      "Production file storage requires a projected OIDC token file, not a workstation kubeconfig",
    );
  }
  const token = yandexTokenProvider({
    serviceAccountId: required("FILES_YC_SERVICE_ACCOUNT_ID"),
    ...(source === "file"
      ? { tokenFile: required("FILES_YC_TOKEN_FILE") }
      : {
          kubernetes: {
            kubeconfig: required("FILES_KUBECONFIG"),
            namespace: required("FILES_K8S_NAMESPACE"),
            serviceAccount: required("FILES_K8S_SERVICE_ACCOUNT"),
            audience: required("FILES_YC_AUDIENCE"),
          },
        }),
  });
  return yandexStorage(bucket, token);
}
