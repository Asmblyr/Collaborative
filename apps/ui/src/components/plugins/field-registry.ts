"use client";

import { useUiPlugins } from "./registry";

export function useFieldInterfaces(type: string) {
  return useUiPlugins().flatMap((plugin) =>
    (plugin.definition.fieldInterfaces ?? [])
      .filter((field) => field.types.some((supported) => supported === type))
      .map((field) => ({ ...field, id: `${plugin.namespace}:${field.id}` })),
  );
}
