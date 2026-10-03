"use client";

import { useEditorState } from "./editor-lifecycle";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@asmblyr/kit/ui/button";
import { Input } from "@asmblyr/kit/ui/input";
import { Label } from "@/components/ui/label";

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

async function responseMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    if (body.message) return body.message;
  } catch {
    // An upstream error may not have a JSON body.
  }
  return "Не удалось выполнить операцию";
}

export function DeleteStructureForm({
  collection,
  field,
  onDeleted,
  onCancel,
}: DeleteStructureFormProps) {
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
        const response = await fetch(`${path}/impact`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(await responseMessage(response));
        const body = (await response.json()) as { data: DeleteImpact };
        setImpact(body.data);
      } catch (error) {
        if (!controller.signal.aborted) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Не удалось проверить данные",
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadImpact();
    return () => controller.abort();
  }, [path, retry]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!impact || confirmation !== target) return;
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(path, { method: "DELETE" });
      if (!response.ok) {
        setMessage(
          response.status === 409
            ? "Удаление заблокировано: в базе есть объекты, зависящие от этой структуры."
            : await responseMessage(response),
        );
        return;
      }
      onDeleted();
      router.refresh();
    } catch {
      setMessage("Не удалось связаться с сервером");
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
        <p className="font-medium">Удаление без восстановления</p>
        <p className="text-muted-foreground">
          {field
            ? impact?.virtual
              ? `Поле ${field} исчезнет из модели. Внешние ключи, промежуточная коллекция и данные останутся.`
              : `Поле ${field} и его значения во всех записях будут удалены.`
            : `Коллекция ${collection}, её таблица и все записи будут удалены.`}
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">
          Проверяем затрагиваемые данные…
        </p>
      ) : impact ? (
        <div className="space-y-1 rounded-xl border p-4 text-sm">
          <p>
            Записей в коллекции: <strong>{impact.itemCount}</strong>
          </p>
          {field && !impact.virtual && (
            <p>
              Значение поля есть у <strong>{impact.populatedCount}</strong>{" "}
              записей.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Числа получены на момент проверки.
          </p>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => setRetry((current) => current + 1)}
        >
          Повторить проверку
        </Button>
      )}

      <div className="space-y-2">
        <Label htmlFor="delete-confirmation">
          Для подтверждения введите {target}
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
          {message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          variant="destructive"
          disabled={pending || !impact || confirmation !== target}
        >
          {pending ? "Удаляем…" : field ? "Удалить поле" : "Удалить коллекцию"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={onCancel}
        >
          Отмена
        </Button>
      </div>
    </form>
  );
}
