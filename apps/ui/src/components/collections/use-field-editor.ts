"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api-request";
import type { CollectionField } from "@/components/items/types";
import type { DataFieldType } from "./field-type-picker";
import { defaultInput, defaultPayload, InvalidDefaultError } from "./field-default-value";
import { defaultPresentation } from "./field-presentation-defaults";
import { useEditorDraft } from "./editor-lifecycle";

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
  const router = useRouter();
  const [name, setName] = useState(field?.name ?? "");
  const [required, setRequired] = useState(field?.required ?? false);
  const [nullable, setNullable] = useState(field?.nullable ?? true);
  const [hasDefault, setHasDefault] = useState(field?.defaultValue !== undefined);
  const [defaultValue, setDefaultValue] = useState(
    defaultInput(field?.defaultValue, field?.type ?? "text"),
  );
  const [searchable, setSearchable] = useState(field?.searchable ?? true);
  const [indexed, setIndexed] = useState(field?.searchIndexed ?? false);
  const [relationSearchable, setRelationSearchable] = useState(field?.searchable ?? false);
  const [presentation, setPresentation] = useState(
    field?.presentation ?? {
      ...defaultPresentation,
      ...(type === "select" || type === "multiselect"
        ? { interface: type, options: [{ value: "", label: "" }] }
        : {}),
    },
  );
  const [created, setCreated] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  let selectedType: string | undefined = field?.type ?? type;
  if (selectedType === "select") selectedType = "text";
  if (selectedType === "multiselect") selectedType = "json";
  if (!selectedType) throw new Error("Тип нового поля не выбран");
  const resolvedType: string = selectedType;
  const textField = selectedType === "text" || selectedType === "email";
  const relationField = Boolean(field?.relation);
  const defaultChanged =
    field &&
    field.type !== "relation" &&
    (hasDefault !== (field.defaultValue !== undefined) ||
      (hasDefault && defaultValue !== defaultInput(field.defaultValue, field.type)));
  const basicChanged =
    field?.type !== "alias" &&
    (!field || required !== field.required || nullable !== field.nullable || defaultChanged);
  const searchChanged =
    textField &&
    (searchable !== (field?.searchable ?? true) || indexed !== (field?.searchIndexed ?? false));
  const relationSearchChanged =
    relationField && relationSearchable !== (field?.searchable ?? false);
  const presentationChanged =
    JSON.stringify(presentation) !== JSON.stringify(field?.presentation ?? defaultPresentation);
  useEditorDraft(
    {
      name,
      required,
      nullable,
      hasDefault,
      defaultValue,
      searchable,
      indexed,
      relationSearchable,
      presentation,
    },
    pending,
  );
  const changed =
    created || basicChanged || searchChanged || relationSearchChanged || presentationChanged;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    try {
      if (presentation.interface === "select" || presentation.interface === "multiselect") {
        const options = presentation.options ?? [];
        if (
          !options.length ||
          options.some((o) => !o.value.trim() || !o.label.trim()) ||
          new Set(options.map((o) => o.value)).size !== options.length
        ) {
          throw new InvalidDefaultError(
            "Задайте непустые, уникальные значения и подписи вариантов во вкладке «Отображение»",
          );
        }
      }
      const defaultSetting =
        resolvedType !== "relation" && hasDefault
          ? defaultPayload(resolvedType, defaultValue)
          : null;
      if (hasDefault && presentation.options) {
        if (
          required &&
          presentation.interface === "multiselect" &&
          Array.isArray(defaultSetting) &&
          !defaultSetting.length
        ) {
          throw new InvalidDefaultError(
            "Для обязательного поля выберите хотя бы один вариант в default",
          );
        }
        const values =
          presentation.interface === "multiselect" && Array.isArray(defaultSetting)
            ? defaultSetting
            : [defaultSetting];
        if (values.some((v) => !presentation.options?.some((o) => o.value === v)))
          throw new InvalidDefaultError("Default должен содержать только настроенные варианты");
      }
      const fieldName = field?.name ?? name;
      const path = `/api/collections/${encodeURIComponent(collection)}/fields/${encodeURIComponent(fieldName)}`;
      const definition =
        field || created
          ? {
              required,
              nullable,
              ...(defaultChanged || created ? { defaultValue: defaultSetting } : {}),
            }
          : {
              name,
              type: selectedType,
              required,
              nullable,
              ...(textField ? { searchable } : {}),
              ...(hasDefault ? { defaultValue: defaultSetting } : {}),
            };
      await apiRequest(`${path}/configuration`, field || created ? "PUT" : "POST", {
        ...(basicChanged ? { field: definition } : {}),
        presentation,
        ...(textField ? { searchable } : {}),
        ...(relationField ? { relationSearchable } : {}),
      });
      if (!field) setCreated(true);
      if (textField && indexed !== (field?.searchIndexed ?? false)) {
        try {
          await apiRequest(`${path}/search`, "PUT", { searchable, indexed });
        } catch (error) {
          setMessage(
            `Настройки поля сохранены. Индекс поиска не обновлён: ${error instanceof Error ? error.message : "ошибка соединения"}. Повторите сохранение.`,
          );
          router.refresh();
          return;
        }
      }
      onSaved();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось связаться с сервером");
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
