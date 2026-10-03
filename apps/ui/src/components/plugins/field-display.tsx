"use client";

import type { FieldExtension } from "@asmblyr/contracts";
import type { ReactNode } from "react";
import { PluginUiHost as FieldBoundary } from "./ui-host";
import { useFieldInterfaces } from "./field-registry";

export function PluginFieldDisplay({
  extension,
  type,
  value,
  fallback,
}: {
  extension: FieldExtension;
  type: string;
  value: unknown;
  fallback: ReactNode;
}) {
  const definition = useFieldInterfaces(type).find(
    (entry) => entry.id === extension.id,
  );
  const Display = definition?.display;

  if (
    !Display ||
    (value !== null && value !== undefined && typeof value !== "string")
  ) {
    return fallback;
  }

  return (
    <FieldBoundary
      key={extension.id}
      fallback={fallback}
    >
      <Display
        value={value ?? null}
        options={extension.options}
      />
    </FieldBoundary>
  );
}
