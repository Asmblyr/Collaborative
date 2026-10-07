"use client";

import { useState, type FormEvent } from "react";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr-collaborative/kit/ui/select";
import { Label } from "@/components/ui/label";
import type { Collection } from "@/components/items/types";
import { apiRequest } from "@/lib/api-request";
import { useUiCopy } from "@/lib/ui-copy";
import { useEditorDraft } from "./editor-lifecycle";
import { NameInput } from "./relation-name-input";

export function SystemRelationForm({
  collection,
  catalog,
  container,
  onSaved,
  onCancel,
  onBack,
}: {
  collection: string;
  catalog: Collection[];
  container: HTMLElement | null;
  onSaved(): void;
  onCancel(): void;
  onBack(): void;
}) {
  const copy = useUiCopy();
  const router = useRouter();
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [target, setTarget] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const targets = catalog.filter(
    (entry) =>
      !entry.system &&
      !/^(asmblyr_|plugin_)/i.test(entry.name) &&
      entry.sourceKind !== "materialized-view" &&
      entry.mode === "multiple",
  );
  useEditorDraft({ name, label, target }, pending);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !target) {
      return;
    }
    setPending(true);
    setError("");
    try {
      await apiRequest(
        `/api/system-collections/${collection}/fields/${encodeURIComponent(name)}/configuration`,
        "POST",
        {
          field: { name, type: "relation", targetCollection: target },
          presentation: { label },
        },
      );
      onSaved();
      router.refresh();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-5"
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ml-2"
        disabled={pending}
        onClick={onBack}
      >
        <ArrowLeft aria-hidden="true" />
        {copy(" К выбору типа ")}
      </Button>
      <fieldset
        disabled={pending}
        className="space-y-5"
      >
        <NameInput
          id="system-relation-name"
          label={copy("Имя поля")}
          value={name}
          onChange={setName}
          required
          hint={copy("Строчные латинские буквы, цифры и подчёркивание. ")}
        />
        <div className="space-y-2">
          <Label htmlFor="system-relation-label">
            {copy("Отображаемое название")}
          </Label>
          <Input
            id="system-relation-label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={120}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="system-relation-target">
            {copy("Связанная коллекция")}
          </Label>
          <Select
            value={target}
            onValueChange={setTarget}
            disabled={pending || !targets.length}
          >
            <SelectTrigger
              id="system-relation-target"
              className="w-full"
            >
              <SelectValue placeholder={copy("Выберите коллекцию")} />
            </SelectTrigger>
            <SelectContent container={container}>
              {targets.map((entry) => (
                <SelectItem
                  key={entry.name}
                  value={entry.name}
                >
                  {entry.displayName || entry.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!targets.length && (
            <p className="text-xs text-muted-foreground">
              {copy(
                "Сначала создайте обычную коллекцию для связанных записей.",
              )}
            </p>
          )}
        </div>
      </fieldset>
      <p className="text-sm text-muted-foreground">
        {copy(
          "Выбор одной записи. Если связанную запись удалить, поле очистится. Системная запись останется.",
        )}
      </p>
      {error && (
        <p
          role="alert"
          className="text-sm text-destructive"
        >
          {copy(error)}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="submit"
          disabled={pending || !target}
        >
          {pending ? copy("Создаём…") : copy("Создать связь")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={onCancel}
        >
          {copy("Отмена ")}
        </Button>
      </div>
    </form>
  );
}
