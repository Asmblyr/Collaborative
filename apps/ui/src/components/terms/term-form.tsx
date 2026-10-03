"use client";

import { useState, type FormEvent } from "react";
import type { TermDefinition, TermInput } from "@asmblyr/contracts";
import { Button } from "@asmblyr/kit/ui/button";
import { Input } from "@asmblyr/kit/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@asmblyr/kit/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useEditorState } from "@/components/collections/editor-lifecycle";

export function TermForm({
  readOnly = false,
  term,
  onSaved,
}: {
  readOnly?: boolean;
  term: TermDefinition | null;
  onSaved: (term: TermDefinition) => void;
}) {
  const initial = {
    name: term?.name ?? "",
    description: term?.description ?? "",
    aliases: term?.aliases.join(", ") ?? "",
    enabled: term?.enabled ?? true,
  };
  const [values, setValues] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  useEditorState(dirty, busy);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly || busy) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const input: TermInput = {
        ...values,
        aliases: values.aliases
          .split(",")
          .map((word) => word.trim())
          .filter(Boolean),
      };
      const response = await fetch(
        term ? `/api/settings/terms/${term.id}` : "/api/settings/terms",
        {
          method: term ? "PUT" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.message ?? "Не удалось сохранить термин");
      onSaved(body.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ошибка соединения");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      className="space-y-6"
    >
      <fieldset
        disabled={busy || readOnly}
        className="space-y-6"
      >
        <div className="space-y-2">
          <Label htmlFor="term-name">Название</Label>
          <Input
            id="term-name"
            required
            maxLength={80}
            value={values.name}
            placeholder="Например, Активные"
            onChange={(event) =>
              setValues({ ...values, name: event.target.value })
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="term-aliases">Синонимы</Label>
          <Input
            id="term-aliases"
            value={values.aliases}
            maxLength={984}
            placeholder="активный, действующие, active"
            onChange={(event) =>
              setValues({ ...values, aliases: event.target.value })
            }
          />
          <p className="text-xs text-muted-foreground">
            До 12 вариантов через запятую. Помогают понимать формулировки
            пользователя.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="term-description">Общее определение</Label>
          <Textarea
            id="term-description"
            required
            rows={5}
            maxLength={1000}
            value={values.description}
            placeholder="Что означает термин в вашей предметной области."
            onChange={(event) =>
              setValues({ ...values, description: event.target.value })
            }
          />
          <p className="text-xs leading-5 text-muted-foreground">
            Точные условия задаются отдельно: настройки коллекции → MCP →
            Термины. Изменение определения не меняет сохранённые фильтры.
          </p>
        </div>
        <div className="flex items-start justify-between gap-4 rounded-xl border p-4">
          <div className="space-y-1.5">
            <Label htmlFor="term-enabled">Использовать термин</Label>
            <p className="text-xs text-muted-foreground">
              Выключенный термин недоступен ассистенту. Условия в коллекциях
              сохраняются.
            </p>
          </div>
          <Switch
            id="term-enabled"
            checked={values.enabled}
            onCheckedChange={(enabled) => setValues({ ...values, enabled })}
          />
        </div>
      </fieldset>
      {error && (
        <p
          role="alert"
          className="text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {!readOnly && (
        <Button
          type="submit"
          disabled={busy || (!dirty && !!term)}
        >
          {busy ? "Сохранение…" : "Сохранить термин"}
        </Button>
      )}
    </form>
  );
}
