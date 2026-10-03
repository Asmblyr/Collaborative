import type { Readable } from "node:stream";

export interface FileStorage {
  /** Persisted with each file; changing the bucket cannot silently redirect old files. */
  id: string;
  put(key: string, content: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
  close?(): void;
}

export class StorageError extends Error {
  readonly statusCode = 503;
  constructor() {
    super("Файловое хранилище недоступно. Повторите попытку позже.");
  }
}
