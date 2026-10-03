"use client";

import { useState, type FormEvent } from "react";
import { Checkbox } from "@asmblyr/kit/ui/checkbox";
import { Button } from "@asmblyr/kit/ui/button";
import { Input } from "@asmblyr/kit/ui/input";
import { accessRequest } from "@/lib/access-request";
import type { Policy } from "./types";

export function PolicyDelegationForm({
  userId,
  policies,
  initialIds,
  editable,
  onDirty,
  onBusy,
  onSaved,
}: {
  userId: string;
  policies: Policy[];
  initialIds: string[];
  editable: boolean;
  onDirty: (dirty: boolean) => void;
  onBusy: (busy: boolean) => void;
  onSaved: (ids: string[]) => void;
}) {
  const [selected, setSelected] = useState(initialIds);
  const [saved, setSaved] = useState(initialIds);
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const dirty =
    JSON.stringify([...selected].sort()) !== JSON.stringify([...saved].sort());

  function toggle(id: string, checked: boolean) {
    const next = checked
      ? [...selected, id]
      : selected.filter((value) => value !== id);
    setSelected(next);
    setMessage("");
    onDirty(
      JSON.stringify([...next].sort()) !== JSON.stringify([...saved].sort()),
    );
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editable || pending || !dirty) {
      return;
    }
    setPending(true);
    onBusy(true);
    setError("");
    try {
      const result = await accessRequest<{ data: { policyIds: string[] } }>(
        `/users/${userId}/delegation`,
        "PUT",
        { policyIds: selected },
      );
      setSelected(result.data.policyIds);
      setSaved(result.data.policyIds);
      onSaved(result.data.policyIds);
      onDirty(false);
      setMessage("Разрешённый набор сохранён");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setPending(false);
      onBusy(false);
    }
  }

  const shown = policies.filter(
    (policy) =>
      policy.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()) &&
      (editable || selected.includes(policy.id)),
  );
  return (
    <section className="space-y-3">
      <div>
        <h3 className="font-semibold">Разрешено назначать</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Готовые политики для других пользователей и сервисов. Нужен доступ к
          изменению соответствующего раздела настроек. Этот список не назначает
          политики самому пользователю.
        </p>
      </div>
      <form
        onSubmit={save}
        className="space-y-3"
      >
        {editable && (
          <Input
            aria-label="Найти политику для делегирования"
            placeholder="Найти политику…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        )}
        <div className="max-h-60 overflow-y-auto rounded-lg border divide-y">
          {shown.map((policy) => (
            <label
              key={policy.id}
              className="flex items-center gap-3 px-3 py-2 text-sm"
            >
              <Checkbox
                checked={selected.includes(policy.id)}
                disabled={!editable || pending}
                onCheckedChange={(checked) =>
                  toggle(policy.id, checked === true)
                }
              />
              <span className="min-w-0 break-words">{policy.name}</span>
            </label>
          ))}
          {!shown.length && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              {search
                ? "Политики не найдены"
                : "Назначение политик не разрешено"}
            </p>
          )}
        </div>
        {error && (
          <p
            role="alert"
            className="text-sm text-destructive"
          >
            {error}
          </p>
        )}
        {editable && (
          <Button
            type="submit"
            size="sm"
            disabled={pending || !dirty}
          >
            {pending ? "Сохранение…" : "Сохранить разрешённый набор"}
          </Button>
        )}
        {message && (
          <p
            role="status"
            className="text-xs text-muted-foreground"
          >
            {message}
          </p>
        )}
      </form>
    </section>
  );
}
