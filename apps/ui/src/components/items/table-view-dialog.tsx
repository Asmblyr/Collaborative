"use client";

import { useState, type FormEvent } from "react";
import { EditorDialog } from "@/components/collections/editor-dialog";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@asmblyr-collaborative/kit/ui/checkbox";
import { useWorkspace } from "@/components/workspaces/workspace-provider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr-collaborative/kit/ui/select";
import { apiRequest } from "@/lib/api-request";
import type { ColumnPreferences } from "@/lib/table-preferences";
import type { FilterGroup } from "./item-filter-options";
import { useUiCopy } from "@/lib/ui-copy";

export interface TableViewDefinition {
  columns: ColumnPreferences;
  filter: FilterGroup | null;
  q: string;
  sort: {
    field: string;
    direction: "asc" | "desc";
    order?: import("@asmblyr-collaborative/contracts").ItemOrder;
  };
  pageSize: number;
}
export interface TableView {
  id: string;
  name: string;
  available: boolean;
  definition: TableViewDefinition | null;
  scope: "personal" | "collection" | "workspace";
  workspaceId: string | null;
  isDefault: boolean;
  editable: boolean;
}

export function TableViewDialog({
  collection,
  definition,
  views,
  superuser,
  onClose,
  onChanged,
}: {
  collection: string;
  definition: TableViewDefinition;
  views: TableView[];
  onClose: () => void;
  onChanged: () => void;
  superuser: boolean;
}) {
  const copy = useUiCopy();

  const [id, setId] = useState("new"),
    [name, setName] = useState("");
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const workspace = useWorkspace();
  const [scope, setScope] = useState<TableView["scope"]>("personal"),
    [isDefault, setDefault] = useState(false);
  const selected = views.find((view) => view.id === id);
  const workspaceId = selected?.workspaceId ?? workspace?.active?.id;
  const editable = id === "new" || selected?.editable;
  const endpoint = `/api/table-views/${encodeURIComponent(collection)}`;
  async function save(event: FormEvent, close: () => void) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await apiRequest(
        id === "new" ? endpoint : `${endpoint}/${id}`,
        id === "new" ? "POST" : "PUT",
        {
          name,
          definition,
          scope,
          isDefault,
          ...(scope === "workspace" ? { workspaceId } : {}),
        },
      );
      onChanged();
      close();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : copy("Не удалось сохранить вид"),
      );
    } finally {
      setPending(false);
    }
  }
  async function remove(close: () => void) {
    setPending(true);
    setError("");
    try {
      await apiRequest(`${endpoint}/${id}`, "DELETE");
      onChanged();
      close();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : copy("Не удалось удалить вид"),
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <EditorDialog
      open
      busy={pending}
      title={copy("Сохранённые виды")}
      eyebrow={collection}
      onClose={onClose}
    >
      {(container, close) => (
        <form
          onSubmit={(event) => void save(event, close)}
          className="space-y-5"
        >
          <p className="text-sm text-muted-foreground">
            {copy(
              "Сохраните фильтры, поиск, столбцы, сортировку и размер страницы. Общий вид доступен коллегам с правом чтения коллекции. ",
            )}
          </p>
          <div className="space-y-2">
            <Label htmlFor="saved-view">{copy("Вид")}</Label>
            <Select
              value={id}
              disabled={pending}
              onValueChange={(value) => {
                const view = views.find((v) => v.id === value);
                setId(value);
                setName(view?.name ?? "");
                setScope(view?.scope ?? "personal");
                setDefault(view?.isDefault ?? false);
                setError("");
              }}
            >
              <SelectTrigger
                id="saved-view"
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent container={container}>
                <SelectItem value="new">{copy("Создать новый")}</SelectItem>
                {views
                  .filter((view) => view.editable)
                  .map((view) => (
                    <SelectItem
                      key={view.id}
                      value={view.id}
                    >
                      {view.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="view-scope">{copy("Доступность")}</Label>
            <Select
              value={scope}
              disabled={pending || id !== "new"}
              onValueChange={(value) => setScope(value as TableView["scope"])}
            >
              <SelectTrigger
                id="view-scope"
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent container={container}>
                <SelectItem value="personal">{copy("Только мне")}</SelectItem>
                {superuser && (
                  <>
                    <SelectItem value="collection">
                      {copy("Всем в коллекции")}
                    </SelectItem>
                    {workspace?.active?.collections.includes(collection) && (
                      <SelectItem value="workspace">
                        Workspace: {workspace.active.name}
                      </SelectItem>
                    )}
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="saved-view-name">{copy("Название")}</Label>
            <Input
              id="saved-view-name"
              value={name}
              maxLength={60}
              required
              disabled={pending}
              placeholder={copy("Например, статьи к публикации")}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          {id !== "new" && (
            <p className="rounded-lg bg-muted p-3 text-sm">
              {copy(
                "Сохранение заменит настройки выбранного вида текущими настройками таблицы. ",
              )}
            </p>
          )}
          <label className="flex items-start gap-3 rounded-lg border p-3">
            <Checkbox
              checked={isDefault}
              disabled={pending || !editable}
              onCheckedChange={(value) => setDefault(value === true)}
            />
            <span className="space-y-1 text-sm">
              <span className="block font-medium">
                {copy("Вид по умолчанию")}
              </span>
              <span className="block text-xs text-muted-foreground">
                {copy(
                  "Применяется при открытии коллекции. Личный вид имеет приоритет, затем вид workspace и общий вид коллекции. Настройки ссылки и ваши столбцы сохраняют приоритет. ",
                )}
              </span>
            </span>
          </label>
          {error && (
            <p
              role="alert"
              className="text-sm text-destructive"
            >
              {copy(error)}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button disabled={pending || !name.trim()}>
              {pending ? copy("Сохраняем…") : copy("Сохранить")}
            </Button>
            {id !== "new" && (
              <Button
                type="button"
                variant="destructive"
                disabled={pending}
                onClick={() => void remove(close)}
              >
                {copy("Удалить вид ")}
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={close}
            >
              {copy("Отмена ")}
            </Button>
          </div>
        </form>
      )}
    </EditorDialog>
  );
}
