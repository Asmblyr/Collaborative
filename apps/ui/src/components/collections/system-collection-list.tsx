"use client";
import { Fragment, useState } from "react";
import { ChevronRight, Table2 } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import type { Collection } from "@/components/items/types";
import { useUiCopy } from "@/lib/ui-copy";
import { CollectionFields } from "./collection-fields";
import type { Selection } from "./system-collections";

export function SystemCollectionList({
  models,
  onSelect: setSelection,
}: {
  models: Collection[];
  onSelect: (selection: Selection) => void;
}) {
  const copy = useUiCopy();
  const [expanded, setExpanded] = useState<string[]>([]);
  return (
    <div className="overflow-hidden rounded-xl border">
      <Table aria-label={copy("Системные коллекции")}>
        <TableBody>
          {models.map((collection) => {
            const isExpanded = expanded.includes(collection.name);
            return (
              <Fragment key={collection.name}>
                <TableRow>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-expanded={isExpanded}
                      onClick={() =>
                        setExpanded((current) =>
                          isExpanded
                            ? current.filter((name) => name !== collection.name)
                            : [...current, collection.name],
                        )
                      }
                    >
                      <ChevronRight
                        className={isExpanded ? "rotate-90" : ""}
                        aria-hidden="true"
                      />
                      <Table2 aria-hidden="true" />
                      {collection.displayName}
                    </Button>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {collection.name}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {copy("Поля")}: {collection.fields.length}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={
                        !collection.fields.some((entry) => !entry.managed)
                      }
                      onClick={() =>
                        setSelection({
                          kind: "records",
                          collection: collection.name,
                        })
                      }
                    >
                      {copy("Дополнительные данные")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setSelection({
                          kind: "field",
                          collection: collection.name,
                        })
                      }
                    >
                      {copy("Добавить поле")}
                    </Button>
                  </TableCell>
                </TableRow>
                {isExpanded && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={3}
                      className="p-0"
                    >
                      <CollectionFields
                        collection={collection}
                        superuser
                        onForm={() => {}}
                        onDisplay={() => {}}
                        onAddField={() =>
                          setSelection({
                            kind: "field",
                            collection: collection.name,
                          })
                        }
                        onEditField={(name) =>
                          setSelection({
                            kind: "field",
                            collection: collection.name,
                            field: name,
                          })
                        }
                        onDeleteField={(name) =>
                          setSelection({
                            kind: "delete",
                            collection: collection.name,
                            field: name,
                          })
                        }
                      />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
