"use client";

import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Badge } from "@/components/ui/badge";
import { useUiCopy } from "@/lib/ui-copy";
import type { ServiceKey } from "./types";

export function ServiceKeyCard({
  serviceKey,
  readOnly,
  pending,
  secretVisible,
  confirming,
  onConfirm,
  onRevoke,
}: {
  serviceKey: ServiceKey;
  readOnly: boolean;
  pending: boolean;
  secretVisible: boolean;
  confirming: boolean;
  onConfirm: (confirm: boolean) => void;
  onRevoke: () => void;
}) {
  const copy = useUiCopy();
  const locale = copy.locale === "en" ? "en-US" : "ru-RU";
  const expired = new Date(serviceKey.expiresAt) <= new Date();
  let status = copy("Действует");
  if (serviceKey.revokedAt) {
    status = copy("Отозван");
  } else if (expired) {
    status = copy("Истёк");
  }
  const timestamp = (value: string) => (
    <time dateTime={value}>
      {new Date(value).toLocaleString(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      })}
    </time>
  );

  return (
    <section className="space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="break-all text-sm font-medium">{serviceKey.name}</h4>
        <Badge variant="secondary">{status}</Badge>
      </div>
      <code className="text-xs text-muted-foreground">
        {serviceKey.prefix}…
      </code>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-3 text-xs sm:grid-cols-2">
        <div className="space-y-1">
          <dt className="text-muted-foreground">{copy("Выпущен")}</dt>
          <dd>{timestamp(serviceKey.createdAt)}</dd>
        </div>
        <div className="space-y-1">
          <dt className="text-muted-foreground">{copy("Действует до")}</dt>
          <dd>{timestamp(serviceKey.expiresAt)}</dd>
        </div>
        <div className="space-y-1">
          <dt className="text-muted-foreground">
            {copy("Последняя активность")}
          </dt>
          <dd>
            {serviceKey.lastActivityAt
              ? timestamp(serviceKey.lastActivityAt)
              : copy("ещё не использован")}
          </dd>
        </div>
        <div className="space-y-1">
          <dt className="text-muted-foreground">{copy("Обращения к API")}</dt>
          <dd className="tabular-nums">
            {BigInt(serviceKey.requestCount).toLocaleString(locale)}
          </dd>
        </div>
      </dl>
      {!readOnly && !serviceKey.revokedAt && !expired && (
        <div className="flex flex-wrap items-center gap-2">
          {confirming ? (
            <>
              <p className="w-full text-xs text-destructive">
                {copy(
                  "Выданные по этому ключу токены сразу перестанут работать. ",
                )}
              </p>
              <Button
                size="sm"
                variant="destructive"
                disabled={pending || secretVisible}
                onClick={onRevoke}
              >
                {copy("Подтвердить отзыв ")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => onConfirm(false)}
              >
                {copy("Отмена ")}
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={pending || secretVisible}
              onClick={() => onConfirm(true)}
            >
              {copy("Отозвать ключ ")}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
