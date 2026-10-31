import type { FastifyInstance } from "fastify";

/** Redirect old public hosts without forwarding their credentials or trusting forwarded headers. */
export function registerCanonicalOrigin(
  app: FastifyInstance,
  origin: string,
  aliases: string[],
): void {
  const canonical = new URL(origin);
  const hosts = new Set(
    aliases.map((alias) => {
      const url = new URL(alias);
      if (
        !["https:", "http:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash ||
        url.host === canonical.host
      ) {
        throw new Error(
          "AUTH_UI_ALIASES must contain different HTTP(S) public origins without paths or credentials",
        );
      }
      return url.host.toLowerCase();
    }),
  );
  if (!hosts.size) {
    return;
  }
  app.addHook("onRequest", async (request, reply) => {
    if (!hosts.has((request.headers.host ?? "").toLowerCase())) {
      return;
    }
    reply.header("Cache-Control", "no-store");
    if (!["GET", "HEAD"].includes(request.method)) {
      return reply.code(421).send({
        code: "CANONICAL_ORIGIN_REQUIRED",
        message: "Use the configured public origin",
      });
    }
    const path = request.originalUrl.startsWith("/")
      ? request.originalUrl
      : "/";
    return reply.redirect(`${canonical.origin}${path}`, 302);
  });
}
