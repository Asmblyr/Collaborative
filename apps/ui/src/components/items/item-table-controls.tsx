"use client";

import { Check, Download, Save, SlidersHorizontal } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ItemColumn } from "./use-item-columns";
import type { TableView } from "./table-view-dialog";
import { useUiCopy } from "@/lib/ui-copy";

export function ItemViewMenu({
  all,
  visible,
  onToggle,
  onSave,
  saving,
  onImport,
  views,
  onApplyView,
  onManageViews,
}: {
  all: ItemColumn[];
  visible: ItemColumn[];
  onToggle: (name: string, show: boolean) => void;
  onSave: () => void;
  saving: boolean;
  onImport?: () => void;
  views: TableView[];
  onApplyView: (view: TableView) => void;
  onManageViews: () => void;
}) {
  const copy = useUiCopy();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
        >
          <SlidersHorizontal aria-hidden="true" /> {copy(" Вид ")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-72"
      >
        <p className="px-2 py-2 text-xs font-medium text-muted-foreground">
          {copy("Столбцы ")}
        </p>
        <div className="max-h-64 overflow-y-auto">
          {all.map((column) => {
            const checked = visible.some((entry) => entry.name === column.name);
            return (
              <DropdownMenuCheckboxItem
                key={column.name}
                checked={checked}
                disabled={checked && visible.length === 1}
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={(show) => onToggle(column.name, show === true)}
              >
                <span className="flex size-4 items-center justify-center rounded border">
                  {checked && (
                    <Check
                      className="size-3"
                      aria-hidden="true"
                    />
                  )}
                </span>
                <span className="truncate">{column.label}</span>
              </DropdownMenuCheckboxItem>
            );
          })}
        </div>
        <DropdownMenuSeparator />
        {views.length > 0 && (
          <>
            <p className="px-2 py-2 text-xs font-medium text-muted-foreground">
              {copy("Сохранённые виды ")}
            </p>
            <div className="max-h-48 overflow-auto">
              {views.map((view) => (
                <DropdownMenuItem
                  key={view.id}
                  disabled={!view.available}
                  onSelect={() => onApplyView(view)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">
                      {view.name}
                      {view.isDefault ? copy(" · по умолчанию") : ""}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {view.scope === "personal"
                        ? copy("Личный")
                        : view.scope === "workspace"
                          ? "Workspace"
                          : copy("Общий")}
                    </span>
                  </span>
                  {!view.available && (
                    <span className="text-xs">{copy("Недоступен")}</span>
                  )}
                </DropdownMenuItem>
              ))}
            </div>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onSelect={onManageViews}>
          <Save />
          {copy("Сохранить как… / управлять видами ")}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={saving}
          onSelect={onSave}
        >
          <Save aria-hidden="true" />{" "}
          {saving ? copy("Сохраняем…") : copy("Запомнить сортировку и размер")}
        </DropdownMenuItem>
        {onImport && (
          <DropdownMenuItem onSelect={onImport}>
            <Download aria-hidden="true" />{" "}
            {copy(" Импортировать из браузера ")}
          </DropdownMenuItem>
        )}
        <p className="px-2 py-2 text-xs leading-relaxed text-muted-foreground">
          {copy(
            "Столбцы сохраняются автоматически. Именованные виды запоминают все настройки таблицы. ",
          )}
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
