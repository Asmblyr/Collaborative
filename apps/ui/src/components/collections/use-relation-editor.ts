"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Collection } from "@/components/items/types";
import { useEditorDraft } from "./editor-lifecycle";
export type Kind = "m2o" | "o2m" | "m2m";
export type DeleteAction = "restrict" | "setNull" | "setDefault" | "cascade";
export type Section = "basic" | "structure" | "behavior";
type FormIssue = { section: Section; id: string; message: string };
const validName = (value: string) => value.length <= 63 && /^[a-z][a-z0-9_]*$/.test(value);

export function useRelationEditor(
  collection: string,
  collections: Collection[],
  kind: Kind,
  onSaved: () => void,
) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const focusField = useRef<string | null>(null);
  const [section, setSection] = useState<Section>("basic");
  const [name, setName] = useState("");
  const [targetCollection, setTargetCollection] = useState("");
  const [reverseField, setReverseField] = useState("");
  const [foreignKey, setForeignKey] = useState("");
  const [reuseExisting, setReuseExisting] = useState(false);
  const [junctionCollection, setJunctionCollection] = useState("");
  const [sourceKey, setSourceKey] = useState("");
  const [targetKey, setTargetKey] = useState("");
  const [allowDuplicates, setAllowDuplicates] = useState(false);
  const [sourceOnDelete, setSourceOnDelete] = useState<"restrict" | "cascade">("cascade");
  const [targetOnDelete, setTargetOnDelete] = useState<"restrict" | "cascade">("cascade");
  const [required, setRequired] = useState(false);
  const [nullable, setNullable] = useState(true);
  const [onDelete, setOnDelete] = useState<DeleteAction>("restrict");
  const [defaultValue, setDefaultValue] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  useEditorDraft(
    {
      name,
      targetCollection,
      reverseField,
      foreignKey,
      reuseExisting,
      junctionCollection,
      sourceKey,
      targetKey,
      allowDuplicates,
      sourceOnDelete,
      targetOnDelete,
      required,
      nullable,
      onDelete,
      defaultValue,
    },
    pending,
  );
  const target = collections.find((entry) => entry.name === targetCollection);
  const existingKeys =
    target?.fields.filter(
      (field) =>
        field.type === "relation" &&
        field.relation?.kind === "m2o" &&
        field.relation.collection === collection,
    ) ?? [];
  const junctionName = junctionCollection || `${collection}_${targetCollection}`;
  const sourceKeyName =
    sourceKey || (collection === targetCollection ? "source_id" : `${collection}_id`);
  const targetKeyName =
    targetKey || (collection === targetCollection ? "target_id" : `${targetCollection}_id`);

  useEffect(() => {
    const id = focusField.current;
    if (!id) return;
    const frame = requestAnimationFrame(() => {
      formRef.current?.querySelector<HTMLElement>(`#${id}`)?.focus();
      if (focusField.current === id) focusField.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [section]);

  function validate(): FormIssue | null {
    if (!validName(name))
      return { section: "basic", id: "relation-name", message: "Введите корректное имя поля" };
    if (!targetCollection)
      return { section: "basic", id: "relation-target", message: "Выберите связанную коллекцию" };
    if (kind !== "o2m" && reverseField && !validName(reverseField)) {
      return { section: "basic", id: "relation-reverse", message: "Проверьте имя обратного поля" };
    }
    if (kind === "o2m") {
      if (reuseExisting && !foreignKey) {
        return {
          section: "structure",
          id: "relation-existing-key",
          message: "Выберите существующий внешний ключ",
        };
      }
      if (!reuseExisting && !validName(foreignKey || `${collection}_id`)) {
        return {
          section: "structure",
          id: "relation-foreign-key",
          message: "Проверьте имя внешнего ключа",
        };
      }
    }
    if (kind === "m2m") {
      for (const [id, value] of [
        ["relation-junction", junctionName],
        ["relation-source-key", sourceKeyName],
        ["relation-target-key", targetKeyName],
      ]) {
        if (!validName(value))
          return {
            section: "structure",
            id,
            message: "Проверьте имена промежуточной коллекции и ключей",
          };
      }
      if (sourceKeyName === targetKeyName) {
        return {
          section: "structure",
          id: "relation-target-key",
          message: "Ключи промежуточной коллекции должны различаться",
        };
      }
    }
    if (
      kind !== "m2m" &&
      !(kind === "o2m" && reuseExisting) &&
      onDelete === "setDefault" &&
      !defaultValue.trim()
    ) {
      return {
        section: "behavior",
        id: "relation-default",
        message: "Укажите ID записи по умолчанию",
      };
    }
    return null;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const issue = validate();
    if (issue) {
      focusField.current = issue.id;
      if (section === issue.section) {
        requestAnimationFrame(() => {
          formRef.current?.querySelector<HTMLElement>(`#${issue.id}`)?.focus();
          if (focusField.current === issue.id) focusField.current = null;
        });
      } else {
        setSection(issue.section);
      }
      setMessage(issue.message);
      return;
    }
    setPending(true);
    setMessage("");
    const keySettings = {
      required,
      nullable,
      onDelete,
      ...(onDelete === "setDefault" ? { defaultValue } : {}),
    };
    let payload: Record<string, unknown>;
    switch (kind) {
      case "m2o":
        payload = {
          kind,
          name,
          targetCollection,
          reverseField: reverseField || undefined,
          ...keySettings,
        };
        break;
      case "o2m":
        payload = {
          kind,
          name,
          targetCollection,
          foreignKey: foreignKey || `${collection}_id`,
          reuseExisting,
          ...(reuseExisting ? {} : keySettings),
        };
        break;
      case "m2m":
        payload = {
          kind,
          name,
          targetCollection,
          junctionCollection: junctionName,
          sourceKey: sourceKeyName,
          targetKey: targetKeyName,
          reverseField: reverseField || undefined,
          allowDuplicates,
          sourceOnDelete,
          targetOnDelete,
        };
        break;
    }
    try {
      const response = await fetch(`/api/collections/${encodeURIComponent(collection)}/relations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const result = (await response.json()) as { message?: string };
        setMessage(result.message ?? "Не удалось создать связь");
        return;
      }
      onSaved();
      router.refresh();
    } catch {
      setMessage("Не удалось связаться с сервером");
    } finally {
      setPending(false);
    }
  }

  return {
    section,
    setSection,
    name,
    setName,
    targetCollection,
    setTargetCollection,
    reverseField,
    setReverseField,
    foreignKey,
    setForeignKey,
    reuseExisting,
    setReuseExisting,
    junctionCollection,
    setJunctionCollection,
    sourceKey,
    setSourceKey,
    targetKey,
    setTargetKey,
    allowDuplicates,
    setAllowDuplicates,
    sourceOnDelete,
    setSourceOnDelete,
    targetOnDelete,
    setTargetOnDelete,
    required,
    setRequired,
    nullable,
    setNullable,
    onDelete,
    setOnDelete,
    defaultValue,
    setDefaultValue,
    pending,
    message,
    setMessage,
    formRef,
    existingKeys,
    junctionName,
    sourceKeyName,
    targetKeyName,
    submit,
  };
}
export type RelationEditor = ReturnType<typeof useRelationEditor>;
