"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { CollectionField } from "@/components/items/types";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { FieldPresentationSettings } from "./field-presentation-settings";
import { defaultPresentation } from "./field-presentation-defaults";
import { useEditorState } from "./editor-lifecycle";
import { apiRequest } from "@/lib/api-request";
import { useUiCopy } from "@/lib/ui-copy";

export function MaterializedFieldForm({
  collection,
  field,
  container,
  onSaved,
  onCancel,
}: {
  collection: string;
  field: CollectionField;
  container: HTMLElement | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const copy = useUiCopy();
  const router = useRouter();
  const initial = { ...defaultPresentation, ...field.presentation };
  const [presentation, setPresentation] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const dirty = JSON.stringify(presentation) !== JSON.stringify(initial);
  useEditorState(dirty, pending);
  async function save(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await apiRequest(
        `/api/collections/${encodeURIComponent(collection)}/fields/${encodeURIComponent(field.name)}/presentation`,
        "PUT",
        presentation,
      );
      router.refresh();
      onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : copy("Не удалось сохранить настройки"),
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <form
      className="space-y-5"
      onSubmit={save}
    >
      <div>
        <p className="font-mono text-sm">
          {field.name} · {field.type}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {copy(
            "Физическая структура представления доступна только для просмотра.",
          )}
        </p>
      </div>
      <FieldPresentationSettings
        value={presentation}
        type={field.type}
        disabled={pending}
        portalContainer={container}
        onChange={setPresentation}
      />
      {error && (
        <p
          role="alert"
          className="text-sm text-destructive"
        >
          {copy(error)}
        </p>
      )}
      <div className="flex gap-2 border-t pt-4">
        <Button
          type="submit"
          disabled={!dirty || pending}
        >
          {copy("Сохранить")}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={pending}
        >
          {copy("Отмена")}
        </Button>
      </div>
    </form>
  );
}
