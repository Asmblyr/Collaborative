"use client";
import { useEffect, useState } from "react";
import type {
  SystemCollection,
  SystemCollectionRecord,
} from "@asmblyr-collaborative/contracts";
import { ItemForm } from "@/components/items/item-form";
import type { Collection } from "@/components/items/types";
import { useLocalizedCatalog } from "@/components/items/use-localized-catalog";
import { apiRequest } from "@/lib/api-request";
import { useUiCopy } from "@/lib/ui-copy";
import { useEditorState } from "./editor-lifecycle";
import {
  systemCollectionModel,
  systemCollectionLabels,
} from "./system-collection-model";

export function SystemRecordFields({
  collection,
  id,
  catalog,
  container,
  onCancel,
}: {
  collection: SystemCollection;
  id: string;
  catalog: Collection[];
  container: HTMLElement | null;
  onCancel: () => void;
}) {
  const copy = useUiCopy();
  const [record, setRecord] = useState<SystemCollectionRecord | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dirty, setDirty] = useState(0);
  const [revision, setRevision] = useState(0);
  const endpoint = `/api/system-collections/${collection.name}/records/${encodeURIComponent(id)}`;
  useEditorState(dirty > 0, pending || uploading);
  useEffect(() => {
    let active = true;
    apiRequest<SystemCollectionRecord>(endpoint)
      .then((data) => {
        if (active) {
          setRecord(data);
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
  }, [endpoint]);
  const [localized] = useLocalizedCatalog([
    systemCollectionModel(
      collection,
      copy(systemCollectionLabels[collection.name]),
    ),
  ]);
  const fields = localized.fields.filter((field) => !field.managed);
  return (
    <div className="space-y-4">
      {error && (
        <p
          role="alert"
          className="text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {!record && !error && (
        <p
          role="status"
          className="text-sm text-muted-foreground"
        >
          {copy("Загрузка…")}
        </p>
      )}
      {record && (
        <>
          <div>
            <h3 className="font-medium break-words">{record.label}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {copy("Здесь редактируются только дополнительные поля.")}
            </p>
          </div>
          <ItemForm
            key={`${id}:${revision}`}
            fields={fields}
            catalog={catalog}
            primaryKey={{ name: "id", type: "uuid" }}
            item={{ ...record.values, id: record.id }}
            pending={pending}
            portalContainer={container}
            onDirtyChange={setDirty}
            onBusyChange={setUploading}
            onCancel={onCancel}
            onSave={async (values) => {
              setPending(true);
              try {
                const result = await apiRequest<SystemCollectionRecord>(
                  endpoint,
                  "PATCH",
                  { values },
                );
                setRecord(result);
                setDirty(0);
                setRevision((value) => value + 1);
              } finally {
                setPending(false);
              }
            }}
          />
        </>
      )}
    </div>
  );
}
