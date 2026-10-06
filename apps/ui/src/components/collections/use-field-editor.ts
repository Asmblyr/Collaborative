"use client";

import { useState, type FormEvent } from "react";
import { parseTags } from "@asmblyr-collaborative/contracts";
import { tagErrorMessage } from "@/components/items/tag-values";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api-request";
import type { CollectionField } from "@/components/items/types";
import type { DataFieldType } from "./field-type-picker";
import {
  defaultInput,
  defaultPayload,
  InvalidDefaultError,
} from "./field-default-value";
import { fieldChoicePayload } from "./field-choice-values";
import { defaultPresentation } from "./field-presentation-defaults";
import { useEditorDraft } from "./editor-lifecycle";
import { useUiCopy } from "@/lib/ui-copy";

export function useFieldEditor({
  collection,
  field,
  type,
  onSaved,
}: {
  collection: string;
  field?: CollectionField;
  type?: DataFieldType;
  onSaved: () => void;
}) {
  const copy = useUiCopy();

  const router = useRouter();
  const [name, setName] = useState(field?.name ?? "");
  const [required, setRequired] = useState(field?.required ?? false);
  const [nullable, setNullable] = useState(field?.nullable ?? true);
  const [hasDefault, setHasDefault] = useState(
    field?.defaultValue !== undefined,
  );
  const [defaultValue, setDefaultValue] = useState(
    defaultInput(field?.defaultValue, field?.type ?? "text"),
  );
  const [searchable, setSearchable] = useState(field?.searchable ?? true);
  const [searchPriority, setSearchPriority] = useState(
    field?.searchPriority ?? null,
  );
  const [indexed, setIndexed] = useState(field?.searchIndexed ?? false);
  const [relationSearchable, setRelationSearchable] = useState(
    field?.searchable ?? false,
  );
  const [presentation, setPresentation] = useState(() => {
    if (field?.presentation) {
      return field.presentation;
    }
    if (type === "select" || type === "multiselect") {
      return {
        ...defaultPresentation,
        interface: type,
        options: [{ value: "", label: "" }],
      };
    }
    if (type === "tags") {
      return { ...defaultPresentation, interface: "tags" as const };
    }
    return defaultPresentation;
  });
  const [created, setCreated] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  let selectedType: string | undefined = field?.type ?? type;
  if (selectedType === "select") selectedType = "text";
  if (selectedType === "multiselect" || selectedType === "tags") {
    selectedType = "json";
  }
  if (!selectedType) throw new Error(copy("Тип нового поля не выбран"));
  const resolvedType: string = selectedType;
  const textField = selectedType === "text" || selectedType === "email";
  const relationField = Boolean(field?.relation);
  const defaultChanged =
    field &&
    field.type !== "relation" &&
    (hasDefault !== (field.defaultValue !== undefined) ||
      (hasDefault &&
        defaultValue !== defaultInput(field.defaultValue, field.type)));
  const basicChanged =
    field?.type !== "alias" &&
    (!field ||
      required !== field.required ||
      nullable !== field.nullable ||
      defaultChanged);
  const searchChanged =
    textField &&
    (searchable !== (field?.searchable ?? true) ||
      indexed !== (field?.searchIndexed ?? false) ||
      searchPriority !== (field?.searchPriority ?? null));
  const relationSearchChanged =
    relationField &&
    (relationSearchable !== (field?.searchable ?? false) ||
      searchPriority !== (field?.searchPriority ?? null));
  const presentationChanged =
    JSON.stringify(presentation) !==
    JSON.stringify(field?.presentation ?? defaultPresentation);
  useEditorDraft(
    {
      name,
      required,
      nullable,
      hasDefault,
      defaultValue,
      searchable,
      searchPriority,
      indexed,
      relationSearchable,
      presentation,
    },
    pending,
  );
  const changed =
    created ||
    basicChanged ||
    searchChanged ||
    relationSearchChanged ||
    presentationChanged;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    try {
      const nextPresentation = fieldChoicePayload(
        presentation,
        resolvedType,
        copy,
      );
      let defaultSetting =
        resolvedType !== "relation" && hasDefault
          ? defaultPayload(resolvedType, defaultValue, copy)
          : null;
      if (
        hasDefault &&
        nextPresentation.interface === "tags" &&
        defaultSetting !== null
      ) {
        try {
          defaultSetting = parseTags(defaultSetting, required);
        } catch (error) {
          throw new InvalidDefaultError(tagErrorMessage(error, copy));
        }
      }
      if (hasDefault && nextPresentation.options) {
        if (
          required &&
          presentation.interface === "multiselect" &&
          Array.isArray(defaultSetting) &&
          !defaultSetting.length
        ) {
          throw new InvalidDefaultError(
            copy(
              "Для обязательного поля выберите хотя бы один вариант в default",
            ),
          );
        }
        const values =
          presentation.interface === "multiselect" &&
          Array.isArray(defaultSetting)
            ? defaultSetting
            : [defaultSetting];
        if (
          values.some(
            (v) => !nextPresentation.options?.some((o) => o.value === v),
          )
        )
          throw new InvalidDefaultError(
            copy("Default должен содержать только настроенные варианты"),
          );
      }
      const fieldName = field?.name ?? name;
      const path = `/api/collections/${encodeURIComponent(collection)}/fields/${encodeURIComponent(fieldName)}`;
      const definition =
        field || created
          ? {
              required,
              nullable,
              ...(defaultChanged || created
                ? { defaultValue: defaultSetting }
                : {}),
            }
          : {
              name,
              type: selectedType,
              required,
              nullable,
              ...(textField ? { searchable } : {}),
              ...(hasDefault ? { defaultValue: defaultSetting } : {}),
            };
      await apiRequest(
        `${path}/configuration`,
        field || created ? "PUT" : "POST",
        {
          ...(basicChanged ? { field: definition } : {}),
          presentation: nextPresentation,
          ...(textField ? { searchable } : {}),
          ...(relationField ? { relationSearchable } : {}),
          ...(textField || relationField ? { searchPriority } : {}),
        },
      );
      if (!field) setCreated(true);
      if (textField && indexed !== (field?.searchIndexed ?? false)) {
        try {
          await apiRequest(`${path}/search`, "PUT", { searchable, indexed });
        } catch (error) {
          setMessage(
            copy(
              "Настройки поля сохранены. Индекс поиска не обновлён: {{value0}}. Повторите сохранение.",
              {
                value0:
                  error instanceof Error
                    ? error.message
                    : copy("ошибка соединения"),
              },
            ),
          );
          router.refresh();
          return;
        }
      }
      onSaved();
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : copy("Не удалось связаться с сервером"),
      );
    } finally {
      setPending(false);
    }
  }

  return {
    name,
    setName,
    required,
    setRequired,
    nullable,
    setNullable,
    hasDefault,
    setHasDefault,
    defaultValue,
    setDefaultValue,
    searchable,
    setSearchable,
    searchPriority,
    setSearchPriority,
    indexed,
    setIndexed,
    relationSearchable,
    setRelationSearchable,
    presentation,
    setPresentation,
    created,
    pending,
    message,
    selectedType,
    textField,
    relationField,
    changed,
    submit,
  };
}
