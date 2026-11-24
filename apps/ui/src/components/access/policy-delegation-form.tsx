"use client";

import { useState, type FormEvent } from "react";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@asmblyr-collaborative/kit/ui/badge";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Checkbox } from "@asmblyr-collaborative/kit/ui/checkbox";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { accessRequest } from "@/lib/access-request";
import { useUiCopy } from "@/lib/ui-copy";
import {
  accessText,
  localizeAccessError,
  matchesAccessSearch,
} from "./access-helpers";
import type { Policy } from "./types";

export function PolicyDelegationForm({
  userId,
  policies,
  initialIds,
  delegatingPolicyIds = [],
  editable,
  onDirty,
  onBusy,
  onSaved,
}: {
  userId: string;
  policies: Policy[];
  initialIds: string[];
  delegatingPolicyIds?: string[];
  editable: boolean;
  onDirty: (dirty: boolean) => void;
  onBusy: (busy: boolean) => void;
  onSaved: (ids: string[]) => void;
}) {
  const copy = useUiCopy();

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
      setMessage(copy("Разрешённый набор сохранён"));
    } catch (cause) {
      setError(localizeAccessError((cause as Error).message));
    } finally {
      setPending(false);
      onBusy(false);
    }
  }

  const delegatingSet = new Set(delegatingPolicyIds);
  const escalatedPolicies = policies.filter(
    (policy) => selected.includes(policy.id) && delegatingSet.has(policy.id),
  );
  const shown = policies.filter(
    (policy) =>
      matchesAccessSearch([policy.name], search) &&
      (editable || selected.includes(policy.id)),
  );

  return (
    <section className="space-y-3">
      <div>
        <h3 className="font-semibold">{copy("Разрешено назначать")}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {copy(
            "Готовые политики для других пользователей и сервисов. Нужен доступ к изменению соответствующего раздела настроек. Этот список не назначает политики самому пользователю.",
          )}
        </p>
      </div>
      <form
        onSubmit={save}
        className="space-y-3"
      >
        {editable && (
          <Input
            aria-label={copy("Найти политику для делегирования")}
            placeholder={copy("Найти политику…")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        )}
        {editable && escalatedPolicies.length > 0 && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-950 dark:text-amber-200"
          >
            <AlertTriangle
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
            />
            <p className="leading-relaxed">
              {accessText(
                copy.locale,
                `Внимание: в набор делегирования включена политика с правами управления доступом (${escalatedPolicies.map((policy) => policy.name).join(", ")}). Это позволяет передавать административные права другим пользователям и создаёт риск повышения привилегий.`,
                `Warning: the delegation set includes a policy with access management permissions (${escalatedPolicies.map((policy) => policy.name).join(", ")}). This allows granting administrative rights to others and creates a privilege escalation risk.`,
              )}
            </p>
          </div>
        )}
        <div className="max-h-60 divide-y overflow-y-auto rounded-lg border">
          {shown.map((policy) => (
            <label
              key={policy.id}
              className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
            >
              <span className="flex min-w-0 items-center gap-3">
                <Checkbox
                  checked={selected.includes(policy.id)}
                  disabled={!editable || pending}
                  onCheckedChange={(checked) =>
                    toggle(policy.id, checked === true)
                  }
                />
                <span className="min-w-0 break-words">{policy.name}</span>
              </span>
              {delegatingSet.has(policy.id) && (
                <Badge
                  variant="outline"
                  className="shrink-0 text-[11px]"
                >
                  {accessText(
                    copy.locale,
                    "Управление доступом",
                    "Access management",
                  )}
                </Badge>
              )}
            </label>
          ))}
          {!shown.length && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              {search
                ? copy("Политики не найдены")
                : copy("Назначение политик не разрешено")}
            </p>
          )}
        </div>
        {error && (
          <p
            role="alert"
            className="text-sm text-destructive"
          >
            {copy(error)}
          </p>
        )}
        {editable && (
          <Button
            type="submit"
            size="sm"
            disabled={pending || !dirty}
          >
            {pending
              ? copy("Сохранение…")
              : copy("Сохранить разрешённый набор")}
          </Button>
        )}
        {message && (
          <p
            role="status"
            className="text-xs text-muted-foreground"
          >
            {copy(message)}
          </p>
        )}
      </form>
    </section>
  );
}
