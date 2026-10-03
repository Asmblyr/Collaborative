"use client";

import { useEditorDraft } from "./editor-lifecycle";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, FolderPlus, PanelTop, Plus, Settings2 } from "lucide-react";
import { Button } from "@asmblyr/kit/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@asmblyr/kit/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ItemForm } from "@/components/items/item-form";
import { automaticLayout, fieldsInNodes } from "@/components/items/form-layout-model";
import type { Collection } from "@/components/items/types";
import type { FormLayout } from "@/components/items/presentation-types";
import {
  appendFormNode,
  findFormNode,
  formParentOf,
  formParents,
  reorderFormNode,
} from "./form-designer-model";
import { FormDesignerTree } from "./form-designer-tree";
import { FormDesignerProperties } from "./form-designer-properties";

export function CollectionFormDesigner({
  collection,
  catalog,
  container,
  onSaved,
}: {
  collection: Collection;
  catalog: Collection[];
  container: HTMLElement | null;
  onSaved: () => void;
}) {
  const router = useRouter();
  const fields = collection.fields.filter((f) => f.type !== "alias");
  const [layout, setLayout] = useState<FormLayout>(
    () => collection.formLayout ?? automaticLayout(fields),
  );
  const [selected, setSelected] = useState(layout.tabs[0].id);
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const [section, setSection] = useState("structure");
  useEditorDraft(layout, pending);
  const placed = new Set(layout.tabs.flatMap((t) => fieldsInNodes(t.children)));
  const unplaced = fields.filter((f) => !placed.has(f.name));
  const selectedNode = findFormNode(layout, selected);
  const parent = selectedNode?.kind === "field" ? formParentOf(layout, selected)! : selected;
  const parentDepth = formParents(layout).find((p) => p.id === parent)?.depth ?? 0;
  async function save(value: FormLayout | null) {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/collections/${encodeURIComponent(collection.name)}/form`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(value),
      });
      if (!response.ok)
        throw new Error((await response.json()).message ?? "Не удалось сохранить форму");
      router.refresh();
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ошибка соединения");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Организуйте поля для создания, редактирования и просмотра записи. Настройка общая для
        коллекции; каждый пользователь увидит только доступные ему поля.
      </p>
      <Tabs
        value={section}
        onValueChange={(value) => {
          setSection(value);
          setError("");
        }}
        className="space-y-5"
      >
        <TabsList>
          <TabsTrigger value="structure">
            <Settings2 />
            Организация
          </TabsTrigger>
          <TabsTrigger value="preview">
            <Eye />
            Предпросмотр
          </TabsTrigger>
        </TabsList>
        <TabsContent value="structure" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending || layout.tabs.length >= 12}
              onClick={() => {
                const id = crypto.randomUUID();
                setLayout({
                  ...layout,
                  tabs: [...layout.tabs, { id, label: "Новая вкладка", children: [] }],
                });
                setSelected(id);
              }}
            >
              <PanelTop />
              Вкладка
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending || parentDepth >= 3}
              onClick={() => {
                const id = crypto.randomUUID();
                setLayout(
                  appendFormNode(layout, parent, {
                    id,
                    kind: "group",
                    label: "Новая секция",
                    description: "",
                    collapsible: false,
                    collapsed: false,
                    children: [],
                  }),
                );
                setSelected(id);
              }}
            >
              <FolderPlus />
              Секция
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending || !unplaced.length}
                >
                  <Plus />
                  Разместить поле{unplaced.length > 0 && ` (${unplaced.length})`}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent container={container} align="start">
                {unplaced.map((f) => (
                  <DropdownMenuItem
                    key={f.name}
                    onSelect={() => {
                      const id = crypto.randomUUID();
                      setLayout(
                        appendFormNode(layout, parent, {
                          id,
                          kind: "field",
                          field: f.name,
                          width: f.presentation?.width ?? "full",
                        }),
                      );
                      setSelected(id);
                    }}
                  >
                    {f.presentation?.label || f.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="grid min-h-80 gap-5 lg:grid-cols-[minmax(240px,0.9fr)_minmax(280px,1.1fr)]">
            <div className="min-w-0 space-y-4 rounded-xl border p-3">
              <FormDesignerTree
                layout={layout}
                fields={fields}
                selected={selected}
                disabled={pending}
                onSelect={setSelected}
                onMove={(id, offset) => setLayout(reorderFormNode(layout, id, offset))}
              />
              {unplaced.length > 0 && (
                <p className="border-t pt-3 text-xs text-muted-foreground">
                  Не размещены: {unplaced.map((f) => f.presentation?.label || f.name).join(", ")}.
                  Они появятся в «Других полях».
                </p>
              )}
            </div>
            <div className="min-w-0 rounded-xl border p-5">
              <FormDesignerProperties
                layout={layout}
                selected={selected}
                fields={fields}
                disabled={pending}
                container={container}
                onChange={setLayout}
                onSelect={setSelected}
              />
            </div>
          </div>
        </TabsContent>
        <TabsContent value="preview" className="space-y-4">
          <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            Интерактивный пример создания записи. Можно вводить значения и проверять условия. Данные
            не сохраняются.
          </p>
          <div className="mx-auto max-w-2xl rounded-xl border p-5">
            <ItemForm
              fields={fields}
              catalog={catalog}
              primaryKey={collection.primaryKey}
              formLayout={layout}
              embedded
              preview
              pending={false}
              portalContainer={container}
              onSave={async () => {
                setError("Предпросмотр: форма прошла проверку, запись не создавалась.");
              }}
              onCancel={() => setSection("structure")}
            />
          </div>
        </TabsContent>
      </Tabs>
      {error && (
        <p role="status" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Button type="button" disabled={pending} onClick={() => save(layout)}>
          {pending ? "Сохранение…" : "Сохранить форму"}
        </Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={() => save(null)}>
          Автоматическая раскладка
        </Button>
      </div>
    </div>
  );
}
