"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@asmblyr-collaborative/kit/ui/tabs";
import type { CollectionField } from "./types";
import type { FormLayout, FormNode } from "./presentation-types";
import {
  effectiveLayout,
  fieldsInNodes,
  visibleLayout,
} from "./form-layout-model";
import { useUiCopy } from "@/lib/ui-copy";

export function ConfiguredFieldLayout({
  layout,
  fields,
  values,
  forced,
  reveal,
  revealAttempt = 0,
  plainGroups = false,
  children,
}: {
  layout?: FormLayout | null;
  fields: CollectionField[];
  values: Record<string, string>;
  forced: Set<string>;
  reveal?: string;
  revealAttempt?: number;
  plainGroups?: boolean;
  children: (field: CollectionField) => ReactNode;
}) {
  const copy = useUiCopy();

  const form = visibleLayout(
    effectiveLayout(layout, fields, copy),
    values,
    forced,
  );
  const [choice, setChoice] = useState<{ id: string; attempt: number } | null>(
    null,
  );
  const revealedTab =
    reveal && (!choice || choice.attempt < revealAttempt)
      ? form.tabs.find((t) => fieldsInNodes(t.children).includes(reveal))?.id
      : undefined;
  const selected = revealedTab ?? choice?.id ?? form.tabs[0]?.id ?? "";
  const active = form.tabs.some((t) => t.id === selected)
    ? selected
    : (form.tabs[0]?.id ?? "");
  const fieldMap = new Map(fields.map((f) => [f.name, f]));
  const render = (nodes: FormNode[]): ReactNode => (
    <div className="grid grid-cols-1 gap-x-5 gap-y-5 @min-[420px]:grid-cols-2">
      {nodes.map((node) =>
        node.kind === "group" ? (
          <FormSection
            key={node.id}
            node={node}
            reveal={reveal}
            revealAttempt={revealAttempt}
            plain={plainGroups}
          >
            {render(node.children)}
          </FormSection>
        ) : (
          <div
            key={node.id}
            data-form-field={node.field}
            className={`min-w-0 space-y-2 ${node.width === "full" ? "@min-[420px]:col-span-2" : ""}`}
          >
            {fieldMap.has(node.field) && children(fieldMap.get(node.field)!)}
          </div>
        ),
      )}
    </div>
  );
  if (!form.tabs.length)
    return (
      <p className="text-sm text-muted-foreground">
        {copy("Нет полей для отображения.")}
      </p>
    );
  return (
    <div className="@container">
      {form.tabs.length === 1 ? (
        render(form.tabs[0].children)
      ) : (
        <Tabs
          value={active}
          onValueChange={(id) => setChoice({ id, attempt: revealAttempt })}
          className="space-y-5"
        >
          <TabsList
            aria-label={copy("Вкладки формы")}
            className="h-auto max-w-full flex-wrap justify-start gap-1"
          >
            {form.tabs.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {form.tabs.map((tab) => (
            <TabsContent
              key={tab.id}
              value={tab.id}
              forceMount
              hidden={active !== tab.id}
            >
              {render(tab.children)}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}

function FormSection({
  node,
  reveal,
  revealAttempt,
  plain,
  children,
}: {
  node: Extract<FormNode, { kind: "group" }>;
  reveal?: string;
  revealAttempt: number;
  plain: boolean;
  children: ReactNode;
}) {
  const id = useId();
  const containsReveal = Boolean(
    reveal && fieldsInNodes(node.children).includes(reveal),
  );
  const [toggle, setToggle] = useState<{
    open: boolean;
    attempt: number;
  } | null>(null);
  const open =
    containsReveal && (!toggle || toggle.attempt < revealAttempt)
      ? true
      : (toggle?.open ?? !node.collapsed);
  return (
    <section
      className={`min-w-0 @min-[420px]:col-span-2 ${plain ? "space-y-3" : "rounded-xl border bg-muted/10"}`}
      aria-labelledby={`${id}-label`}
    >
      <div className={plain ? undefined : "px-4 py-3"}>
        {node.collapsible ? (
          <Button
            id={`${id}-label`}
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2 h-auto w-full justify-start py-1.5"
            aria-expanded={open}
            aria-controls={id}
            onClick={() => setToggle({ open: !open, attempt: revealAttempt })}
          >
            <ChevronDown className={open ? "" : "-rotate-90"} />
            {node.label}
          </Button>
        ) : (
          <h3
            id={`${id}-label`}
            className="text-sm font-medium"
          >
            {node.label}
          </h3>
        )}
        {node.description && (
          <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
            {node.description}
          </p>
        )}
      </div>
      <div
        id={id}
        hidden={node.collapsible && !open}
        className={plain ? "@container" : "@container px-4 pb-4"}
      >
        {children}
      </div>
    </section>
  );
}
