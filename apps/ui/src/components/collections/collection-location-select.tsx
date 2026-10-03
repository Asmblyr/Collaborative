"use client";

import { Folder, Table2 } from "lucide-react";
import type { CollectionFolder } from "@/components/items/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "@asmblyr/kit/ui/select";
import {
  canNestCollection,
  locationValue,
  locationFromValue,
  type CollectionLocation,
  type NavigableCollection,
} from "@/lib/collection-tree";

export function CollectionLocationSelect({
  name,
  location,
  collections,
  folders,
  onChange,
  disabled,
  container,
  id,
  compact,
}: {
  name?: string;
  location: CollectionLocation;
  collections: NavigableCollection[];
  folders: CollectionFolder[];
  onChange: (location: CollectionLocation) => void;
  disabled?: boolean;
  container?: HTMLElement | null;
  id?: string;
  compact?: boolean;
}) {
  return (
    <Select
      value={locationValue(location)}
      onValueChange={(value) => onChange(locationFromValue(value))}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        size={compact ? "sm" : "default"}
        aria-label={
          name ? `Расположение коллекции ${name}` : "Расположение коллекции"
        }
        className={compact ? "w-44 text-xs" : "w-full"}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent container={container}>
        <SelectItem value="root">В корне</SelectItem>
        {folders.length > 0 && (
          <SelectGroup>
            <SelectLabel>Папки</SelectLabel>
            {folders.map((folder) => (
              <SelectItem
                key={folder.id}
                value={`folder:${folder.id}`}
              >
                <Folder />
                {folder.name}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
        <SelectGroup>
          <SelectLabel>Внутри коллекции</SelectLabel>
          {collections
            .filter(
              (c) => !name || canNestCollection(name, c.name, collections),
            )
            .map((c) => (
              <SelectItem
                key={c.name}
                value={`collection:${c.name}`}
              >
                <Table2 />
                {c.displayName || c.name}
              </SelectItem>
            ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
