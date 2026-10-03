import type { AsmblyrContext, EndpointHandler } from "@asmblyr/kit";
import type { FastifyReply, FastifyRequest } from "fastify";
import { H3Event, HTTPError, toResponse } from "h3";
import { describeRequestError } from "../http/error-handler.js";

/** Fastify buffers bytes once, with its body limit; H3 owns their interpretation. */
export function createPluginEvent(
  request: FastifyRequest,
  reply: FastifyReply,
  context: AsmblyrContext,
): H3Event {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (
      value === undefined ||
      ["authorization", "proxy-authorization", "x-asmblyr-plugin-route"].includes(name)
    )
      continue;
    for (const part of Array.isArray(value) ? value : [value]) headers.append(name, part);
  }
  const controller = new AbortController();
  const disconnect = () => {
    if (!reply.raw.writableFinished) controller.abort();
  };
  reply.raw.once("close", disconnect);
  reply.raw.once("finish", () => reply.raw.off("close", disconnect));

  const body = Buffer.isBuffer(request.body) ? new Uint8Array(request.body) : undefined;
  const webRequest = new Request(`${request.protocol}://${request.host}${request.url}`, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : body,
    signal: controller.signal,
  });
  // Fastify has already decoded params. H3 helpers expect encoded values and decode on demand.
  const params = Object.fromEntries(
    Object.entries(request.params as Record<string, string>).map(([key, value]) => [
      key,
      encodeURIComponent(value),
    ]),
  );
  return new H3Event(webRequest, { asmblyr: context, params });
}

function errorResponse(error: unknown, request: FastifyRequest): Response {
  const { status, body } = describeRequestError(error, request);
  const headers =
    HTTPError.isError(error) && status < 500 ? new Headers(error.headers) : new Headers();
  headers.set("cache-control", "no-store");
  return Response.json(body, { status, headers });
}

export async function runPluginHandler(
  handler: EndpointHandler,
  event: H3Event,
  request: FastifyRequest,
): Promise<Response> {
  try {
    const result = await handler(event);
    return await toResponse(result, event, {
      silent: true,
      onError: (error) => errorResponse(error.unhandled ? (error.cause ?? error) : error, request),
    });
  } catch (error) {
    return errorResponse(error, request);
  }
}

export function sendPluginResponse(reply: FastifyReply, response: Response): FastifyReply {
  reply.code(response.status);
  for (const [name, value] of response.headers) {
    if (name !== "set-cookie") reply.header(name, value);
  }
  const cookies = response.headers.getSetCookie();
  if (cookies.length) reply.header("set-cookie", cookies);
  reply.header("cache-control", "no-store");
  return reply.send(response.body ?? undefined);
}
