import { randomUUID } from "node:crypto";
import type { Access } from "../permissions/access.js";
import type { MutationContext } from "./events-repository.js";

export type MutationFactory = (access: Access) => MutationContext;

export function mutationContext(access: Access): MutationContext {
  return {
    access,
    requestId: randomUUID(),
    actor: { kind: access.principal.kind, id: access.principal.id },
  };
}
