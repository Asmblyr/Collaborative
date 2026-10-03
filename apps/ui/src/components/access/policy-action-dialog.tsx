"use client";

import { useState } from "react";
import type { PermissionFilter } from "@asmblyr/contracts";
import { PortalContainerContext } from "@asmblyr/kit/ui/portal-container";
import { Button } from "@asmblyr/kit/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr/kit/ui/select";
import { EditorDialog } from "@/components/collections/editor-dialog";
import { PolicyConditionGroup } from "./policy-condition-group";
import {
  conditionIsValid,
  conditionSummary,
  newPermissionCondition,
  permissionFields,
} from "./policy-condition-model";
import { PolicyFieldsForm } from "./policy-fields-form";
import { type DraftGrant } from "./policy-draft";
import { actionName, type Action, type PolicyCollection } from "./types";

export function PolicyActionDialog({
  readOnly = false,
  collection,
  action,
  initial,
  policyName,
  onSave,
  onClose,
}: {
  readOnly?: boolean;
  collection: PolicyCollection;
  action: Action;
  initial?: DraftGrant;
  policyName?: string;
  onSave: (grant: DraftGrant | null) => void;
  onClose: () => void;
}) {
  const available = permissionFields(collection);
  const initialMode = initial
    ? initial.rowFilter
      ? "condition"
      : "all"
    : "none";
  const [mode, setMode] = useState(initialMode);
  const [fields, setFields] = useState(initial?.fields ?? ["*"]);
  const initialFilter: PermissionFilter = initial?.rowFilter ?? {
    logic: "and",
    children: [newPermissionCondition(available)],
  };
  const [filter, setFilter] = useState<PermissionFilter>(initialFilter);
  const [editFields, setEditFields] = useState(false);
  const valid = mode !== "condition" || conditionIsValid(filter, available);
  const dirty =
    mode !== initialMode ||
    JSON.stringify(fields) !== JSON.stringify(initial?.fields ?? ["*"]) ||
    (mode === "condition" &&
      JSON.stringify(filter) !== JSON.stringify(initialFilter));
  return (
    <EditorDialog
      open
      title={`${collection.displayName || collection.name} · ${actionName[action]}`}
      eyebrow={policyName || "Политика доступа"}
      hasUnsavedChanges={dirty}
      onClose={onClose}
      footer={(close) => (
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={close}
          >
            {readOnly ? "Закрыть" : "Отмена"}
          </Button>
          {!readOnly && (
            <Button
              type="button"
              disabled={
                !valid || (mode !== "none" && !fields.length) || editFields
              }
              onClick={() => {
                onSave(
                  mode === "none"
                    ? null
                    : {
                        collection: collection.name,
                        action,
                        fields: action === "delete" ? ["*"] : fields,
                        rowFilter: mode === "condition" ? filter : null,
                      },
                );
                close();
              }}
            >
              Применить
            </Button>
          )}
        </div>
      )}
    >
      {(container) => (
        <PortalContainerContext.Provider value={container}>
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <span className="text-sm font-semibold">Доступ</span>
              <Select
                disabled={readOnly}
                value={mode}
                onValueChange={setMode}
              >
                <SelectTrigger
                  aria-label="Доступ к записям"
                  className="w-60"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Нет доступа</SelectItem>
                  <SelectItem value="all">Все записи</SelectItem>
                  <SelectItem value="condition">По условию</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {mode === "condition" && (
              <div>
                <fieldset disabled={readOnly}>
                  <PolicyConditionGroup
                    value={filter}
                    fields={available}
                    onChange={setFilter}
                  />
                </fieldset>
                <div className="border-t pt-3 text-sm text-muted-foreground">
                  {valid
                    ? conditionSummary(filter, available)
                    : "Заполните значения условий, чтобы применить правило."}
                </div>
              </div>
            )}
            {mode === "all" && (
              <p className="text-sm text-muted-foreground">
                Действие доступно для всех записей коллекции.
              </p>
            )}
            {mode === "none" && (
              <p className="text-sm text-muted-foreground">
                Эта политика не разрешает выбранное действие.
              </p>
            )}
            {mode !== "none" && action !== "delete" && (
              <div className="border-t pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto justify-start gap-2 px-0 text-sm font-normal text-muted-foreground"
                  onClick={() => setEditFields(!editFields)}
                >
                  Доступные поля{" "}
                  <span className="text-foreground">
                    · {fields.includes("*") ? "Все" : fields.length}
                  </span>
                </Button>
                {editFields && (
                  <PolicyFieldsForm
                    collection={collection}
                    action={action}
                    readOnly={readOnly}
                    initialFields={fields}
                    onSave={(next) => {
                      setFields(next);
                      setEditFields(false);
                    }}
                    onClose={() => setEditFields(false)}
                  />
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {readOnly
                ? "Просмотр правила доступа."
                : "Изменения вступят в силу после сохранения политики."}
            </p>
          </div>
        </PortalContainerContext.Provider>
      )}
    </EditorDialog>
  );
}
