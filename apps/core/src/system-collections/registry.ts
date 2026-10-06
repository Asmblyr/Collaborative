import type { SystemCollectionName } from "@asmblyr-collaborative/contracts";
import { CollectionNotFoundError } from "../collections/validation.js";

// Explicit product entities only. Never expose auth, secrets or bookkeeping tables.
export const systemCollections = [
  { name: "users", table: "asmblyr_users", label: "email" },
  { name: "files", table: "asmblyr_files", label: "title" },
  { name: "policies", table: "asmblyr_policies", label: "name" },
  { name: "workspaces", table: "asmblyr_workspaces", label: "name" },
  {
    name: "service_accounts",
    table: "asmblyr_service_accounts",
    label: "name",
  },
] as const satisfies readonly {
  name: SystemCollectionName;
  table: string;
  label: string;
}[];

export function systemCollection(name: string) {
  const collection = systemCollections.find((entry) => entry.name === name);
  if (!collection) {
    throw new CollectionNotFoundError(name);
  }
  return collection;
}
