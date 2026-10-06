"use client";

import { CalendarDays, CircleCheck, Database, Hash, Type } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useUiCopy } from "@/lib/ui-copy";
import { ConfiguredFieldLayout } from "./configured-field-layout";
import { inputValue } from "./item-input-values";
import { ItemReadonlyField } from "./item-readonly-field";
import {
  materializedCardFields,
  materializedNumber,
  materializedValueKind,
} from "./materialized-card-model";
import type { Collection, CollectionField, Item } from "./types";
import type { OpenRelated } from "./relation-picker";

function valueIcon(field: CollectionField, kind: "number" | "boolean" | null) {
  if (kind === "number") {
    return Hash;
  }
  if (kind === "boolean") {
    return CircleCheck;
  }
  if (["date", "datetime"].includes(field.type)) {
    return CalendarDays;
  }
  return Type;
}

export function MaterializedRecordCard({
  collection,
  fields,
  sourceFields,
  item,
  catalog,
  onOpenRelated,
}: {
  collection: Collection;
  fields: CollectionField[];
  sourceFields: CollectionField[];
  item: Item;
  catalog: Collection[];
  onOpenRelated: OpenRelated;
}) {
  const copy = useUiCopy();
  const visible = materializedCardFields(
    fields,
    sourceFields,
    collection.displayField,
  );
  const values = Object.fromEntries(
    fields.map((field) => [field.name, inputValue(field, item)]),
  );

  return (
    <section
      aria-label={copy("Карточка представления")}
      className="space-y-4"
    >
      <Badge
        variant="outline"
        className="gap-1.5 text-muted-foreground"
      >
        <Database aria-hidden />
        {copy("Представление")} · {copy("Только просмотр ")}
      </Badge>
      <ConfiguredFieldLayout
        fields={visible.filter((field) => !field.presentation?.rules?.hidden)}
        layout={collection.formLayout}
        values={values}
        forced={new Set()}
      >
        {(field) => {
          const kind = materializedValueKind(field);
          const numeric = kind === "number";
          const Icon = valueIcon(field, kind);

          return (
            <dl
              className={`min-w-0 rounded-xl border p-4 ${numeric ? "border-primary/20 bg-primary/5" : "bg-muted/15"}`}
            >
              <dt
                className="flex items-center gap-2 text-xs font-medium text-muted-foreground"
                title={field.name}
              >
                <Icon
                  className="size-3.5 shrink-0"
                  aria-hidden
                />
                {field.presentation?.label || field.name}
              </dt>
              <dd className="mt-2 min-w-0 break-words">
                <CardValue
                  field={field}
                  item={item}
                  kind={kind}
                  catalog={catalog}
                  onOpenRelated={onOpenRelated}
                />
                {field.presentation?.description && (
                  <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                    {field.presentation.description}
                  </p>
                )}
              </dd>
            </dl>
          );
        }}
      </ConfiguredFieldLayout>
    </section>
  );
}

function CardValue({
  field,
  item,
  kind,
  catalog,
  onOpenRelated,
}: {
  field: CollectionField;
  item: Item;
  kind: "number" | "boolean" | null;
  catalog: Collection[];
  onOpenRelated: OpenRelated;
}) {
  const copy = useUiCopy();
  const value = item[field.name];

  if (
    kind === "number" &&
    (typeof value === "string" || typeof value === "number")
  ) {
    return (
      <span className="block text-xl font-semibold tabular-nums text-primary">
        {materializedNumber(value, copy.locale ?? "ru")}
      </span>
    );
  }
  if (kind === "boolean" && typeof value === "boolean") {
    return (
      <Badge variant={value ? "secondary" : "outline"}>
        {value ? copy("Да") : copy("Нет")}
      </Badge>
    );
  }

  return (
    <ItemReadonlyField
      field={field}
      item={item}
      catalog={catalog}
      onOpenRelated={onOpenRelated}
    />
  );
}
