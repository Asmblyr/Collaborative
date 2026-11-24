"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { PermissionFilter } from "@asmblyr-collaborative/contracts";
import { PortalContainerContext } from "@asmblyr-collaborative/kit/ui/portal-container";
import { Badge } from "@asmblyr-collaborative/kit/ui/badge";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr-collaborative/kit/ui/select";
import { EditorDialog } from "@/components/ui/editor-dialog";
import { accessRequest } from "@/lib/access-request";
import { PolicyConditionGroup } from "./policy-condition-group";
import {
  conditionIsValid,
  conditionSummary,
  newPermissionCondition,
  permissionFields,
} from "./policy-condition-model";
import { PolicyFieldsForm } from "./policy-fields-form";
import { accessText } from "./access-helpers";
import { type DraftGrant } from "./policy-draft";
import { actionName, type Action, type PolicyCollection } from "./types";
import { useUiCopy } from "@/lib/ui-copy";

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
  const copy = useUiCopy();

  const available = permissionFields(collection, copy);
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
  const [preview, setPreview] = useState<{
    matchingCount: number;
    totalCount: number;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [previewNonce, setPreviewNonce] = useState(0);
  const valid = mode !== "condition" || conditionIsValid(filter, available);
  const filterKey = JSON.stringify(filter);

  useEffect(() => {
    if (mode !== "condition" || !valid) {
      return;
    }
    const controller = new AbortController();
    const parsedFilter = JSON.parse(filterKey) as PermissionFilter;
    const timer = window.setTimeout(() => {
      setPreviewLoading(true);
      setPreviewError(false);
      accessRequest<{
        data: { matchingCount: number; totalCount: number };
      }>(
        "/settings/policies/preview-condition",
        "POST",
        { collection: collection.name, condition: parsedFilter },
        controller.signal,
      )
        .then((result) => {
          if (!controller.signal.aborted) {
            setPreview(result.data);
            setPreviewLoading(false);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setPreviewError(true);
            setPreviewLoading(false);
          }
        });
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [mode, valid, collection.name, filterKey, previewNonce]);
  const dirty =
    mode !== initialMode ||
    JSON.stringify(fields) !== JSON.stringify(initial?.fields ?? ["*"]) ||
    (mode === "condition" &&
      JSON.stringify(filter) !== JSON.stringify(initialFilter));
  return (
    <EditorDialog
      open
      title={`${collection.displayName || collection.name} · ${copy(actionName[action])}`}
      eyebrow={policyName || copy("Политика доступа")}
      hasUnsavedChanges={dirty}
      onClose={onClose}
      nested
      footer={(requestClose, close) => (
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={requestClose}
          >
            {readOnly ? copy("Закрыть") : copy("Отмена")}
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
              {copy("Применить")}
            </Button>
          )}
        </div>
      )}
    >
      {(container) => (
        <PortalContainerContext.Provider value={container}>
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <span className="text-sm font-semibold">{copy("Доступ")}</span>
              <Select
                disabled={readOnly}
                value={mode}
                onValueChange={setMode}
              >
                <SelectTrigger
                  aria-label={copy("Доступ к записям")}
                  className="w-60"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{copy("Нет доступа")}</SelectItem>
                  <SelectItem value="all">{copy("Все записи")}</SelectItem>
                  <SelectItem value="condition">
                    {copy("По условию")}
                  </SelectItem>
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
                {valid ? (
                  <div className="mt-3 space-y-2 border-t pt-3">
                    <div className="text-sm text-muted-foreground">
                      {conditionSummary(filter, available, copy)}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="secondary"
                        role="status"
                        className="gap-1.5 font-normal tabular-nums"
                      >
                        {previewLoading
                          ? copy("Оцениваем охват условия…")
                          : previewError
                            ? copy("Не удалось рассчитать охват условия")
                            : preview
                              ? copy(
                                  "Охват условия: затронет {{value0}} из {{value1}} записей",
                                  {
                                    value0: preview.matchingCount,
                                    value1: preview.totalCount,
                                  },
                                )
                              : copy("Оцениваем охват условия…")}
                      </Badge>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="size-6"
                        disabled={previewLoading}
                        aria-label={copy("Обновить охват условия")}
                        title={copy("Обновить охват условия")}
                        onClick={() => setPreviewNonce((n) => n + 1)}
                      >
                        <RefreshCw
                          className={`size-3 ${previewLoading ? "animate-spin" : ""}`}
                        />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p
                    role="alert"
                    className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                  >
                    {accessText(
                      copy.locale,
                      "Заполните все обязательные значения условий, чтобы применить правило.",
                      "Fill in all required condition values to apply this rule.",
                    )}
                  </p>
                )}
              </div>
            )}
            {mode === "all" && (
              <p className="text-sm text-muted-foreground">
                {copy("Действие доступно для всех записей коллекции.")}
              </p>
            )}
            {mode === "none" && (
              <p className="text-sm text-muted-foreground">
                {copy("Эта политика не разрешает выбранное действие.")}
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
                  {copy("Доступные поля")}{" "}
                  <span className="text-foreground">
                    · {fields.includes("*") ? copy("Все") : fields.length}
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
                ? copy("Просмотр правила доступа.")
                : copy("Изменения вступят в силу после сохранения политики.")}
            </p>
          </div>
        </PortalContainerContext.Provider>
      )}
    </EditorDialog>
  );
}
