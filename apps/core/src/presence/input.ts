import {
  presencePages,
  type PresenceInput,
  type PresenceScope,
} from "@asmblyr-collaborative/contracts";
import { ItemError, parseCollectionName } from "../items/validation.js";

export function parsePresenceClient(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new ItemError("Invalid presence client", 400);
  }
  return value.toLowerCase();
}
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  ) {
    throw new ItemError("Invalid presence scope", 400);
  }
  return value as Record<string, unknown>;
}
export function parsePresenceInput(body: unknown): PresenceInput {
  const input = object(body, ["clientId", "scope"]);
  const clientId = parsePresenceClient(input.clientId);
  const target = object(input.scope, ["kind", "page", "collection", "id"]);
  let scope: PresenceScope;
  if (target.kind === "page") {
    object(target, ["kind", "page"]);
    if (
      !presencePages.includes(target.page as (typeof presencePages)[number])
    ) {
      throw new ItemError("Unknown presence page", 400);
    }
    scope = {
      kind: "page",
      page: target.page as (typeof presencePages)[number],
    };
  } else if (target.kind === "collection" || target.kind === "record") {
    object(
      target,
      target.kind === "collection"
        ? ["kind", "collection"]
        : ["kind", "collection", "id"],
    );
    if (typeof target.collection !== "string") {
      throw new ItemError("Invalid presence collection", 400);
    }
    const collection = parseCollectionName(target.collection);
    if (target.kind === "collection") {
      scope = { kind: "collection", collection };
    } else {
      if (
        typeof target.id !== "string" ||
        !target.id ||
        target.id.length > 255
      ) {
        throw new ItemError("Invalid presence record", 400);
      }
      scope = { kind: "record", collection, id: target.id };
    }
  } else {
    throw new ItemError("Unknown presence scope", 400);
  }
  return { clientId, scope };
}
