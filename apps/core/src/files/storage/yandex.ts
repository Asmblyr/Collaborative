import { Readable } from "node:stream";
import { StorageError, type FileStorage } from "./types.js";

/** YC's S3 API accepts Bearer IAM tokens directly; no static S3 credentials are needed. */
export function yandexStorage(bucket: string, token: () => Promise<string>): FileStorage {
  async function request(key: string, method: "PUT" | "GET" | "DELETE", body?: Buffer, contentType?: string) {
    try {
      const url = `https://storage.yandexcloud.net/${encodeURIComponent(bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`;
      const response = await fetch(url, { method, redirect: "error", signal: AbortSignal.timeout(120000),
        headers: { authorization: `Bearer ${await token()}`,
          ...(body ? { "content-type": contentType!, "content-length": String(body.length) } : {}) },
        body: body ? new Uint8Array(body) : undefined });
      if (!response.ok && !(method === "DELETE" && response.status === 404)) {
        await response.body?.cancel(); throw new StorageError();
      }
      return response;
    } catch { throw new StorageError(); }
  }
  return {
    id: `yandex:${bucket}`,
    async put(key, body, mime) { const response = await request(key, "PUT", body, mime); await response.body?.cancel(); },
    async get(key) {
      const response = await request(key, "GET");
      if (!response.body) throw new StorageError();
      return Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
    },
    async delete(key) { const response = await request(key, "DELETE"); await response.body?.cancel(); },
  };
}
