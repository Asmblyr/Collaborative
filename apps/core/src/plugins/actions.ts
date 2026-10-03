import type {
  ActionContext,
  EndpointDefinition,
  PluginAction,
} from "@asmblyr/kit";
import { readBody, type H3Event } from "h3";
import type {
  PluginActionResult,
  PluginPreparedAction,
} from "@asmblyr/contracts";
import { AccessDeniedError, type Access } from "../permissions/access.js";
import { ItemError } from "../items/validation.js";
import type { ToolDefinition } from "../tools/tool-definitions.js";
import {
  parseEndpoint,
  parsePluginDefinition,
  type LoadedPlugin,
} from "./definition.js";
import { parseEndpointAction } from "./action-definition.js";
import { runActionHandler } from "./action-handler.js";
import { ActionDrafts } from "./action-drafts.js";
import { runActionWithSignal } from "./action-execution.js";
import type { ActionScope } from "./action-items.js";

interface RegisteredAction {
  plugin: LoadedPlugin;
  namespace: string;
  action: PluginAction;
  endpoint: EndpointDefinition;
  toolName: string;
}
type ContextFactory = (
  access: Access,
  scope: ActionScope,
  plugin: LoadedPlugin,
) => Promise<Pick<ActionContext, "actor" | "items" | "settings">>;

export class PluginActions {
  private readonly entries: RegisteredAction[] = [];
  constructor(
    plugins: readonly LoadedPlugin[],
    private readonly context: ContextFactory,
    private readonly drafts = new ActionDrafts(),
  ) {
    for (const plugin of plugins) {
      parsePluginDefinition(plugin.definition, plugin.name);
      for (const route of plugin.endpoints) {
        const endpoint = parseEndpoint(route, plugin.name);
        const action = parseEndpointAction(endpoint, plugin.name);
        if (!action) {
          continue;
        }
        const namespace = plugin.namespace;
        if (!namespace || !/^[a-z][a-z0-9_]*$/.test(namespace)) {
          throw new Error("Plugin actions require a namespace");
        }
        if (endpoint.path.split("/")[1] !== namespace) {
          throw new Error("Action routes must belong to the plugin namespace");
        }
        if (action.page && !plugin.hasUi) {
          throw new Error("Action pages require a plugin UI entry");
        }
        const toolName = `plugin_${namespace}__${action.id.replaceAll("-", "_")}`;
        if (
          toolName.length > 64 ||
          this.entries.some((entry) => entry.toolName === toolName)
        ) {
          throw new Error("Plugin action tool name is too long or duplicated");
        }
        this.entries.push({ plugin, namespace, action, endpoint, toolName });
      }
    }
  }

  private allowed(access: Access, action: PluginAction): boolean {
    return action.access === "authenticated" || access.principal.superuser;
  }

  private find(
    access: Access,
    namespace: string,
    id: string,
  ): RegisteredAction {
    const entry = this.entries.find(
      (entry) => entry.namespace === namespace && entry.action.id === id,
    );
    if (!entry) {
      throw new ItemError("Действие расширения недоступно.", 404);
    }
    if (!this.allowed(access, entry.action)) {
      throw new AccessDeniedError();
    }
    return entry;
  }

  definitions(access: Access): ToolDefinition[] {
    return this.entries
      .filter(({ action }) => action.mcp && this.allowed(access, action))
      .map(({ action, toolName }) => ({
        name: toolName,
        description: actionDescription(action),
        parameters: action.inputSchema,
        annotations: {
          readOnlyHint: action.readOnly === true,
          destructiveHint: action.readOnly !== true,
          openWorldHint: true,
        },
      }));
  }

  hasTool(name: string): boolean {
    return this.entries.some(
      (entry) => entry.action.mcp && entry.toolName === name,
    );
  }

  async execute(
    access: Access,
    namespace: string,
    id: string,
    input: unknown,
    signal = AbortSignal.timeout(10_000),
    mcp = false,
  ): Promise<PluginActionResult> {
    const { action, endpoint, plugin } = this.find(access, namespace, id);
    const bounded = AbortSignal.any([signal, AbortSignal.timeout(10_000)]);
    const result = await runActionWithSignal(bounded, async () => {
      const context = await this.context(
        access,
        {
          mcp,
          readOnly: action.readOnly === true,
          signal: bounded,
        },
        plugin,
      );
      bounded.throwIfAborted();
      return runActionHandler(endpoint, action, input, {
        actor: Object.freeze({ ...context.actor }),
        signal: bounded,
        superuser: access.principal.superuser,
        items: context.items,
        ...(context.settings ? { settings: context.settings } : {}),
      });
    });
    bounded.throwIfAborted();
    const encoded = JSON.stringify(result);
    if (Buffer.byteLength(encoded) > 48_000) {
      throw new ItemError("Результат действия слишком велик.", 422);
    }
    return { namespace, actionId: id, ...JSON.parse(encoded) };
  }

  async handleHttp(
    access: Access,
    namespace: string,
    id: string,
    event: H3Event,
  ) {
    this.find(access, namespace, id);
    const input = await readBody(event);
    return {
      data: await this.execute(access, namespace, id, input, event.req.signal),
    };
  }

  async callTool(
    access: Access,
    name: string,
    input: unknown,
    signal?: AbortSignal,
  ): Promise<object> {
    const entry = this.entries.find(
      (entry) => entry.action.mcp && entry.toolName === name,
    );
    if (!entry) {
      throw new ItemError("Unknown plugin action", 404);
    }
    const result = await this.execute(
      access,
      entry.namespace,
      entry.action.id,
      input,
      signal,
      true,
    );
    signal?.throwIfAborted();
    if (!entry.action.page) {
      return result;
    }
    const prepared = this.drafts.create(this.owner(access), {
      ...result,
      title: entry.action.title,
      pageId: entry.action.page,
    });
    return { ...result, prepared };
  }

  prepared(
    access: Access,
    namespace: string,
    id: string,
  ): PluginPreparedAction {
    const draft = this.drafts.get(this.owner(access), namespace, id);
    this.find(access, namespace, draft.actionId);
    return draft;
  }

  private owner(access: Access): string {
    return `${access.principal.kind}:${access.principal.id}`;
  }
}

function actionDescription(action: PluginAction): string {
  const parts = [action.title, action.description];
  if (!action.readOnly) {
    parts.push(
      "May change data. Invoke only for the user's explicit request; do not retry an uncertain write automatically.",
    );
  }
  if (action.page) {
    parts.push(
      "Returns a prepared form ID. Use present_plugin_result to offer an Open page button; never invent a link or result ID.",
    );
  }
  return parts.join(" ");
}
