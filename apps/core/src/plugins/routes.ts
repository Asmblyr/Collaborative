import type {
  AsmblyrContext,
  EndpointDefinition,
  EndpointLogger,
  PluginAction,
} from "@asmblyr/kit";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { endpointLogger } from "./logger.js";
import {
  parseEndpoint,
  parsePluginDefinition,
  type LoadedPlugin,
} from "./definition.js";
import {
  createPluginEvent,
  runPluginHandler,
  sendPluginResponse,
} from "./http.js";
import type { Access } from "../permissions/access.js";
import type { PluginActions } from "./actions.js";
import { parseEndpointAction } from "./action-definition.js";

type LoadContext = (
  authorization: string | undefined,
  plugin: LoadedPlugin,
  runtime: { requestId: string; logger: EndpointLogger },
) => Promise<
  Pick<
    AsmblyrContext,
    "actor" | "items" | "storage" | "settings" | "withRecord"
  > & { access?: Access }
>;

export function registerPluginRoutes(
  app: FastifyInstance,
  plugins: readonly LoadedPlugin[],
  loadContext: LoadContext,
  actions?: PluginActions,
): void {
  const names = new Set<string>();
  const routes: {
    plugin: LoadedPlugin;
    endpoint: EndpointDefinition;
    action?: PluginAction;
  }[] = [];
  for (const plugin of plugins) {
    if (names.has(plugin.name)) {
      throw new Error(`Duplicate plugin ${plugin.name}`);
    }
    names.add(plugin.name);
    parsePluginDefinition(plugin.definition, plugin.name);
    for (const route of plugin.endpoints) {
      const endpoint = parseEndpoint(route, plugin.name);
      const action = parseEndpointAction(endpoint, plugin.name);
      if (action && (!actions || !plugin.namespace)) {
        throw new Error(
          "Annotated endpoints require the Core action registry and plugin namespace",
        );
      }
      routes.push({ plugin, endpoint, action });
    }
  }
  app.register(async (scope) => {
    const contexts = new WeakMap<
      FastifyRequest,
      { context: AsmblyrContext; access?: Access }
    >();
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser(
      "*",
      { parseAs: "buffer" },
      (_request, body, done) => done(null, body),
    );
    for (const { plugin, endpoint, action } of routes) {
      const name = plugin.name;
      scope.route({
        method: endpoint.method,
        url: endpoint.path,
        config: { asmblyrPlugin: name },
        bodyLimit: action ? 16_000 : 1_048_576,
        onRequest: async (request, reply) => {
          reply.header("Cache-Control", "no-store");
          const { actor, items, storage, settings, withRecord, access } =
            await loadContext(request.headers.authorization, plugin, {
              requestId: request.id,
              logger: endpointLogger(request.log.child({ plugin: name })),
            });
          contexts.set(request, {
            access,
            context: Object.freeze({
              actor: Object.freeze({
                id: actor.id,
                kind: actor.kind,
                ...(actor.displayName
                  ? { displayName: actor.displayName }
                  : {}),
              }),
              items,
              settings,
              withRecord,
              ...(storage ? { storage } : {}),
              requestId: request.id,
              logger: endpointLogger(request.log.child({ plugin: name })),
            }),
          });
        },
        handler: async (request, reply) => {
          const authenticated = contexts.get(request);
          if (!authenticated) {
            throw new Error("Missing authenticated plugin context");
          }
          const event = createPluginEvent(
            request,
            reply,
            authenticated.context,
          );
          let handler = endpoint.handler;
          if (action) {
            const access = authenticated.access;
            if (!access) {
              throw new Error("Missing authenticated action access");
            }
            handler = () =>
              actions!.handleHttp(access, plugin.namespace!, action.id, event);
          }
          const response = await runPluginHandler(handler, event, request);
          return sendPluginResponse(reply, response);
        },
      });
    }
  });
}
