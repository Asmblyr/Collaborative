"use client";

import { useEditorState } from "./editor-lifecycle";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { Label } from "@/components/ui/label";
import { useUiCopy } from "@/lib/ui-copy";
import {
  HttpError,
  requestErrorMessage,
  requestJson,
} from "@/lib/http-request";

interface DeleteImpact {
  itemCount: string;
  populatedCount?: string;
  virtual?: boolean;
}

interface DeleteStructureFormProps {
  collection: string;
  field?: string;
  onDeleted: () => void;
  onCancel: () => void;
}

export function DeleteStructureForm({
  collection,
  field,
  onDeleted,
  onCancel,
}: DeleteStructureFormProps) {
  const copy = useUiCopy();

  const router = useRouter();
  const [impact, setImpact] = useState<DeleteImpact | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  useEditorState(false, pending);
  const target = field ?? collection;
  const path =
    `/api/collections/${encodeURIComponent(collection)}` +
    (field ? `/fields/${encodeURIComponent(field)}` : "");

  useEffect(() => {
    const controller = new AbortController();
    async function loadImpact() {
      setLoading(true);
      setImpact(null);
      setMessage("");
      try {
        const body = await requestJson<{ data: DeleteImpact }>(
          `${path}/impact`,
          "GET",
          undefined,
          controller.signal,
        );
        setImpact(body.data);
      } catch (error) {
        if (!controller.signal.aborted) {
          setMessage(copy(requestErrorMessage(error)));
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadImpact();
    return () => controller.abort();
  }, [path, retry, copy]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!impact || confirmation !== target) return;
    setPending(true);
    setMessage("");
    try {
      await requestJson(path, "DELETE");
      onDeleted();
      router.refresh();
    } catch (cause) {
      setMessage(
        cause instanceof HttpError && cause.status === 409
          ? copy(
              "Удаление заблокировано: в базе есть объекты, зависящие от этой структуры.",
            )
          : copy(requestErrorMessage(cause)),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-6"
    >
      <div className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
        <p className="font-medium">{copy("Удаление без восстановления")}</p>
        <p className="text-muted-foreground">
          {field
            ? impact?.virtual
              ? copy(
                  "Поле {{value0}} исчезнет из модели. Внешние ключи, промежуточная коллекция и данные останутся.",
                  { value0: field },
                )
              : copy(
                  "Поле {{value0}} и его значения во всех записях будут удалены.",
                  { value0: field },
                )
            : copy(
                "Коллекция {{value0}}, её таблица и все записи будут удалены.",
                { value0: collection },
              )}
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">
          {copy("Проверяем затрагиваемые данные… ")}
        </p>
      ) : impact ? (
        <div className="space-y-1 rounded-xl border p-4 text-sm">
          <p>
            {copy("Записей в коллекции: ")}
            <strong>{impact.itemCount}</strong>
          </p>
          {field && !impact.virtual && (
            <p>
              {copy("Значение поля есть у ")}
              <strong>{impact.populatedCount}</strong> {copy("записей. ")}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {copy("Числа получены на момент проверки. ")}
          </p>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => setRetry((current) => current + 1)}
        >
          {copy("Повторить проверку ")}
        </Button>
      )}

      <div className="space-y-2">
        <Label htmlFor="delete-confirmation">
          {copy("Для подтверждения введите ")}
          {target}
        </Label>
        <Input
          id="delete-confirmation"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          disabled={pending || !impact}
          className="h-10 font-mono"
        />
      </div>

      {message && (
        <p
          role="status"
          className="text-sm text-destructive"
        >
          {copy(message)}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          variant="destructive"
          disabled={pending || !impact || confirmation !== target}
        >
          {pending
            ? copy("Удаляем…")
            : field
              ? copy("Удалить поле")
              : copy("Удалить коллекцию")}
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
