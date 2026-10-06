"use client";
import { useState } from "react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/api-request";
import { useUiCopy } from "@/lib/ui-copy";
import { useEditorState } from "./editor-lifecycle";

export function SystemFieldDelete({
  collection,
  field,
  onDeleted,
  onCancel,
}: {
  collection: string;
  field: string;
  onDeleted: () => void;
  onCancel: () => void;
}) {
  const copy = useUiCopy();
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEditorState(false, pending);
  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (confirmation !== field || pending) {
          return;
        }
        setPending(true);
        setError("");
        try {
          await apiRequest(
            `/api/system-collections/${collection}/fields/${encodeURIComponent(field)}`,
            "DELETE",
          );
          onDeleted();
        } catch (cause) {
          setError((cause as Error).message);
        } finally {
          setPending(false);
        }
      }}
    >
      <p className="text-sm text-muted-foreground">
        {copy(
          "Поле и его значения будут удалены из всех записей. Это действие нельзя отменить.",
        )}
      </p>
      <Label htmlFor="confirm-system-field">
        {copy("Введите имя поля для подтверждения")}: <code>{field}</code>
      </Label>
      <Input
        id="confirm-system-field"
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        disabled={pending}
        autoComplete="off"
      />
      {error && (
        <p
          role="alert"
          className="text-sm text-destructive"
        >
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          variant="destructive"
          disabled={pending || confirmation !== field}
        >
          {copy("Удалить поле")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={pending}
        >
          {copy("Отмена")}
        </Button>
      </div>
    </form>
  );
}
