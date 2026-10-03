"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@asmblyr/kit/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@asmblyr/kit/ui/tabs";
import type { CollectionField } from "./types";
import type { FormLayout, FormNode } from "./presentation-types";
import { effectiveLayout, fieldsInNodes, visibleLayout } from "./form-layout-model";

export function ConfiguredFieldLayout({ layout, fields, values, forced, reveal, children }: {
  layout?: FormLayout | null; fields: CollectionField[]; values: Record<string, string>; forced: Set<string>; reveal?: string;
  children: (field: CollectionField) => ReactNode;
}) {
  const form = visibleLayout(effectiveLayout(layout, fields), values, forced);
  const [selected, setSelected] = useState(() => form.tabs.find((t) => reveal && fieldsInNodes(t.children).includes(reveal))?.id ?? form.tabs[0]?.id ?? "");
  const active = form.tabs.some((t) => t.id === selected) ? selected : form.tabs[0]?.id ?? "";
  const fieldMap = new Map(fields.map((f) => [f.name, f]));
  const render = (nodes: FormNode[]): ReactNode => <div className="grid grid-cols-1 gap-x-5 gap-y-5 @min-[420px]:grid-cols-2">
    {nodes.map((node) => node.kind === "group" ? <FormSection key={node.id} node={node} reveal={reveal}>{render(node.children)}</FormSection> :
      <div key={node.id} data-form-field={node.field} className={`min-w-0 space-y-2 ${node.width === "full" ? "@min-[420px]:col-span-2" : ""}`}>
        {fieldMap.has(node.field) && children(fieldMap.get(node.field)!)}
      </div>)}
  </div>;
  if (!form.tabs.length) return <p className="text-sm text-muted-foreground">Нет полей для отображения.</p>;
  return <div className="@container">
    {form.tabs.length === 1 ? render(form.tabs[0].children) : <Tabs value={active} onValueChange={setSelected} className="space-y-5">
      <TabsList aria-label="Вкладки формы" className="h-auto max-w-full flex-wrap justify-start gap-1">
        {form.tabs.map((tab) => <TabsTrigger key={tab.id} value={tab.id}>{tab.label}</TabsTrigger>)}
      </TabsList>
      {form.tabs.map((tab) => <TabsContent key={tab.id} value={tab.id} forceMount hidden={active !== tab.id}>{render(tab.children)}</TabsContent>)}
    </Tabs>}
  </div>;
}

function FormSection({ node, reveal, children }: { node: Extract<FormNode, { kind: "group" }>; reveal?: string; children: ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(!node.collapsed || !!reveal && fieldsInNodes(node.children).includes(reveal));
  return <section className="min-w-0 rounded-xl border bg-muted/10 @min-[420px]:col-span-2" aria-labelledby={`${id}-label`}>
    <div className="px-4 py-3">
      {node.collapsible ? <Button id={`${id}-label`} type="button" variant="ghost" size="sm" className="-ml-2 h-auto w-full justify-start py-1.5"
        aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}><ChevronDown className={open ? "" : "-rotate-90"} />{node.label}</Button>
        : <h3 id={`${id}-label`} className="text-sm font-medium">{node.label}</h3>}
      {node.description && <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{node.description}</p>}
    </div>
    <div id={id} hidden={node.collapsible && !open} className="@container px-4 pb-4">{children}</div>
  </section>;
}
