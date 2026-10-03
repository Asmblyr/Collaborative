"use client";

import { useState } from "react";
import { ItemFilterGroup } from "@/components/items/item-filter-group";
import {
  addFilterNode,
  removeFilterNode,
  replaceFilterNode,
} from "@/components/items/item-filter-model";
import {
  filterCount,
  type FilterGroup,
  type FilterScope,
} from "@/components/items/item-filter-options";

export function TermFilterEditor({
  value,
  scopes,
  onChange,
}: {
  value: FilterGroup;
  scopes: FilterScope[];
  onChange: (value: FilterGroup) => void;
}) {
  const [focusPath, setFocusPath] = useState<string | null>(null);
  return (
    <ItemFilterGroup
      group={value}
      path={[]}
      depth={1}
      total={filterCount(value)}
      scopes={scopes}
      focusPath={focusPath}
      onEdit={(path, node) => {
        onChange(replaceFilterNode(value, path, node));
        if (!("logic" in node)) setFocusPath(path.join("."));
      }}
      onAdd={(path, node) => {
        const parent = path.reduce<FilterGroup>(
          (group, index) => group.children[index] as FilterGroup,
          value,
        );
        onChange(addFilterNode(value, path, node));
        setFocusPath("logic" in node ? null : [...path, parent.children.length].join("."));
      }}
      onRemove={(path) => {
        onChange(removeFilterNode(value, path));
        setFocusPath(null);
      }}
    />
  );
}
