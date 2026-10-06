import { coreAddress } from "./session";

/** Public content only; forwards neither session cookies nor authorization. */
export async function proxyPublicFile(
  request: Request,
  id: string,
): Promise<Response> {
  const headers = new Headers({ "cache-control": "no-store" });
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  ) {
    return Response.json(
      { message: "File not found" },
      { status: 404, headers },
    );
  }
  const preview =
    new URL(request.url).searchParams.get("preview") === "1"
      ? "?preview=1"
      : "";
  try {
    const response = await fetch(
      coreAddress(`/public/files/${encodeURIComponent(id)}/content${preview}`),
      {
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(150000)]),
      },
    );
    for (const key of [
      "content-type",
      "content-length",
      "content-disposition",
      "content-security-policy",
      "x-content-type-options",
    ]) {
      const value = response.headers.get(key);
      if (value) {
        headers.set(key, value);
      }
    }
    return new Response(response.body, { status: response.status, headers });
  } catch {
    return Response.json(
      { message: "File is unavailable" },
      { status: 503, headers },
    );
  }
}
