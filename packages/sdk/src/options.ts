export interface ClientOptions {
  /** API root, e.g. https://example.com/api or /api in a browser. */
  baseUrl: string;
  accessToken?:
    | string
    | (() => string | undefined | Promise<string | undefined>);
  headers?: HeadersInit;
  credentials?: RequestCredentials;
  /** Defaults to 10 seconds. Zero disables the timeout. */
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}

export interface RequestOptions {
  signal?: AbortSignal;
  /** Overrides the client timeout for this call. Zero disables it. */
  timeoutMs?: number;
}
