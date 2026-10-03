import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ACCESS_COOKIE, REFRESH_COOKIE, type TokenPair } from "./session";
import { requestCoreWithSession } from "./core-session-request";
import { hasForeignOrigin } from "./request-origin";
import { SessionExpiredError } from "./renew-session";
import { setSessionCookies } from "./session-cookies";

const maxBytes = 25 * 1024 * 1024;
class UploadLimitError extends Error {}

async function boundedBody(request: Request): Promise<Uint8Array<ArrayBuffer>> {
  if (Number(request.headers.get("content-length")) > maxBytes) throw new UploadLimitError();
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maxBytes) { await reader.cancel(); throw new UploadLimitError(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  return body;
}

export async function proxyFileContent(request: Request, path: string, upload = false) {
  if (upload && hasForeignOrigin(request)) return Response.json({ message: "Forbidden origin" }, { status: 403 });
  if (upload && request.headers.get("content-type") !== "application/octet-stream") {
    return Response.json({ message: "Ожидается содержимое файла" }, { status: 415 });
  }
  const jar = await cookies();
  const session = { accessToken: jar.get(ACCESS_COOKIE)?.value, refreshToken: jar.get(REFRESH_COOKIE)?.value };
  if (!session.accessToken && !session.refreshToken) return Response.json({ message: "Требуется вход" }, { status: 401 });
  let renewed: TokenPair | undefined;
  let response: NextResponse;
  try {
    const body = upload ? await boundedBody(request) : undefined;
    const upstream = await requestCoreWithSession(path, { method: upload ? "POST" : "GET", body,
      timeoutMs: 150000, headers: upload ? {
        "content-type": "application/octet-stream", "x-file-name": request.headers.get("x-file-name") ?? "",
        "x-file-type": request.headers.get("x-file-type") ?? "application/octet-stream",
      } : undefined,
    }, session, (pair) => { renewed = pair; });
    const headers = new Headers({ "cache-control": "private, no-store" });
    for (const key of ["content-type", "content-length", "content-disposition", "content-security-policy", "x-content-type-options"]) {
      const value = upstream.headers.get(key);
      if (value) headers.set(key, value);
    }
    response = new NextResponse(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    const expired = error instanceof SessionExpiredError, tooLarge = error instanceof UploadLimitError;
    response = NextResponse.json({ message: tooLarge ? "Максимальный размер файла — 25 МБ"
      : expired ? "Требуется вход" : "Не удалось передать файл. Обновите список перед повторной загрузкой." },
    { status: tooLarge ? 413 : expired ? 401 : 503, headers: { "cache-control": "no-store" } });
    if (expired) { response.cookies.delete(ACCESS_COOKIE); response.cookies.delete(REFRESH_COOKIE); }
  }
  if (renewed) setSessionCookies(response, request, renewed);
  return response;
}
