"use client";

import { useId, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { relationFilterDependencies } from "@asmblyr-collaborative/contracts";
import { RelationPicker } from "./relation-picker";
import { EditorDialog } from "@/components/collections/editor-dialog";
import { ItemForm } from "./item-form";
import { ItemFormActions } from "./item-form-actions";
import type { OpenRelated } from "./relation-picker";
import type { Collection, Item, ItemValue } from "./types";
import { useUiCopy } from "@/lib/ui-copy";

export function ItemCreateDialog({
  collection,
  catalog,
  pending,
  message,
  omitFields = [],
  description,
  title,
  onSave,
  onClose,
  onOpenRelated,
  initialValues,
  leadField,
  draftMode,
  extraDirty = false,
  onReferenceChange,
  formRevision = 0,
  conflictReview,
}: {
  collection: Collection;
  catalog: Collection[];
  pending: boolean;
  message: string;
  omitFields?: string[];
  description?: string;
  title?: string;
  onOpenRelated: OpenRelated;
  onSave: (
    values: Record<string, ItemValue>,
    close: () => void,
  ) => Promise<void>;
  onClose: (reason?: "navigation") => void;
  initialValues?: Item;
  leadField?: string;
  draftMode?: boolean;
  extraDirty?: boolean;
  onReferenceChange?: (field: string, value: string) => void;
  formRevision?: number;
  conflictReview?: ReactNode;
}) {
  const copy = useUiCopy();

  const formId = useId();
  const [uploading, setUploading] = useState(false);
  const [changedCount, setChangedCount] = useState(0);
  const [leadValue, setLeadValue] = useState(
    String(initialValues?.[leadField ?? ""] ?? ""),
  );
  const [step, setStep] = useState(
    leadField && !leadValue ? "choose" : "details",
  );
  const fields = collection.fields.filter(
    (field) =>
      field.type !== "alias" &&
      !omitFields.includes(field.name) &&
      (collection.access.create?.includes("*") ||
        collection.access.create?.includes(field.name)),
  );
  const lead = fields.find(
    (field) =>
      field.name === leadField &&
      field.relation?.kind === "m2o" &&
      (field.required || !field.nullable) &&
      field.defaultValue === undefined &&
      !fields.some(
        (f) =>
          f.presentation?.rules?.requiredWhen?.rules.some(
            (r) => r.field === field.name,
          ) ||
          (f.presentation?.relationFilter &&
            relationFilterDependencies(f.presentation.relationFilter).includes(
              field.name,
            )),
      ),
  );
  const choosing = Boolean(lead && step === "choose");

  return (
    <EditorDialog
      open
      size={
        collection.formLayout ||
        fields.some((f) => f.presentation?.interface === "repeater")
          ? "relation"
          : "default"
      }
      busy={pending || uploading}
      title={
        title ??
        (collection.mode === "single"
          ? copy("Создать объект")
          : copy("Новая запись"))
      }
      eyebrow={collection.displayName || collection.name}
      onClose={onClose}
      hasUnsavedChanges={changedCount > 0 || extraDirty || Boolean(leadValue)}
      footer={
        choosing ? (
          <Button
            disabled={!leadValue || pending || uploading}
            className="ml-auto"
            onClick={() => setStep("details")}
          >
            {copy("Далее ")}
            <ArrowRight />
          </Button>
        ) : (
          <ItemFormActions
            formId={formId}
            fields={fields}
            pending={pending || uploading}
            creating
            disabled={Boolean(conflictReview) || Boolean(lead && !leadValue)}
            label={
              draftMode ? copy("Добавить в черновик") : copy("Создать запись")
            }
          />
        )
      }
    >
      {(portalContainer, close) => (
        <div className="space-y-6">
          {conflictReview}
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
          {lead && (
            <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
              <p className="text-xs text-muted-foreground">
                {choosing
                  ? copy("Шаг 1 из 2 · Выбор записи")
                  : copy("Шаг 2 из 2 · Параметры")}
              </p>
              <p className="text-sm font-medium">
                {lead.presentation?.label || lead.name}
              </p>
              <RelationPicker
                field={lead}
                value={leadValue}
                onChange={(value) => {
                  setLeadValue(value);
                  onReferenceChange?.(lead.name, value);
                }}
                disabled={pending || Boolean(conflictReview)}
                catalog={catalog}
                portalContainer={portalContainer}
                onOpen={onOpenRelated}
              />
              {!choosing && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setStep("choose")}
                >
                  <ArrowLeft />
                  {copy("К выбору ")}
                </Button>
              )}
            </div>
          )}
          <div hidden={choosing}>
            <ItemForm
              key={formRevision}
              id={formId}
              embedded
              hideActions
              fields={fields.filter((field) => field !== lead)}
              aliasFields={collection.fields.filter(
                (field) => field.type === "alias",
              )}
              catalog={catalog}
              primaryKey={collection.primaryKey}
              formLayout={collection.formLayout}
              pending={pending || Boolean(conflictReview)}
              portalContainer={portalContainer}
              initialValues={initialValues}
              onDirtyChange={setChangedCount}
              onReferenceChange={onReferenceChange}
              onOpenRelated={onOpenRelated}
              onBusyChange={setUploading}
              onSave={async (values) => {
                if (lead && !leadValue) {
                  setStep("choose");
                  return;
                }
                await onSave(
                  { ...values, ...(lead ? { [lead.name]: leadValue } : {}) },
                  close,
                );
              }}
              onCancel={close}
            />
          </div>
          {message && (
            <p
              role="alert"
              className="text-sm text-destructive"
            >
              {copy(message)}
            </p>
          )}
        </div>
      )}
    </EditorDialog>
  );
}
