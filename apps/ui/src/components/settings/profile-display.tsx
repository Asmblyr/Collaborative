"use client";

import { useEffect, useState } from "react";
import type {
  ProfileDisplayResult,
  ProfileDisplayValue,
} from "@asmblyr-collaborative/contracts";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { apiRequest } from "@/lib/api-request";
import { useUiCopy } from "@/lib/ui-copy";

function DisplayValue({ entry }: { entry: ProfileDisplayValue }) {
  const copy = useUiCopy();
  if (entry.value === null || entry.value === "") {
    return (
      <span className="font-normal text-muted-foreground">
        {copy("Не указано")}
      </span>
    );
  }
  if (entry.type === "tags" && Array.isArray(entry.value)) {
    return (
      <div className="flex flex-wrap gap-1">
        {entry.value.map((tag, index) => (
          <Badge
            key={`${index}-${tag}`}
            variant="secondary"
            className="max-w-full whitespace-normal break-words"
          >
            {tag}
          </Badge>
        ))}
      </div>
    );
  }
  if (entry.type === "user") {
    const name = String(entry.value);
    const initials = name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
    return (
      <div className="flex items-center gap-2">
        <Avatar className="size-7">
          <AvatarFallback className="bg-primary/10 text-[10px] text-primary">
            {initials}
          </AvatarFallback>
        </Avatar>
        <span className="min-w-0 break-words">{name}</span>
      </div>
    );
  }
  if (entry.type === "boolean") {
    return <span>{entry.value ? copy("Да") : copy("Нет")}</span>;
  }
  if (entry.type === "date" || entry.type === "datetime") {
    const date = new Date(String(entry.value));
    if (!Number.isNaN(date.getTime())) {
      return (
        <span>
          {entry.type === "date"
            ? date.toLocaleDateString(copy.locale, { timeZone: "UTC" })
            : date.toLocaleString(copy.locale)}
        </span>
      );
    }
  }
  return (
    <span className="whitespace-pre-wrap break-words">
      {String(entry.value)}
    </span>
  );
}

export function ProfileDisplay({
  userId,
  compact = false,
}: {
  userId?: string;
  compact?: boolean;
}) {
  const copy = useUiCopy();
  const [result, setResult] = useState<ProfileDisplayResult | null>(null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setRevision((current) => current + 1);
    window.addEventListener("profile-display-updated", refresh);
    return () => window.removeEventListener("profile-display-updated", refresh);
  }, []);
  useEffect(() => {
    let active = true;
    apiRequest<ProfileDisplayResult>(
      `/api/users/${userId ?? "me"}/profile-display`,
    )
      .then((data) => {
        if (active) {
          setResult(data);
          setError(false);
        }
      })
      .catch(() => {
        if (active) {
          setError(true);
        }
      });
    return () => {
      active = false;
    };
  }, [userId, revision]);
  if (error) {
    return (
      <div
        className="mt-5 text-xs text-muted-foreground"
        role="alert"
      >
        <p>{copy("Не удалось загрузить информацию профиля")}</p>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setRevision((current) => current + 1)}
        >
          {copy("Повторить")}
        </Button>
      </div>
    );
  }
  if (!result?.entries.length) {
    return null;
  }
  return (
    <section
      aria-label={result.title || copy("Дополнительная информация")}
      className={
        compact ? "mt-5 border-t pt-5" : "rounded-xl border bg-muted/20 p-4"
      }
    >
      <h3 className="mb-4 text-xs font-medium text-muted-foreground">
        {result.title || copy("Дополнительная информация")}
      </h3>
      <dl
        className={
          compact ? "space-y-4" : "grid grid-cols-1 gap-4 sm:grid-cols-2"
        }
      >
        {result.entries.map((entry) => (
          <div
            key={entry.id}
            className="min-w-0 space-y-1.5"
          >
            <dt className="text-xs text-muted-foreground">{entry.label}</dt>
            <dd className="text-sm font-medium [overflow-wrap:anywhere]">
              <DisplayValue entry={entry} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
