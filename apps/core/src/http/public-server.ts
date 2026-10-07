import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { request as httpsRequest } from "node:https";
import type { Socket } from "node:net";
import type { FastifyInstance } from "fastify";

export function isCorePath(url: string): boolean {
  const path = url.split("?")[0];
  return (
    /^\/api(?:\/|$)/.test(path) ||
    /^\/sign\/sso\//.test(path) ||
    path === "/connections/google/callback" ||
    (/^\/oauth(?:\/|$)/.test(path) &&
      !/^\/oauth\/interaction(?:\/|$)/.test(path))
  );
}

/** Public listener in the Core process. API requests enter Fastify directly, without a proxy hop. */
export function createPublicServer(app: FastifyInstance, uiUrl: string) {
  const target = new URL(uiUrl);
  if (
    !["http:", "https:"].includes(target.protocol) ||
    target.username ||
    target.password ||
    target.pathname !== "/" ||
    target.search ||
    target.hash
  ) {
    throw new Error("UI_URL must be an HTTP(S) origin");
  }
  const transport = target.protocol === "https:" ? httpsRequest : httpRequest;
  function proxy(request: IncomingMessage, response: ServerResponse) {
    const headers = { ...request.headers };
    // Only the configured UI is reachable. Never resolve request paths as absolute URLs.
    const upstream = transport(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        method: request.method,
        path: request.url,
        headers,
      },
      (result) => {
        response.writeHead(result.statusCode ?? 502, result.headers);
        result.pipe(response);
        result.on("error", () => response.destroy());
      },
    );
    upstream.on("error", () => {
      if (!response.headersSent) {
        response.writeHead(503, {
          "content-type": "text/plain",
          "cache-control": "no-store",
        });
      }
      response.end("Administration interface unavailable");
    });
    request.on("aborted", () => upstream.destroy());
    response.on("close", () => {
      if (!response.writableFinished) {
        upstream.destroy();
      }
    });
    request.pipe(upstream);
  }
  const server = createServer((request, response) => {
    if (isCorePath(request.url ?? "/")) {
      app.routing(request, response);
    } else {
      proxy(request, response);
    }
  });
  const sockets = new Set<Socket>();
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  // Next development hot reload uses a WebSocket; production API does not need one.
  server.on("upgrade", (request, socket, head) => {
    if (isCorePath(request.url ?? "/")) {
      socket.destroy();
      return;
    }
    const upstream = transport({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      method: request.method,
      path: request.url,
      headers: request.headers,
    });
    upstream.on("upgrade", (response, remote, remoteHead) => {
      socket.write(
        `HTTP/1.1 101 Switching Protocols\r\n${Object.entries(response.headers)
          .map(([name, value]) => `${name}: ${value}`)
          .join("\r\n")}\r\n\r\n`,
      );
      if (remoteHead.length) {
        socket.write(remoteHead);
      }
      if (head.length) {
        remote.write(head);
      }
      socket.pipe(remote).pipe(socket);
      socket.on("error", () => remote.destroy());
      remote.on("error", () => socket.destroy());
      socket.on("close", () => remote.destroy());
      remote.on("close", () => socket.destroy());
    });
    upstream.on("error", () => socket.destroy());
    upstream.on("response", () => socket.destroy());
    upstream.end();
  });
  return Object.assign(server, {
    closePublicConnections() {
      // Include Next hot-reload upgrades, which Node's closeAllConnections excludes.
      for (const socket of sockets) {
        socket.destroy();
      }
    },
  });
}
