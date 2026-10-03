"use client";

import { useState } from "react";
import type { PolicyCollection } from "./types";
import { Button } from "@asmblyr/kit/ui/button";
import { Checkbox } from "@asmblyr/kit/ui/checkbox";
import { actionName, type Action } from "./types";

export function PolicyFieldsForm({
  readOnly = false,
  collection,
  action,
  initialFields,
  onSave,
  onClose,
}: {
  readOnly?: boolean;
  collection: PolicyCollection;
  action: Exclude<Action, "delete">;
  initialFields: string[];
  onSave: (fields: string[]) => void;
  onClose: () => void;
}) {
  const [fields, setFields] = useState<string[]>(initialFields);
  const available = [
    ...new Set([
      collection.primaryKey.name,
      ...(collection.timestamps.createdAt ? ["created_at"] : []),
      ...(collection.timestamps.updatedAt ? ["updated_at"] : []),
      ...collection.fields
        .filter((field) => action === "read" || field.type !== "alias")
        .map((field) => field.name),
    ]),
  ];

  function toggle(field: string, checked: boolean) {
    if (field === "*") {
      setFields(checked ? ["*"] : []);
      return;
    }
    setFields((current) =>
      checked
        ? [...current.filter((value) => value !== "*"), field]
        : current.filter((value) => value !== field),
    );
  }

  function save() {
    if (fields.length > 0) {
      onSave([...fields].sort());
    }
  }

  return (
    <div className="space-y-4 border-t bg-muted/20 px-4 py-4">
      <div>
        <p className="font-medium">
          {collection.displayName || collection.name} · {actionName[action]} ·
          поля
        </p>
        <p className="text-xs text-muted-foreground">
          Эти поля будут доступны только для выбранного действия.
        </p>
      </div>
      <div className="grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2">
        {["*", ...available].map((field) => (
          <label
            key={field}
            className="flex items-center gap-2 text-sm"
          >
            <Checkbox
              disabled={readOnly}
              checked={fields.includes(field)}
              onCheckedChange={(checked) => toggle(field, checked === true)}
            />
            <span>{field === "*" ? "Все поля, включая новые" : field}</span>
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        {!readOnly && (
          <Button
            type="button"
            size="sm"
            disabled={fields.length === 0}
            onClick={save}
          >
            Применить поля
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onClose}
        >
          {readOnly ? "Закрыть" : "Отмена"}
        </Button>
      </div>
    </div>
  );
}
