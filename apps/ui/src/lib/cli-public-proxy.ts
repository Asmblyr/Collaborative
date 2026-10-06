import { coreAddress } from "./session";
import { hasForeignOrigin } from "./request-origin";
/** No cookies or session renewal: PKCE grants and explicit CLI schema credentials only. */
export async function cliPublicProxy(
  request: Request,
  path: string,
  method: "GET" | "POST",
  bearer?: string,
): Promise<Response> {
  if (method === "POST" && hasForeignOrigin(request)) {
    return Response.json({ message: "Forbidden origin" }, { status: 403 });
  }
  if (
    method === "POST" &&
    !request.headers.get("content-type")?.startsWith("application/json")
  ) {
    return Response.json({ message: "Expected JSON" }, { status: 415 });
  }
  try {
    const response = await fetch(coreAddress(path), {
      method,
      headers: {
        ...(bearer ? { authorization: bearer } : {}),
        ...(method === "POST" ? { "content-type": "application/json" } : {}),
      },
      body: method === "POST" ? await request.text() : undefined,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(15000)]),
    });
    return new Response(await response.text(), {
      status: response.status,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    });
  } catch {
    return Response.json({ message: "Core API unavailable" }, { status: 503 });
  }
}
