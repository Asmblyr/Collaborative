"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { UserProfileExtension } from "@asmblyr-collaborative/contracts";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { useEditorState } from "@/components/ui/editor-lifecycle";
import { ItemForm } from "@/components/items/item-form";
import { ItemEditorDialog } from "@/components/items/item-editor-dialog";
import type { RecordEditorRequest } from "@/components/items/record-editor-types";
import type { Collection, Item } from "@/components/items/types";
import { useLocalizedCatalog } from "@/components/items/use-localized-catalog";
import { apiRequest } from "@/lib/api-request";
import { useUiCopy } from "@/lib/ui-copy";

export function ProfileExtensionFields({
  userId,
  endpoint = "/api/users/me/extension",
  readOnly = false,
  container,
}: {
  userId: string;
  endpoint?: string;
  readOnly?: boolean;
  container?: HTMLElement | null;
}) {
  const copy = useUiCopy();
  const [extension, setExtension] = useState<UserProfileExtension<Item> | null>(
    null,
  );
  const [catalog, setCatalog] = useState<Collection[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [changedCount, setChangedCount] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [formRevision, setFormRevision] = useState(0);
  const [record, setRecord] = useState<RecordEditorRequest | null>(null);
  const localized = useLocalizedCatalog(catalog);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const loadedEndpointRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    dirtyRef.current = !extension?.exists && changedCount > 0;
  }, [changedCount, extension?.exists]);

  useEditorState(!extension?.exists && changedCount > 0, pending || uploading);
  useEffect(() => {
    const controller = new AbortController();
    apiRequest<UserProfileExtension<Item> | null>(
      endpoint,
      "GET",
      undefined,
      controller.signal,
    )
      .then(
        async (next) =>
          [
            next,
            next
              ? await apiRequest<Collection[]>(
                  "/api/collections",
                  "GET",
                  undefined,
                  controller.signal,
                )
              : [],
          ] as const,
      )
      .then(([next, collections]) => {
        if (controller.signal.aborted || savingRef.current) {
          return;
        }
        const initialLoad = loadedEndpointRef.current !== endpoint;
        if (!initialLoad && dirtyRef.current) {
          setCatalog(collections);
          return;
        }
        loadedEndpointRef.current = endpoint;
        setExtension(next);
        setCatalog(collections);
        setError("");
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      });
    return () => {
      controller.abort();
    };
  }, [endpoint, revision]);
  const collection = localized.find(
    (entry) => entry.name === extension?.collection,
  );
  if (!collection || !extension) {
    return error ? (
      <p
        role="alert"
        className="mt-5 text-sm text-destructive"
      >
        {error}
      </p>
    ) : null;
  }
  const permits = (grant: string[] | null, field: string) =>
    Boolean(grant?.includes("*") || grant?.includes(field));
  const writable = extension.exists
    ? collection.access.update
    : collection.access.create;
  const fields = collection.fields.filter(
    (field) =>
      field.type !== "alias" &&
      (permits(collection.access.read, field.name) ||
        (!readOnly && !extension.exists && permits(writable, field.name))),
  );
  return (
    <section className="mt-6 space-y-4 border-t pt-5">
      <div>
        <h3 className="font-medium">{copy("Дополнительные данные")}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {collection.displayName || collection.name}
        </p>
      </div>
      {extension.exists ? (
        <Button
          size="sm"
          type="button"
          variant="outline"
          onClick={() => setRecord({ collection: collection.name, id: userId })}
        >
          {copy("Открыть данные профиля")}
        </Button>
      ) : (
        <ItemForm
          key={`${userId}-${formRevision}`}
          fields={fields}
          formLayout={collection.formLayout}
          catalog={localized}
          primaryKey={collection.primaryKey}
          pending={pending}
          preview={readOnly || !writable}
          embedded
          allowUnchanged
          onDirtyChange={(count) => {
            dirtyRef.current = count > 0;
            setChangedCount(count);
          }}
          onBusyChange={setUploading}
          portalContainer={container}
          readOnlyFields={fields
            .filter((field) => !permits(writable, field.name))
            .map((field) => field.name)}
          onOpenRelated={(name, id) => setRecord({ collection: name, id })}
          onCancel={() => {
            dirtyRef.current = false;
            setChangedCount(0);
            setFormRevision((value) => value + 1);
            setRevision((value) => value + 1);
          }}
          onSave={async (values) => {
            savingRef.current = true;
            setPending(true);
            try {
              const result = await apiRequest<UserProfileExtension<Item>>(
                endpoint,
                "PATCH",
                { collection: collection.name, values },
              );
              dirtyRef.current = false;
              setChangedCount(0);
              setExtension(result);
              setFormRevision((value) => value + 1);
            } finally {
              savingRef.current = false;
              setPending(false);
            }
          }}
        />
      )}
      {record && (
        <ItemEditorDialog
          request={record}
          catalog={
            readOnly
              ? localized.map((entry) => ({
                  ...entry,
                  access: {
                    ...entry.access,
                    create: null,
                    update: null,
                    delete: false,
                  },
                }))
              : localized
          }
          onClose={() => setRecord(null)}
          onChanged={() => setRevision((value) => value + 1)}
        />
      )}
    </section>
  );
}
