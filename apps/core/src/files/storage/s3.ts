import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { StorageError, type FileStorage } from "./types.js";

export function s3Storage(options: {
  bucket: string;
  region: string;
  endpoint?: string;
}): FileStorage {
  // The official credential chain supports environment, profiles and workload roles.
  const client = new S3Client({
    region: options.region,
    endpoint: options.endpoint,
    forcePathStyle: Boolean(options.endpoint),
    maxAttempts: 2,
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
  const location = { Bucket: options.bucket };
  return {
    id: `s3:${options.endpoint ?? options.region}:${options.bucket}`,
    async put(key, body, contentType) {
      try {
        await client.send(
          new PutObjectCommand({
            ...location,
            Key: key,
            Body: body,
            ContentLength: body.length,
            ContentType: contentType,
          }),
          { abortSignal: AbortSignal.timeout(120000) },
        );
      } catch {
        throw new StorageError();
      }
    },
    async get(key) {
      try {
        const result = await client.send(
          new GetObjectCommand({ ...location, Key: key }),
          { abortSignal: AbortSignal.timeout(120000) },
        );
        if (!(result.Body instanceof Readable)) throw new StorageError();
        return result.Body;
      } catch {
        throw new StorageError();
      }
    },
    async delete(key) {
      try {
        await client.send(new DeleteObjectCommand({ ...location, Key: key }), {
          abortSignal: AbortSignal.timeout(120000),
        });
      } catch {
        throw new StorageError();
      }
    },
    close() {
      client.destroy();
    },
  };
}
