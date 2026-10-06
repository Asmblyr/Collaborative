"use client";

import { useCallback, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Collection } from "@/components/items/types";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@asmblyr-collaborative/kit/ui/tabs";
import { CollectionDisplayFields } from "./collection-display-form";
import {
  CollectionMcpFields,
  CollectionNameField,
  CollectionVisibilityField,
} from "./collection-metadata-fields";
import { CollectionStateFields } from "./collection-state-fields";
import { CollectionTerms } from "@/components/terms/collection-terms";
import { SchemaTranslationsEditor } from "./schema-translations-editor";
import { useUiCopy } from "@/lib/ui-copy";
import { requestErrorMessage, requestJson } from "@/lib/http-request";

export function CollectionSettingsForm({
  collection,
  catalog,
  portalContainer,
  onSaved,
  onStateChange,
}: {
  collection: Collection;
  catalog: Collection[];
  portalContainer: HTMLElement | null;
  onSaved: () => void;
  onStateChange: (dirty: boolean, busy: boolean) => void;
}) {
  const copy = useUiCopy();

  const router = useRouter();
  const initial = {
    translations: collection.translations ?? {},
    displayName: collection.displayName ?? "",
    hidden: collection.hidden ?? false,
    field: collection.displayField ?? "$auto",
    template: collection.displayTemplate ?? "",
    enabled: collection.mcp?.enabled ?? true,
    description: collection.mcp?.description ?? "",
    state: collection.state ?? null,
  };
  const [tab, setTab] = useState("display");
  const [values, setValues] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [termsState, setTermsState] = useState({ dirty: false, busy: false });
  const onTermsState = useCallback(
    (dirty: boolean, busy: boolean) => setTermsState({ dirty, busy }),
    [],
  );
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  let saveHint = dirty
    ? copy("Есть несохранённые изменения")
    : copy("Настройки сохранены");
  if (termsState.dirty)
    saveHint = copy("Сначала сохраните условия терминов на вкладке MCP");
  function change(patch: Partial<typeof values>) {
    const next = { ...values, ...patch };
    setValues(next);
    onStateChange(JSON.stringify(next) !== JSON.stringify(initial), false);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (termsState.dirty || termsState.busy) return;
    const form = event.currentTarget as HTMLFormElement;
    if (!form.checkValidity()) {
      setTab("state");
      requestAnimationFrame(() => form.reportValidity());
      return;
    }
    setPending(true);
    setError("");
    onStateChange(dirty, true);
    try {
      await requestJson(
        `/api/collections/${encodeURIComponent(collection.name)}/settings`,
        "PATCH",
        {
          displayName: values.displayName,
          translations: values.translations,
          hidden: values.hidden,
          displayField: values.field === "$auto" ? null : values.field,
          displayTemplate: values.template || null,
          mcp: { enabled: values.enabled, description: values.description },
          ...(JSON.stringify(values.state) !== JSON.stringify(initial.state)
            ? { state: values.state }
            : {}),
        },
      );
      onStateChange(false, false);
      router.refresh();
      onSaved();
    } catch (cause) {
      setError(copy(requestErrorMessage(cause)));
      onStateChange(dirty, false);
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-6">
      <form
        onSubmit={save}
        noValidate
        className="space-y-6"
      >
        <Tabs
          value={tab}
          onValueChange={setTab}
          className="space-y-6"
        >
          <TabsList className="w-full">
            <TabsTrigger
              value="display"
              className="flex-1"
            >
              {copy("Отображение ")}
            </TabsTrigger>
            {collection.sourceKind !== "materialized-view" && (
              <TabsTrigger
                value="state"
                className="flex-1"
              >
                {copy("Состояние ")}
              </TabsTrigger>
            )}
            <TabsTrigger
              value="mcp"
              className="flex-1"
            >
              MCP
            </TabsTrigger>
          </TabsList>
          <TabsContent
            value="display"
            forceMount
            className="space-y-6 data-[state=inactive]:hidden"
          >
            <CollectionNameField
              name={collection.name}
              value={values.displayName}
              disabled={pending}
              onChange={(displayName) => change({ displayName })}
            />
            <CollectionVisibilityField
              hidden={values.hidden}
              disabled={pending}
              onChange={(hidden) => change({ hidden })}
            />
            <SchemaTranslationsEditor
              collection
              value={values.translations}
              disabled={pending}
              onChange={(translations) => change({ translations })}
            />
            <div className="border-t pt-6">
              <CollectionDisplayFields
                catalog={catalog}
                collection={collection}
                portalContainer={portalContainer}
                field={values.field}
                template={values.template}
                pending={pending}
                onFieldChange={(field) => change({ field })}
                onTemplateChange={(template) => change({ template })}
              />
            </div>
          </TabsContent>
          <TabsContent
            value="mcp"
            forceMount
            className="data-[state=inactive]:hidden"
          >
            <CollectionMcpFields
              enabled={values.enabled}
              description={values.description}
              disabled={pending}
              onEnabledChange={(enabled) => change({ enabled })}
              onDescriptionChange={(description) => change({ description })}
            />
          </TabsContent>
          {collection.sourceKind !== "materialized-view" && (
            <TabsContent
              value="state"
              forceMount
              className="data-[state=inactive]:hidden"
            >
              <CollectionStateFields
                collection={collection}
                value={values.state}
                disabled={pending}
                container={portalContainer}
                onChange={(state) => change({ state })}
              />
            </TabsContent>
          )}
        </Tabs>
        {error && (
          <p
            role="alert"
            className="text-sm text-destructive"
          >
            {copy(error)}
          </p>
        )}
        <div className="flex items-center gap-3 border-t pt-4">
          <Button
            type="submit"
            disabled={pending || !dirty || termsState.dirty || termsState.busy}
          >
            {pending ? copy("Сохранение…") : copy("Сохранить настройки")}
          </Button>
          <span className="text-xs text-muted-foreground">{saveHint}</span>
        </div>
      </form>
      <div hidden={tab !== "mcp"}>
        <CollectionTerms
          collection={collection}
          catalog={catalog}
          container={portalContainer}
          disabled={pending}
          onStateChange={onTermsState}
        />
      </div>
    </div>
  );
}
