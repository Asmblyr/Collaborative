import type { Collection } from "./types";

/** Picker descriptor only. This is never added to the ordinary collection catalog. */
export function userReferenceCollection(label: string): Collection {
  return {
    name: "@users",
    system: true,
    displayName: label,
    displayField: "label",
    folderId: null,
    mode: "multiple",
    primaryKey: { name: "id", type: "uuid" },
    timestamps: { createdAt: false, updatedAt: false },
    fields: [{ name: "label", type: "text", required: false, nullable: true }],
    access: {
      create: null,
      read: ["id", "label"],
      update: null,
      delete: false,
      structure: false,
    },
  };
}

export function userReferenceUrl(params: URLSearchParams): string {
  const query = new URLSearchParams();
  for (const key of ["q", "page", "limit"]) {
    if (params.has(key)) query.set(key, params.get(key)!);
  }
  const filter = params.get("filter");
  if (filter) {
    const group = JSON.parse(filter);
    const condition = group?.children?.[0];
    if (
      group?.logic !== "and" ||
      group.children.length !== 1 ||
      condition?.field !== "id" ||
      condition.op !== "in" ||
      !Array.isArray(condition.value)
    ) {
      throw new Error("Unsupported user reference filter");
    }
    query.set("ids", condition.value.join(","));
  }
  return `/api/users/references?${query}`;
}
