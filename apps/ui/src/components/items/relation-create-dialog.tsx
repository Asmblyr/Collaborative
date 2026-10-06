"use client";

import { useRef, useState } from "react";
import { ItemEditorDialog } from "./item-editor-dialog";
import type { RecordDraft } from "./record-draft-model";
import type { Collection } from "./types";
import { useUiCopy } from "@/lib/ui-copy";

export function RelationCreateDialog({
  target,
  junction,
  omitFields,
  catalog,
  leadField,
  onDraft,
  onClose,
}: {
  target: Collection;
  junction: Collection;
  omitFields: string[];
  catalog: Collection[];
  leadField?: string;
  onDraft: (record: RecordDraft, link: RecordDraft) => void;
  onClose: () => void;
}) {
  const copy = useUiCopy();

  const [stage, setStage] = useState<"item" | "link">("item");
  const [record, setRecord] = useState<RecordDraft | null>(null);
  const completed = useRef(false);
  return stage === "item" ? (
    <ItemEditorDialog
      key="record"
      catalog={catalog}
      request={{
        collection: target.name,
        title: copy("Новая связанная запись"),
        leadField,
        draft: record ?? undefined,
        description: copy(
          "Сначала заполните запись, затем параметры связи. Всё сохранится вместе с основной карточкой.",
        ),
        onDraft: (value) => {
          setRecord(value);
          completed.current = true;
        },
      }}
      onClose={() => {
        if (completed.current) {
          completed.current = false;
          setStage("link");
        } else onClose();
      }}
    />
  ) : (
    <ItemEditorDialog
      key="link"
      catalog={catalog}
      request={{
        collection: junction.name,
        title: copy("Параметры новой связи"),
        omitFields,
        extraDirty: true,
        description: copy(
          "Последний шаг. Закрытие этого окна вернёт к новой записи.",
        ),
        onDraft: (link) => {
          onDraft(record!, link);
          completed.current = true;
        },
      }}
      onClose={() => {
        if (completed.current) onClose();
        else setStage("item");
      }}
    />
  );
}
