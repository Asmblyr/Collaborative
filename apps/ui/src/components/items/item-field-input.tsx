"use client";

import type { ComponentProps } from "react";
import { PluginUiHost as FieldBoundary } from "@/components/plugins/ui-host";
import {
  PortalContainerContext,
  usePortalContainer,
} from "@asmblyr-collaborative/kit/ui/portal-container";
import { useFieldInterfaces } from "@/components/plugins/field-registry";
import { BuiltinFieldInput } from "./builtin-field-input";
import { useUiCopy } from "@/lib/ui-copy";

export function ItemFieldInput(
  props: ComponentProps<typeof BuiltinFieldInput>,
) {
  const copy = useUiCopy();

  const inheritedContainer = usePortalContainer();
  const { field, id, value, disabled, required, onChange } = props;
  const presentation = field.presentation;
  const extension = presentation?.extension;
  const definition = useFieldInterfaces(field.type).find(
    (entry) => entry.id === extension?.id,
  );
  const fallback = <BuiltinFieldInput {...props} />;

  if (!extension || !presentation || presentation.sensitive) {
    return fallback;
  }

  const unavailable = (
    <div className="space-y-2">
      {fallback}
      <p className="text-xs text-muted-foreground">
        {copy(
          "Редактор расширения недоступен. Значение можно изменить обычным полем. ",
        )}
      </p>
    </div>
  );

  if (!definition) {
    return unavailable;
  }

  const Editor = definition.editor;
  return (
    <FieldBoundary
      key={extension.id}
      fallback={unavailable}
    >
      <PortalContainerContext.Provider
        value={props.container ?? inheritedContainer}
      >
        <Editor
          id={id}
          label={presentation.label || field.name}
          value={value}
          options={extension.options}
          disabled={disabled}
          required={required ?? false}
          placeholder={presentation.placeholder}
          describedBy={presentation.description ? `${id}-help` : undefined}
          onChange={(next) => {
            if (!disabled) {
              onChange(next);
            }
          }}
        />
      </PortalContainerContext.Provider>
    </FieldBoundary>
  );
}
