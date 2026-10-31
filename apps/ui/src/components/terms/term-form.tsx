"use client";

import { useState, type FormEvent } from "react";
import type {
  TermDefinition,
  TermInput,
} from "@asmblyr-collaborative/contracts";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { Label } from "@asmblyr-collaborative/kit/ui/label";
import { Textarea } from "@asmblyr-collaborative/kit/ui/textarea";
import { Switch } from "@asmblyr-collaborative/kit/ui/switch";
import { useEditorState } from "@/components/ui/editor-lifecycle";
import { apiRequest } from "@/lib/api-request";
import { localizedRequestError } from "@/lib/http-request";
import { useUiCopy } from "@/lib/ui-copy";

export function TermForm({
  readOnly = false,
  term,
  onSaved,
}: {
  readOnly?: boolean;
  term: TermDefinition | null;
  onSaved: (term: TermDefinition) => void;
}) {
  const copy = useUiCopy();

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
      const savedTerm = await apiRequest<TermDefinition>(
        term ? `/api/settings/terms/${term.id}` : "/api/settings/terms",
        term ? "PUT" : "POST",
        input,
      );
      onSaved(savedTerm);
    } catch (cause) {
      setError(
        localizedRequestError(cause, copy, "Не удалось сохранить термин"),
      );
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
          <Label htmlFor="term-name">{copy("Название")}</Label>
          <Input
            id="term-name"
            required
            maxLength={80}
            value={values.name}
            placeholder={copy("Например, Активные")}
            onChange={(event) =>
              setValues({ ...values, name: event.target.value })
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="term-aliases">{copy("Синонимы")}</Label>
          <Input
            id="term-aliases"
            value={values.aliases}
            maxLength={984}
            placeholder={copy("активный, действующие, active")}
            onChange={(event) =>
              setValues({ ...values, aliases: event.target.value })
            }
          />
          <p className="text-xs text-muted-foreground">
            {copy(
              "До 12 вариантов через запятую. Помогают понимать формулировки пользователя.",
            )}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="term-description">{copy("Общее определение")}</Label>
          <Textarea
            id="term-description"
            required
            rows={5}
            maxLength={1000}
            value={values.description}
            placeholder={copy(
              "Что означает термин в вашей предметной области.",
            )}
            onChange={(event) =>
              setValues({ ...values, description: event.target.value })
            }
          />
          <p className="text-xs leading-5 text-muted-foreground">
            {copy(
              "Точные условия задаются отдельно: настройки коллекции → MCP → Термины. Изменение определения не меняет сохранённые фильтры.",
            )}
          </p>
        </div>
        <div className="flex items-start justify-between gap-4 rounded-xl border p-4">
          <div className="space-y-1.5">
            <Label htmlFor="term-enabled">{copy("Использовать термин")}</Label>
            <p className="text-xs text-muted-foreground">
              {copy(
                "Выключенный термин недоступен ассистенту. Условия в коллекциях сохраняются.",
              )}
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
          {busy ? copy("Сохранение…") : copy("Сохранить термин")}
        </Button>
      )}
    </form>
  );
}
