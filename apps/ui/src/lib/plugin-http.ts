import { ACCESS_COOKIE, REFRESH_COOKIE } from "./session";

const bodyLimit = 1_048_576;
const hopHeaders = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
];

export class PluginBodyTooLarge extends Error {
  constructor() {
    super("Тело запроса плагина превышает 1 МиБ");
  }
}

function isSessionCookie(value: string): boolean {
  const name = value.split("=", 1)[0].trim();
  return name === ACCESS_COOKIE || name === REFRESH_COOKIE;
}

function copyHeaders(source: Headers): Headers {
  const headers = new Headers(source);
  const connectionHeaders = source.get("connection")?.split(",") ?? [];
  for (const name of [...hopHeaders, ...connectionHeaders]) {
    const normalized = name.trim();
    if (normalized) headers.delete(normalized);
  }
  return headers;
}

export function pluginRequestHeaders(request: Request): Record<string, string> {
  const headers = copyHeaders(request.headers);
  for (const name of [
    "host",
    "authorization",
    "content-length",
    "x-asmblyr-plugin-route",
  ])
    headers.delete(name);
  const cookies = (headers.get("cookie") ?? "")
    .split(";")
    .map((cookie) => cookie.trim())
    .filter((cookie) => cookie && !isSessionCookie(cookie));
  if (cookies.length) headers.set("cookie", cookies.join("; "));
  else headers.delete("cookie");
  headers.set("x-asmblyr-plugin-route", "1");
  return Object.fromEntries(headers);
}

/** Buffer a bounded body so session renewal can replay the same bytes once. */
export async function readPluginBody(
  request: Request,
): Promise<Uint8Array<ArrayBuffer> | undefined> {
  if (!request.body) return undefined;
  if (Number(request.headers.get("content-length")) > bodyLimit) {
    await request.body.cancel();
    throw new PluginBodyTooLarge();
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > bodyLimit) {
        await reader.cancel();
        throw new PluginBodyTooLarge();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/** Forward streams and binary responses without decoding or buffering their body. */
export function pluginResponse(upstream: Response): Response {
  const headers = copyHeaders(upstream.headers);
  // fetch decompresses the body, so the original encoding and byte length are no longer valid.
  headers.delete("content-encoding");
  headers.delete("content-length");
  headers.delete("set-cookie");
  for (const cookie of upstream.headers.getSetCookie()) {
    if (!isSessionCookie(cookie)) headers.append("set-cookie", cookie);
  }
  headers.set("cache-control", "no-store, no-transform");
  headers.set("x-accel-buffering", "no");
  const empty = [204, 205, 304].includes(upstream.status);
  return new Response(empty ? null : upstream.body, {
    status: upstream.status,
    headers,
  });
}
