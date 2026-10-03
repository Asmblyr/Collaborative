"use client";

import { useEditorDraft } from "./editor-lifecycle";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@asmblyr/kit/ui/button";
import { defaultCollectionState } from "@asmblyr/contracts";
import { CollectionSystemFields } from "./collection-system-fields";
import { Input } from "@asmblyr/kit/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr/kit/ui/select";
import type { Collection, CollectionFolder } from "@/components/items/types";
import { CollectionLocationSelect } from "./collection-location-select";
import type { CollectionLocation } from "@/lib/collection-tree";
import { useWorkspace } from "@/components/workspaces/workspace-provider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@asmblyr/kit/ui/tabs";
import {
  CollectionNameField,
  CollectionMcpFields,
  CollectionVisibilityField,
} from "./collection-metadata-fields";

type CollectionMode = "multiple" | "single";
type PrimaryKeyType = "uuid" | "serial" | "bigserial" | "text";

interface CreateCollectionFormProps {
  portalContainer: HTMLElement | null;
  folders: CollectionFolder[];
  collections: Collection[];
  initialFolderId?: string | null;
  onSaved: () => void;
  onCancel: () => void;
}

export function CreateCollectionForm({
  portalContainer,
  folders,
  collections,
  initialFolderId,
  onSaved,
  onCancel,
}: CreateCollectionFormProps) {
  const router = useRouter();
  const workspace = useWorkspace();
  const [name, setName] = useState("");
  const [tab, setTab] = useState("general");
  const [displayName, setDisplayName] = useState("");
  const [hidden, setHidden] = useState(false);
  const [mcpEnabled, setMcpEnabled] = useState(true);
  const [mcpDescription, setMcpDescription] = useState("");
  const [location, setLocation] = useState<CollectionLocation>({
    folderId: initialFolderId ?? null,
    parentCollection: null,
  });
  const [mode, setMode] = useState<CollectionMode>("multiple");
  const [primaryKeyName, setPrimaryKeyName] = useState("id");
  const [primaryKeyType, setPrimaryKeyType] = useState<PrimaryKeyType>("uuid");
  const [createdAt, setCreatedAt] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(false);
  const [stateEnabled, setStateEnabled] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  useEditorDraft(
    {
      name,
      displayName,
      hidden,
      mcpEnabled,
      mcpDescription,
      location,
      mode,
      primaryKeyName,
      primaryKeyType,
      createdAt,
      updatedAt,
      stateEnabled,
    },
    pending,
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) {
      setTab("general");
      window.requestAnimationFrame(() => form.reportValidity());
      return;
    }
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/collections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          displayName,
          hidden,
          mcp: { enabled: mcpEnabled, description: mcpDescription },
          ...(workspace?.active ? { workspaceId: workspace.active.id } : {}),
          ...location,
          mode,
          primaryKey: { name: primaryKeyName, type: primaryKeyType },
          timestamps: { createdAt, updatedAt },
          state: stateEnabled ? defaultCollectionState() : null,
          fields: [],
        }),
      });
      if (!response.ok) {
        const result = (await response.json()) as { message?: string };
        setMessage(result.message ?? "Не удалось создать коллекцию");
        return;
      }
      onSaved();
      void workspace?.reload().catch(() => {});
      router.refresh();
    } catch {
      setMessage("Не удалось связаться с сервером");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
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
            value="general"
            className="flex-1"
          >
            Основное
          </TabsTrigger>
          <TabsTrigger
            value="display"
            className="flex-1"
          >
            Отображение
          </TabsTrigger>
          <TabsTrigger
            value="mcp"
            className="flex-1"
          >
            MCP
          </TabsTrigger>
        </TabsList>
        <TabsContent
          value="general"
          forceMount
          className="space-y-6 data-[state=inactive]:hidden"
        >
          {workspace?.active && (
            <p className="rounded-lg bg-muted p-3 text-sm">
              Коллекция появится в workspace «{workspace.active.name}».
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="collection-name">Техническое имя</Label>
            <Input
              id="collection-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={63}
              pattern="[a-z][a-z0-9_]*"
              placeholder="articles"
              disabled={pending}
              className="h-10 font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Строчные латинские буквы, цифры и подчёркивание. Префиксы asmblyr_
              и plugin_ зарезервированы.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="collection-location">Расположение</Label>
            <CollectionLocationSelect
              id="collection-location"
              name={name || undefined}
              location={location}
              collections={collections}
              folders={folders}
              onChange={setLocation}
              disabled={pending}
              container={portalContainer}
            />
            <p className="text-xs text-muted-foreground">
              Группировка в меню. Связи между записями и права настраиваются
              отдельно.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="collection-mode">Данные коллекции</Label>
            <Select
              value={mode}
              onValueChange={(value) => setMode(value as CollectionMode)}
              disabled={pending}
            >
              <SelectTrigger
                id="collection-mode"
                className="h-10 w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent container={portalContainer}>
                <SelectItem value="multiple">Много записей</SelectItem>
                <SelectItem value="single">Один объект</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Для одного объекта Core разрешит создать только одну запись.
            </p>
          </div>

          <div className="space-y-4 rounded-xl border p-4">
            <h3 className="text-sm font-medium">Основной ключ</h3>
            <div className="space-y-2">
              <Label htmlFor="collection-primary-name">Название поля</Label>
              <Input
                id="collection-primary-name"
                value={primaryKeyName}
                onChange={(event) => setPrimaryKeyName(event.target.value)}
                required
                maxLength={63}
                pattern="[a-z][a-z0-9_]*"
                disabled={pending}
                className="h-10 font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="collection-primary-type">Тип ключа</Label>
              <Select
                value={primaryKeyType}
                onValueChange={(value) =>
                  setPrimaryKeyType(value as PrimaryKeyType)
                }
                disabled={pending}
              >
                <SelectTrigger
                  id="collection-primary-type"
                  className="h-10 w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent container={portalContainer}>
                  <SelectItem value="uuid">UUID (автоматически)</SelectItem>
                  <SelectItem value="serial">Автоинкремент</SelectItem>
                  <SelectItem value="bigserial">
                    Большой автоинкремент
                  </SelectItem>
                  <SelectItem value="text">Строка (ввод вручную)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <CollectionSystemFields
            createdAt={createdAt}
            updatedAt={updatedAt}
            state={stateEnabled}
            disabled={pending}
            onChange={(field, enabled) => {
              if (field === "createdAt") setCreatedAt(enabled);
              else if (field === "updatedAt") setUpdatedAt(enabled);
              else setStateEnabled(enabled);
            }}
          />

          <p className="text-sm text-muted-foreground">
            Пользовательские поля можно добавить после создания коллекции.
          </p>
        </TabsContent>
        <TabsContent
          value="display"
          forceMount
          className="space-y-6 data-[state=inactive]:hidden"
        >
          <CollectionNameField
            name={name}
            value={displayName}
            onChange={setDisplayName}
            disabled={pending}
          />
          <CollectionVisibilityField
            hidden={hidden}
            onChange={setHidden}
            disabled={pending}
          />
        </TabsContent>
        <TabsContent
          value="mcp"
          forceMount
          className="data-[state=inactive]:hidden"
        >
          <CollectionMcpFields
            enabled={mcpEnabled}
            description={mcpDescription}
            onEnabledChange={setMcpEnabled}
            onDescriptionChange={setMcpDescription}
            disabled={pending}
          />
        </TabsContent>
      </Tabs>
      {message && (
        <p
          role="status"
          className="text-sm text-destructive"
        >
          {message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          disabled={pending}
        >
          {pending ? "Создаём…" : "Создать коллекцию"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={onCancel}
        >
          Отмена
        </Button>
      </div>
    </form>
  );
}
