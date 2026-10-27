import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Knex } from "knex";
import type { MutationFactory } from "../items/mutation-context.js";
import { createToolSession } from "../tools/session.js";
import { authenticateMcp, connectionAccess } from "./access.js";
import { createMcpServer } from "./server.js";
import { McpOAuthError } from "./oauth-input.js";

export async function handleMcp(
  db: Knex,
  resource: string,
  request: FastifyRequest,
  reply: FastifyReply,
  mutations?: MutationFactory,
) {
  const { row: connection } = await authenticateMcp(
    db,
    request.headers.authorization,
    resource,
  );
  const origin = request.headers.origin;
  if (origin && origin !== new URL(resource).origin) {
    const client = await db("public.asmblyr_mcp_clients")
      .where({ id: connection.client_id })
      .first("redirect_uris");
    if (
      !client?.redirect_uris.some(
        (uri: string) => new URL(uri).origin === origin,
      )
    ) {
      throw new McpOAuthError("access_denied", 403);
    }
  }
  if (origin) {
    reply
      .header("Access-Control-Allow-Origin", origin)
      .header("Vary", "Origin")
      .header(
        "Access-Control-Expose-Headers",
        "WWW-Authenticate, MCP-Protocol-Version",
      );
  }
  const initialAccess = await connectionAccess(db, connection.id, resource);
  const session = createToolSession(
    db,
    initialAccess,
    () => connectionAccess(db, connection.id, resource),
    undefined,
    {
      mutations,
      source: connection.id,
      schemas: {
        async load(collection) {
          const row = await db("public.asmblyr_mcp_schemas")
            .where({ connection_id: connection.id, collection })
            .first("collection_id");
          return row?.collection_id;
        },
        async save(collection, collectionId) {
          await db("public.asmblyr_mcp_schemas")
            .insert({
              connection_id: connection.id,
              collection,
              collection_id: collectionId,
            })
            .onConflict(["connection_id", "collection"])
            .merge({ collection_id: collectionId });
        },
      },
    },
  );
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = createMcpServer(session);
  await server.connect(transport);
  try {
    const headers = new Headers();
    for (const name of [
      "content-type",
      "accept",
      "mcp-protocol-version",
      "mcp-session-id",
      "last-event-id",
    ]) {
      const value = request.headers[name];
      if (typeof value === "string") {
        headers.set(name, value);
      }
    }
    const body =
      request.method === "POST" ? JSON.stringify(request.body) : undefined;
    const response = await transport.handleRequest(
      new Request(resource, { method: request.method, headers, body }),
    );
    reply.code(response.status);
    response.headers.forEach((value, name) => reply.header(name, value));
    return reply.send(Buffer.from(await response.arrayBuffer()));
  } finally {
    await server.close();
  }
}
