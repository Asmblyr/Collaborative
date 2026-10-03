import type { FastifyInstance } from "fastify";

declare module "fastify" {
  interface FastifyContextConfig {
    asmblyrPlugin?: string;
  }
}

/** Install before Core routes so namespace conflicts are independent of load order. */
export function registerPluginBoundary(app: FastifyInstance): void {
  const owners = new Map<string, string>();

  app.addHook("onRoute", (route) => {
    const namespace = route.url.split("/")[1].toLowerCase();
    const owner = route.config?.asmblyrPlugin ?? "Core";
    const existing = owners.get(namespace);
    if (existing && existing !== owner) {
      throw new Error(
        `Route namespace /${namespace} belongs to ${existing}; cannot register ${owner}`,
      );
    }
    owners.set(namespace, owner);
  });

  app.addHook("onRequest", async (request, reply) => {
    // The UI's fallback may reach only plugin endpoints, never additional Core routes.
    if (
      request.headers["x-asmblyr-plugin-route"] === "1" &&
      !request.routeOptions.config.asmblyrPlugin
    ) {
      return reply.code(404).send({ code: "NOT_FOUND", message: "Plugin endpoint not found" });
    }
  });
}
