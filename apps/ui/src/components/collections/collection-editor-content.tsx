"use client";

import type { Collection, CollectionFolder } from "@/components/items/types";
import { CollectionFormDesigner } from "./collection-form-designer";
import { CollectionSettingsForm } from "./collection-settings-form";
import { CreateCollectionForm } from "./create-collection-form";
import { DeleteStructureForm } from "./delete-structure-form";
import { FieldEditorForm } from "./field-editor-form";
import { FieldTypePicker } from "./field-type-picker";
import { FolderForm } from "./folder-form";
import { RelationCreateForm } from "./relation-create-form";
import { MaterializedPicker } from "./materialized-picker";
import { MaterializedConnectForm } from "./materialized-connect-form";
import { MaterializedFieldForm } from "./materialized-field-form";
import { MaterializedDisconnectForm } from "./materialized-disconnect-form";
import {
  isRelationChoice,
  type CollectionEditorSelection,
} from "./collection-editor-selection";

export function CollectionEditorContent({
  selection,
  collections,
  folders,
  container,
  onSaved,
  onCancel,
  onLeave,
  onSelect,
  onSettingsState,
}: {
  selection: CollectionEditorSelection | null;
  collections: Collection[];
  folders: CollectionFolder[];
  container: HTMLElement | null;
  onSaved: () => void;
  onCancel: () => void;
  onLeave: (action: () => void) => void;
  onSelect: (selection: CollectionEditorSelection) => void;
  onSettingsState: (dirty: boolean, busy: boolean) => void;
}) {
  if (!selection) {
    return null;
  }
  const collection =
    "collection" in selection
      ? collections.find((entry) => entry.name === selection.collection)
      : undefined;
  const callbacks = { onSaved, onCancel };
  switch (selection.kind) {
    case "materialized": {
      if (!selection.view) {
        return (
          <MaterializedPicker
            onSelect={(view) => onSelect({ kind: "materialized", view })}
          />
        );
      }
      return (
        <MaterializedConnectForm
          key={selection.view.name}
          view={selection.view}
          catalog={collections}
          folders={folders}
          container={container}
          {...callbacks}
          onBack={() => onLeave(() => onSelect({ kind: "materialized" }))}
        />
      );
    }
    case "collection":
      return (
        <CreateCollectionForm
          folders={folders}
          collections={collections}
          initialFolderId={selection.folderId}
          portalContainer={container}
          {...callbacks}
        />
      );
    case "folder":
      return (
        <FolderForm
          key={selection.folder?.id ?? "new"}
          folder={selection.folder}
          {...callbacks}
        />
      );
    case "form":
      return collection ? (
        <CollectionFormDesigner
          collection={collection}
          catalog={collections}
          container={container}
          onSaved={onSaved}
        />
      ) : null;
    case "display":
      return collection ? (
        <CollectionSettingsForm
          key={collection.name}
          collection={collection}
          catalog={collections}
          portalContainer={container}
          onSaved={onSaved}
          onStateChange={onSettingsState}
        />
      ) : null;
    case "delete-field":
      return (
        <DeleteStructureForm
          key={`${selection.collection}:${selection.field}`}
          collection={selection.collection}
          field={selection.field}
          onDeleted={onSaved}
          onCancel={onCancel}
        />
      );
    case "delete-collection": {
      if (collection?.sourceKind === "materialized-view") {
        return (
          <MaterializedDisconnectForm
            name={selection.collection}
            {...callbacks}
          />
        );
      }
      return (
        <DeleteStructureForm
          key={selection.collection}
          collection={selection.collection}
          onDeleted={onSaved}
          onCancel={onCancel}
        />
      );
    }
    case "field": {
      if (!collection) {
        return null;
      }
      const field = collection.fields.find(
        (entry) => entry.name === selection.field,
      );
      if (field) {
        if (collection.sourceKind === "materialized-view") {
          return (
            <MaterializedFieldForm
              key={`${collection.name}:${field.name}`}
              collection={collection.name}
              field={field}
              container={container}
              {...callbacks}
            />
          );
        }
        return (
          <FieldEditorForm
            key={`${collection.name}:${field.name}`}
            collections={collections}
            collection={collection.name}
            field={field}
            portalContainer={container}
            {...callbacks}
          />
        );
      }
      if (collection.sourceKind === "materialized-view" || selection.field) {
        return null;
      }
      if (!selection.choice) {
        return (
          <FieldTypePicker
            onSelect={(choice) =>
              onSelect({ kind: "field", collection: collection.name, choice })
            }
          />
        );
      }
      const onBack = () =>
        onLeave(() => onSelect({ kind: "field", collection: collection.name }));
      if (isRelationChoice(selection.choice)) {
        return (
          <RelationCreateForm
            key={`${collection.name}:${selection.choice}`}
            collection={collection.name}
            collections={collections}
            kind={selection.choice}
            portalContainer={container}
            {...callbacks}
            onBack={onBack}
          />
        );
      }
      return (
        <FieldEditorForm
          key={`${collection.name}:${selection.choice}`}
          collections={collections}
          collection={collection.name}
          type={selection.choice}
          portalContainer={container}
          {...callbacks}
          onBack={onBack}
        />
      );
    }
  }
}
