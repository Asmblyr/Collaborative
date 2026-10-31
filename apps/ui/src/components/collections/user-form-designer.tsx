"use client";

import { useEffect, useState } from "react";
import type {
  UserFormConfiguration,
  UserFieldSelfAccess,
} from "@asmblyr-collaborative/contracts";
import type { Collection } from "@/components/items/types";
import { apiRequest } from "@/lib/api-request";
import { useUiCopy } from "@/lib/ui-copy";
import { useEditorState } from "@/components/ui/editor-lifecycle";
import { CollectionFormDesigner } from "./collection-form-designer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr-collaborative/kit/ui/select";

export function UserFormDesigner({
  model,
  catalog,
  container,
  onSaved,
}: {
  model: Collection;
  catalog: Collection[];
  container: HTMLElement | null;
  onSaved: () => void;
}) {
  const copy = useUiCopy();
  const [config, setConfig] = useState<UserFormConfiguration | null>(null);
  const [selfAccess, setSelfAccess] = useState<
    Record<string, UserFieldSelfAccess>
  >({});
  const [error, setError] = useState("");
  useEditorState(
    JSON.stringify(selfAccess) !== JSON.stringify(config?.selfAccess ?? {}),
    false,
  );
  useEffect(() => {
    let active = true;
    apiRequest<UserFormConfiguration>("/api/system-collections/users/form")
      .then((next) => {
        if (active) {
          setConfig(next);
          setSelfAccess(next.selfAccess);
        }
      })
      .catch((cause) => {
        if (active) {
          setError((cause as Error).message);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  if (error) {
    return <p role="alert">{error}</p>;
  }
  if (!config) {
    return <p role="status">{copy("Загрузка…")}</p>;
  }
  return (
    <CollectionFormDesigner
      collection={{
        ...model,
        fields: config.fields,
        formLayout: config.layout,
      }}
      catalog={catalog}
      container={container}
      plainGroups
      onSaved={onSaved}
      onSave={async (layout) => {
        await apiRequest("/api/system-collections/users/form", "PUT", {
          layout,
          selfAccess,
        });
      }}
      renderFieldSettings={(name, disabled) => {
        const field = config.fields.find((entry) => entry.name === name);
        if (
          !field ||
          field.name === "email" ||
          field.name.startsWith("@display:")
        ) {
          return null;
        }
        return (
          <div className="mt-5 space-y-2 border-t pt-4">
            <label
              htmlFor="user-field-self-access"
              className="text-sm font-medium"
            >
              {copy("Доступ владельца профиля")}
            </label>
            <Select
              value={selfAccess[name] ?? (field.managed ? "read" : "none")}
              disabled={disabled}
              onValueChange={(value) =>
                setSelfAccess((current) => {
                  const next = { ...current };
                  if (value === "none") {
                    delete next[name];
                  } else {
                    next[name] = value as UserFieldSelfAccess;
                  }
                  return next;
                })
              }
            >
              <SelectTrigger id="user-field-self-access">
                <SelectValue />
              </SelectTrigger>
              <SelectContent container={container}>
                {!field.managed && (
                  <SelectItem value="none">{copy("Не показывать")}</SelectItem>
                )}
                <SelectItem value="read">{copy("Только просмотр")}</SelectItem>
                <SelectItem value="write">
                  {copy("Просмотр и редактирование")}
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {copy(
                "Действует только для собственного профиля. Доступ к связанным записям определяется их политиками.",
              )}
            </p>
          </div>
        );
      }}
    />
  );
}
