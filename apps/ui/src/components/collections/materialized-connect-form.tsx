"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { MaterializedViewCandidate } from "@asmblyr-collaborative/contracts";
import type { Collection, CollectionFolder } from "@/components/items/types";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr-collaborative/kit/ui/select";
import { CollectionDisplayFields } from "./collection-display-form";
import { apiRequest } from "@/lib/api-request";
import { useUiCopy } from "@/lib/ui-copy";
import { useWorkspace } from "@/components/workspaces/workspace-provider";
import { useEditorState } from "./editor-lifecycle";

export function MaterializedConnectForm({
  view,
  catalog,
  folders,
  container,
  onSaved,
  onBack,
  onCancel,
}: {
  view: MaterializedViewCandidate;
  catalog: Collection[];
  folders: CollectionFolder[];
  container: HTMLElement | null;
  onSaved: () => void;
  onBack: () => void;
  onCancel: () => void;
}) {
  const copy = useUiCopy();
  const router = useRouter();
  const workspace = useWorkspace();
  const [name, setName] = useState("");
  const [key, setKey] = useState(view.keys[0].name);
  const [folder, setFolder] = useState("$none");
  const [field, setField] = useState("$auto");
  const [template, setTemplate] = useState("");
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEditorState(
    Boolean(
      name ||
        key !== view.keys[0].name ||
        template ||
        field !== "$auto" ||
        folder !== "$none" ||
        Object.values(labels).some(Boolean),
    ),
    pending,
  );
  const collection: Collection = {
    name: view.name,
    sourceKind: "materialized-view",
    mode: "multiple",
    primaryKey: view.keys.find((entry) => entry.name === key)!,
    timestamps: { createdAt: false, updatedAt: false },
    folderId: null,
    fields: view.fields
      .filter((entry) => entry.name !== key)
      .map((entry) => ({
        name: entry.name,
        type: entry.type!,
        required: false,
        nullable: entry.nullable,
      })),
    access: {
      read: ["*"],
      create: null,
      update: null,
      delete: false,
      structure: true,
    },
  };
  async function save(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await apiRequest("/api/materialized-views", "POST", {
        name: view.name,
        primaryKey: key,
        displayName: name || null,
        folderId: folder === "$none" ? null : folder,
        workspaceId: workspace?.active?.id ?? null,
        displayField: field === "$auto" ? null : field,
        displayTemplate: template || null,
        presentations: Object.fromEntries(
          Object.entries(labels)
            .filter(([column, label]) => column !== key && label)
            .map(([column, label]) => [column, { label }]),
        ),
      });
      await workspace?.reload().catch(() => undefined);
      router.refresh();
      onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : copy("Не удалось подключить представление"),
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <form
      onSubmit={save}
      className="space-y-5"
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ml-2"
        onClick={onBack}
        disabled={pending}
      >
        <ArrowLeft aria-hidden="true" />
        {copy("К выбору представления")}
      </Button>
      <div>
        <p className="font-mono text-sm">{view.name}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {copy(
            "Структура и данные управляются внешним процессом. Здесь настраивается отображение.",
          )}
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="mv-display-name">{copy("Название")}</Label>
        <Input
          id="mv-display-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={view.name}
          maxLength={120}
          disabled={pending}
        />
      </div>
      <div className="space-y-2">
        <Label>{copy("Ключ строки")}</Label>
        <Select
          value={key}
          onValueChange={(value) => {
            setKey(value);
            setField("$auto");
            setTemplate("");
          }}
          disabled={pending || view.keys.length === 1}
        >
          <SelectTrigger aria-label={copy("Ключ строки")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent container={container}>
            {view.keys.map((entry) => (
              <SelectItem
                key={entry.name}
                value={entry.name}
              >
                {entry.name} · {entry.type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {folders.length > 0 && (
        <div className="space-y-2">
          <Label>{copy("Папка")}</Label>
          <Select
            value={folder}
            onValueChange={setFolder}
            disabled={pending}
          >
            <SelectTrigger aria-label={copy("Папка")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent container={container}>
              <SelectItem value="$none">{copy("Без папки")}</SelectItem>
              {folders.map((entry) => (
                <SelectItem
                  key={entry.id}
                  value={entry.id}
                >
                  {entry.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <CollectionDisplayFields
        collection={collection}
        catalog={[...catalog, collection]}
        portalContainer={container}
        field={field}
        template={template}
        pending={pending}
        onFieldChange={setField}
        onTemplateChange={setTemplate}
      />
      <div className="space-y-3 border-t pt-4">
        <p className="text-sm font-medium">{copy("Подписи полей")}</p>
        {collection.fields.map((entry) => (
          <div
            key={entry.name}
            className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] items-center gap-3"
          >
            <Label
              htmlFor={`mv-label-${entry.name}`}
              className="truncate font-mono text-xs"
            >
              {entry.name}
            </Label>
            <Input
              id={`mv-label-${entry.name}`}
              value={labels[entry.name] ?? ""}
              onChange={(e) =>
                setLabels((current) => ({
                  ...current,
                  [entry.name]: e.target.value,
                }))
              }
              placeholder={entry.name}
              maxLength={120}
              disabled={pending}
            />
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          {copy("Форматы полей и карточку можно настроить после подключения.")}
        </p>
      </div>
      {error && (
        <p
          role="alert"
          className="text-sm text-destructive"
        >
          {copy(error)}
        </p>
      )}
      <div className="flex gap-2 border-t pt-4">
        <Button
          type="submit"
          disabled={pending}
        >
          {pending ? copy("Сохранение…") : copy("Сохранить")}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={pending}
        >
          {copy("Отмена")}
        </Button>
      </div>
    </form>
  );
}
