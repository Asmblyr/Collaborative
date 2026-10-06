import type { z } from "zod";
import {
  actionInputSchema,
  type ActionContract,
  type ActionInputSchema,
} from "./action-contract.js";
import type { PluginSettingsValues } from "@asmblyr-collaborative/contracts";
import type { EndpointActor } from "./endpoint.js";
import type { ItemsService } from "./items.js";
import type { H3Event } from "h3";
import type { PersonalConnections } from "./connections.js";

export interface ActionContext {
  readonly connections?: PersonalConnections;
  readonly actor: EndpointActor;
  readonly signal: AbortSignal;
  readonly superuser: boolean;
  readonly items: ItemsService;
  readonly settings?: Readonly<PluginSettingsValues>;
}

/** Host-resolved contract for a JSON model handler. */
export interface PluginAction {
  readonly connection?: "google";
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly page?: string;
  readonly access: "authenticated" | "superuser";
  readonly inputSchema: ActionInputSchema;
  readonly outputSchema?: Record<string, unknown>;
  readonly mcp: boolean;
  readonly readOnly?: boolean;
  parseInput(value: unknown): object;
  parseOutput(value: unknown): object;
}

declare module "h3" {
  interface H3RouteMeta {
    asmblyr?: PluginAction;
  }
  interface H3EventContext {
    asmblyrAction?: ActionContext;
  }
}

/** Calculations receive the same authenticated, restricted context over HTTP and MCP. */
export function useActionContext(event: H3Event): ActionContext {
  const context = event.context.asmblyrAction;
  if (!context) {
    throw new Error(
      "Action context is unavailable outside a Core action request",
    );
  }
  return context;
}

export class ActionInputError extends Error {
  readonly statusCode = 400;
}

/** @deprecated Use defineModelContext<Input>(handler, defineModelAnnotation(...)). */
export function defineAction<
  Input extends z.ZodObject,
  Output extends z.ZodObject,
>({
  contract,
  access,
  mcp = false,
}: {
  contract: ActionContract<Input, Output>;
  access: PluginAction["access"];
  mcp?: boolean;
}): PluginAction {
  return Object.freeze({
    id: contract.id,
    title: contract.title,
    description: contract.description,
    page: contract.page,
    access,
    mcp,
    readOnly: true,
    inputSchema: actionInputSchema(contract.input),
    parseInput(value: unknown): object {
      const parsed = contract.input.safeParse(value);
      if (!parsed.success) {
        throw new ActionInputError(
          parsed.error.issues
            .map(
              (issue) => `${issue.path.join(".") || "input"}: ${issue.message}`,
            )
            .join("; "),
        );
      }
      return parsed.data;
    },
    parseOutput(value: unknown): object {
      return contract.output.parse(value);
    },
  });
}
